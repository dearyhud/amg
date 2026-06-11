# frozen_string_literal: true

require "rack"

module AMG
  module MCP
    # The data plane: a single MCP server endpoint speaking JSON-RPC over
    # streamable HTTP (POST). Bare Rack — no framework between agents and
    # the policy engine.
    class App
      MAX_BODY_BYTES = 1 << 20 # 1 MiB; oversized payloads are rejected outright

      def initialize(authenticator:, registry:, router:, audit:, rate_limiter:, approval_gate:, path: "/mcp")
        @authenticator = authenticator
        @registry = registry
        @router = router
        @audit = audit
        @rate_limiter = rate_limiter
        @approval_gate = approval_gate
        @path = path
      end

      def call(env)
        req = Rack::Request.new(env)
        return plain(404, "not found") unless req.path == @path
        return plain(405, "method not allowed") unless req.post?

        body = req.body.read(MAX_BODY_BYTES + 1).to_s
        return plain(413, "payload too large") if body.bytesize > MAX_BODY_BYTES

        request_id = SecureRandom.uuid

        payload = JSON.parse(body)
        identity = @authenticator.call(bearer_token(req))
        rpc = JsonRpc.parse(payload)

        response = dispatch(rpc, identity, request_id)
        return [202, { "x-request-id" => request_id }, []] if rpc.notification?

        json(200, response, request_id)
      rescue AuthError => e
        json(401, JsonRpc.unauthorized(e.message), request_id)
      rescue JsonRpc::InvalidRequest => e
        json(400, JsonRpc.error(nil, code: JsonRpc::INVALID_REQUEST, message: e.message), request_id)
      rescue JSON::ParserError
        json(400, JsonRpc.error(nil, code: JsonRpc::PARSE_ERROR, message: "parse error"), request_id)
      end

      private

      def dispatch(rpc, identity, request_id)
        case rpc.method
        when "initialize"
          JsonRpc.result(rpc, handshake(rpc))
        when "notifications/initialized", "notifications/cancelled"
          nil
        when "ping"
          JsonRpc.result(rpc, {})
        when "tools/list"
          ToolList.new(identity: identity, registry: @registry).call(rpc)
        when "tools/call"
          ToolCall.new(identity: identity, router: @router, audit: @audit,
                       rate_limiter: @rate_limiter, approval_gate: @approval_gate,
                       request_id: request_id).call(rpc)
        else
          rpc.notification? ? nil : JsonRpc.method_not_found(rpc)
        end
      end

      def handshake(rpc)
        {
          protocolVersion: rpc.params["protocolVersion"] || McpClient::PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "amg", version: AMG::VERSION }
        }
      end

      def bearer_token(req)
        auth = req.get_header("HTTP_AUTHORIZATION").to_s
        m = /\ABearer\s+(\S+)\z/.match(auth)
        raise AuthError, "missing bearer token" unless m

        m[1]
      end

      def json(status, body, request_id = nil)
        headers = { "content-type" => "application/json" }
        headers["x-request-id"] = request_id if request_id
        [status, headers, [JSON.generate(body)]]
      end

      def plain(status, message)
        [status, { "content-type" => "text/plain" }, [message]]
      end
    end
  end
end
