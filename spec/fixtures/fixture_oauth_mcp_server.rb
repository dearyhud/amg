require "puma"
require "puma/server"
require "rack"
require "json"
require "securerandom"
require "socket"
require "timeout"
require "uri"
require "digest"
require "base64"
require "mcp"
require "mcp/server/transports/streamable_http_transport"

module AMG
  module Spec
    # A combined fixture: a minimal OAuth 2.1 + PKCE + DCR authorization
    # server, and an MCP HTTP resource that requires a valid access token
    # from it. Used to prove AMG::Mcp::OAuthConnector drives a real
    # handshake end to end, not just against the gem's internals in
    # isolation.
    #
    # The /authorize endpoint auto-approves immediately (no login UI) and
    # redirects straight back with a code — standing in for "the admin logs
    # into the real third-party service and clicks Allow", which a test
    # can't drive without a headless browser and an account on a real
    # provider. Everything downstream of that (DCR, PKCE verification, code
    # exchange, token issuance, bearer enforcement) is real.
    class FixtureOAuthMcpServer
      attr_reader :port

      def self.start
        new.tap(&:start)
      end

      def start
        @port = pick_port
        @clients = {}
        @codes = {}
        @tokens = {}
        @mutex = Mutex.new
        @mcp_transport = build_mcp_transport

        events = Puma::Events.new
        @server = Puma::Server.new(method(:call), events)
        @server.add_tcp_listener("127.0.0.1", @port)
        @thread = Thread.new { @server.run.join }
        wait_until_listening
        self
      end

      def stop
        @server&.stop(true)
        @thread&.join(2)
      end

      def base_url
        "http://127.0.0.1:#{@port}"
      end

      def call(env)
        request = Rack::Request.new(env)
        case request.path
        when "/.well-known/oauth-protected-resource" then protected_resource_metadata
        when "/.well-known/oauth-authorization-server" then authorization_server_metadata
        when "/register" then register_client(request)
        when "/authorize" then authorize(request)
        when "/token" then token(request)
        when "/mcp" then mcp(request)
        else [404, {}, ["not found"]]
        end
      end

      private

      def build_mcp_transport
        tool = MCP::Tool.define(name: "whoami", description: "Only callable with a valid access token") do
          |server_context: nil|
          MCP::Tool::Response.new([{ type: "text", text: "authenticated" }])
        end
        server = MCP::Server.new(name: "fixture-oauth-mcp", tools: [tool])
        MCP::Server::Transports::StreamableHTTPTransport.new(server, stateless: true)
      end

      def protected_resource_metadata
        json(200, {
               "resource" => "#{base_url}/mcp",
               "authorization_servers" => [base_url]
             })
      end

      def authorization_server_metadata
        json(200, {
               "issuer" => base_url,
               "authorization_endpoint" => "#{base_url}/authorize",
               "token_endpoint" => "#{base_url}/token",
               "registration_endpoint" => "#{base_url}/register",
               "response_types_supported" => ["code"],
               "grant_types_supported" => %w[authorization_code refresh_token],
               "code_challenge_methods_supported" => ["S256"],
               "token_endpoint_auth_methods_supported" => %w[none client_secret_post]
             })
      end

      def register_client(request)
        body = JSON.parse(request.body.read)
        client_id = "client_#{SecureRandom.hex(8)}"
        @mutex.synchronize { @clients[client_id] = body }
        json(201, { "client_id" => client_id, "redirect_uris" => body["redirect_uris"] })
      end

      # Auto-approves: a real AS would render a login+consent page here. We
      # skip straight to "the admin said yes" and redirect with a code.
      def authorize(request)
        params = request.params
        code = "code_#{SecureRandom.hex(16)}"
        @mutex.synchronize do
          @codes[code] = {
            client_id: params["client_id"],
            redirect_uri: params["redirect_uri"],
            code_challenge: params["code_challenge"]
          }
        end

        redirect_uri = URI(params["redirect_uri"])
        query = URI.decode_www_form(redirect_uri.query.to_s).to_h
        query["code"] = code
        query["state"] = params["state"]
        redirect_uri.query = URI.encode_www_form(query)

        [302, { "Location" => redirect_uri.to_s }, []]
      end

      def token(request)
        params = Rack::Utils.parse_nested_query(request.body.read)
        case params["grant_type"]
        when "authorization_code" then exchange_code(params)
        when "refresh_token" then exchange_refresh_token(params)
        else json(400, { "error" => "unsupported_grant_type" })
        end
      end

      def exchange_code(params)
        pending = @mutex.synchronize { @codes.delete(params["code"]) }
        return json(400, { "error" => "invalid_grant" }) unless pending
        return json(400, { "error" => "invalid_grant" }) unless valid_pkce?(pending, params["code_verifier"])

        issue_tokens
      end

      def exchange_refresh_token(params)
        return json(400, { "error" => "invalid_grant" }) unless @mutex.synchronize do
          @tokens.key?(params["refresh_token"])
        end

        issue_tokens
      end

      def issue_tokens
        access_token = "access_#{SecureRandom.hex(16)}"
        refresh_token = "refresh_#{SecureRandom.hex(16)}"
        @mutex.synchronize { @tokens[refresh_token] = access_token }
        json(200, {
               "access_token" => access_token,
               "refresh_token" => refresh_token,
               "token_type" => "Bearer",
               "expires_in" => 3600
             })
      end

      def valid_pkce?(pending, code_verifier)
        return false unless code_verifier

        digest = Digest::SHA256.digest(code_verifier)
        computed = Base64.urlsafe_encode64(digest, padding: false)
        computed == pending[:code_challenge]
      end

      def mcp(request)
        token = bearer_token(request)
        return unauthorized unless token && @mutex.synchronize { @tokens.value?(token) }

        @mcp_transport.call(request.env)
      end

      def bearer_token(request)
        auth = request.get_header("HTTP_AUTHORIZATION")
        auth&.start_with?("Bearer ") ? auth.sub("Bearer ", "") : nil
      end

      def unauthorized
        [401, { "WWW-Authenticate" => %(Bearer resource_metadata="#{base_url}/.well-known/oauth-protected-resource") },
         []]
      end

      def json(status, body)
        [status, { "Content-Type" => "application/json" }, [body.to_json]]
      end

      def pick_port
        server = TCPServer.new("127.0.0.1", 0)
        port = server.addr[1]
        server.close
        port
      end

      def wait_until_listening
        Timeout.timeout(2) do
          loop do
            TCPSocket.new("127.0.0.1", @port).close
            break
          rescue Errno::ECONNREFUSED
            sleep 0.01
          end
        end
      end
    end
  end
end
