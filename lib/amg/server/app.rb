require "roda"
require "securerandom"
require_relative "../mcp/gateway"
require_relative "../rest_proxy/gateway"
require_relative "../store/queries"
require_relative "../admin/api"

module AMG
  module Server
    class App < Roda
      WEB_DIST = File.expand_path("../../../web/dist", __dir__)

      plugin :json
      plugin :json_parser
      plugin :error_handler
      plugin :all_verbs
      plugin :public, root: WEB_DIST

      error do |e|
        AMG.logger.error("amg: unhandled error: #{e.class}: #{e.message}")
        response.status = 500
        { error: "internal_error" }
      end

      route do |r|
        r.get "healthz" do
          db_ok = begin
            AMG.db.test_connection
            true
          rescue StandardError
            false
          end

          response.status = db_ok ? 200 : 503
          { status: db_ok ? "ok" : "unavailable" }
        end

        r.on "mcp", String do |slug|
          r.post do
            handle_mcp(request, slug)
          end
        end

        r.on "proxy", String do |slug|
          handle_proxy(request, slug)
        end

        r.on "api", "v1" do
          r.run Admin::Api
        end

        r.public

        r.get(/.*/) { spa_index }
      end

      private

      def spa_index
        index_path = File.join(WEB_DIST, "index.html")
        return response.write(File.read(index_path)) if File.exist?(index_path)

        response.status = 404
        { "error" => "not_found" }
      end

      def handle_mcp(req, slug)
        request_id = new_request_id
        rpc = req.params.is_a?(Hash) ? req.params : {}

        gateway = Mcp::Gateway.new(db: AMG.db, upstream_manager: AMG.upstream_manager, audit: AMG.audit)
        result = gateway.call(
          slug: slug,
          workspace_id: Store::Queries.default_workspace_id(AMG.db),
          agent_key: bearer_token,
          request_id: request_id,
          rpc: rpc
        )

        response.status = result.status
        result.body
      end

      def handle_proxy(req, slug)
        gateway = RestProxy::Gateway.new(db: AMG.db, audit: AMG.audit, master_key: AMG.config.master_key,
                                         rate_limiter: AMG.rate_limiter)
        result = gateway.call(**proxy_call_args(req, slug))

        response.status = result.status
        result.headers.each { |k, v| response.headers[k] = v }
        result.body
      end

      def proxy_call_args(req, slug)
        prefix = %r{\A/proxy/#{Regexp.escape(slug)}/?}
        {
          slug: slug,
          workspace_id: Store::Queries.default_workspace_id(AMG.db),
          agent_key: bearer_token,
          http_method: req.request_method,
          path: req.path.sub(prefix, ""),
          query: req.GET,
          content_type: req.content_type,
          raw_body: req.env["rack.input"]&.read.to_s,
          request_id: new_request_id
        }
      end

      def bearer_token
        auth = env["HTTP_AUTHORIZATION"]
        return nil unless auth&.start_with?("Bearer ")

        auth.sub("Bearer ", "")
      end

      def new_request_id
        "req_#{SecureRandom.hex(8)}"
      end
    end
  end
end
