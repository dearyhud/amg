# frozen_string_literal: true

module AMG
  module Upstream
    # Maps a namespaced tool to its upstream connection and injects the
    # brokered credential. Agents never see what flows through here.
    class Router
      def initialize(registry:, secrets:)
        @registry = registry
        @secrets = secrets
      end

      def forward(tool:, arguments:)
        server, tool_name = Tool.split(tool)
        upstream = @registry.fetch(server)

        case upstream.kind
        when "mcp"
          @registry.mcp_client(upstream).call_tool(tool_name, arguments)
        when "http"
          @registry.adapter(upstream).call(tool_name, arguments,
                                           credential: @secrets.read(upstream.vault_path))
        else
          raise UnknownUpstream, "unsupported upstream kind: #{upstream.kind.inspect}"
        end
      end
    end
  end
end
