require "mcp"
require "mcp/client"
require "mcp/client/oauth"
require_relative "../store/oauth_storage"
require_relative "../store/secrets"

module AMG
  module Mcp
    # Registry of shared upstream MCP client sessions, one per upstream
    # (system-design §3.1): lazy-connect on first request, tools/list cached
    # 60s.
    class UpstreamManager
      TOOLS_TTL = 60

      def initialize(db:, master_key:)
        @db = db
        @master_key = master_key
        @clients = {}
        @tool_cache = {}
        @mutex = Mutex.new
      end

      def client_for(upstream)
        @mutex.synchronize do
          @clients[upstream[:id]] ||= build_client(upstream)
        end
      end

      # Returns the upstream's full (unfiltered) tool list, cached for
      # TOOLS_TTL seconds per upstream.
      def tools(upstream)
        @mutex.synchronize do
          cached = @tool_cache[upstream[:id]]
          return cached[:tools] if cached && (monotonic_now - cached[:fetched_at]) < TOOLS_TTL
        end

        fetched = client_for(upstream).tools

        @mutex.synchronize do
          @tool_cache[upstream[:id]] = { tools: fetched, fetched_at: monotonic_now }
        end

        fetched
      end

      def call_tool(upstream, name, arguments)
        client_for(upstream).call_tool(name: name, arguments: arguments)
      end

      def shutdown
        @mutex.synchronize do
          @clients.each_value { |client| client.transport.close }
          @clients.clear
          @tool_cache.clear
        end
      end

      private

      def build_client(upstream)
        transport = case upstream[:kind]
                    when "mcp_stdio" then build_stdio_transport(upstream)
                    when "mcp_http" then build_http_transport(upstream)
                    else
                      raise ArgumentError, "unsupported upstream kind for MCP client: #{upstream[:kind]}"
                    end

        client = MCP::Client.new(transport: transport)
        client.connect
        client
      end

      def build_stdio_transport(upstream)
        config = upstream[:config]
        MCP::Client::Stdio.new(command: config["command"], args: Array(config["args"]), env: config["env"])
      end

      def build_http_transport(upstream)
        config = upstream[:config]
        storage = Store::OAuthStorage.new(db: @db, upstream_id: upstream[:id], master_key: @master_key)

        if storage.tokens
          MCP::Client::HTTP.new(url: config["url"], oauth: runtime_oauth_provider(storage))
        else
          headers = Store::Secrets.resolve(@db, upstream[:id], config["headers"] || {}, @master_key)
          MCP::Client::HTTP.new(url: config["url"], headers: headers)
        end
      end

      # Used only for token attachment/refresh on already-connected upstreams.
      # Never drives an interactive flow: if refresh fails and the gem falls
      # back to the full Authorization Code dance, that means this upstream's
      # connection is dead and needs an admin to reconnect it via the
      # console (POST /upstreams/:id/oauth/connect) — a live agent request
      # must fail loudly here, not block waiting on a browser that doesn't
      # exist in this process.
      def runtime_oauth_provider(storage)
        # Provider#initialize structurally validates redirect_uri (must be
        # https or loopback http) even though this one is never dereferenced
        # — redirect_handler always raises before Flow would use it in a request.
        no_interactive_flow_uri = "http://localhost/amg-runtime-no-interactive-flow"
        MCP::Client::OAuth::Provider.new(
          client_metadata: { redirect_uris: [no_interactive_flow_uri] },
          redirect_uri: no_interactive_flow_uri,
          redirect_handler: lambda { |_url|
            raise "amg: upstream OAuth connection expired; reconnect it from the admin console"
          },
          callback_handler: -> { raise "amg: upstream OAuth connection expired; reconnect it from the admin console" },
          storage: storage
        )
      end

      def monotonic_now
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end
  end
end
