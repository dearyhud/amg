# frozen_string_literal: true

module AMG
  module Upstream
    # Knows every configured upstream, owns their connections, and caches
    # the union of their tool lists (namespaced) for tools/list filtering
    # and compile-time tool validation.
    class Registry
      Entry = Struct.new(:name, :kind, :endpoint, :vault_path, keyword_init: true)

      HTTP_ADAPTERS = { "stripe" => HttpAdapters::Stripe }.freeze

      def initialize(db:, secrets:, tools_ttl: 60, http_adapters: HTTP_ADAPTERS, mcp_client_factory: nil)
        @db = db
        @secrets = secrets
        @tools_ttl = tools_ttl
        @http_adapters = http_adapters
        @mcp_client_factory = mcp_client_factory ||
                              ->(u) { McpClient.new(endpoint: u.endpoint, credential: read_credential(u)) }
        @mutex = Mutex.new
        @clients = {}
        @adapters = {}
        @tools_cache = nil
        @tools_cached_at = nil
      end

      def upstreams
        @upstreams ||= @db[:upstreams].all.to_h do |row|
          [row[:name], Entry.new(name: row[:name], kind: row[:kind],
                                 endpoint: row[:endpoint], vault_path: row[:vault_path])]
        end
      end

      def fetch(name)
        upstreams.fetch(name.to_s) { raise UnknownUpstream, "unknown upstream: #{name}" }
      end

      def mcp_client(upstream)
        @mutex.synchronize { @clients[upstream.name] ||= @mcp_client_factory.call(upstream) }
      end

      def adapter(upstream)
        klass = @http_adapters.fetch(upstream.name) do
          raise UnknownUpstream, "no http adapter registered for #{upstream.name}"
        end
        @mutex.synchronize { @adapters[upstream.name] ||= klass.new }
      end

      def all_tools
        @mutex.synchronize do
          if @tools_cache.nil? || (Time.now - @tools_cached_at) > @tools_ttl
            @tools_cache = collect_tools
            @tools_cached_at = Time.now
          end
          @tools_cache
        end
      end

      def tool_exists?(server, tool_name)
        namespaced = Tool.join(server, tool_name)
        all_tools.any? { |t| t[:name] == namespaced }
      end

      def reload!
        @mutex.synchronize do
          @upstreams = nil
          @tools_cache = nil
        end
      end

      private

      def read_credential(upstream)
        upstream.vault_path.to_s.empty? ? nil : @secrets.read(upstream.vault_path)
      end

      def collect_tools
        upstreams.values.flat_map do |upstream|
          defs =
            case upstream.kind
            when "mcp" then mcp_client_unlocked(upstream).list_tools
            when "http" then @http_adapters.fetch(upstream.name).tools
            else []
            end
          defs.map { |d| namespace_tool(upstream.name, d) }
        rescue UpstreamError, SecretNotFound
          # an unreachable upstream hides its tools (the safe direction);
          # it must not take down tools/list for every other upstream
          []
        end
      end

      def mcp_client_unlocked(upstream)
        @clients[upstream.name] ||= @mcp_client_factory.call(upstream)
      end

      def namespace_tool(server, definition)
        d = Util.deep_symbolize(definition)
        d.merge(name: Tool.join(server, d[:name]))
      end
    end
  end
end
