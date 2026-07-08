require "roda"
require_relative "session"
require_relative "contracts"
require_relative "../store/queries"
require_relative "../store/secrets"
require_relative "../crypto/api_key"
require_relative "../mcp/oauth_connector"
require_relative "policy_routes"

module AMG
  module Admin
    # Management plane (SPEC §11): /api/v1, JSON, session-cookie auth,
    # CSRF double-submit on mutations, owner/admin read-write, auditor
    # read-only.
    class Api < Roda
      include PolicyRoutes

      plugin :json
      plugin :json_parser
      plugin :cookies
      plugin :error_handler
      plugin :all_verbs
      plugin :halt

      SESSION_COOKIE = "amg_session".freeze
      CSRF_COOKIE = "amg_csrf".freeze
      CSRF_HEADER = "HTTP_X_AMG_CSRF".freeze
      WRITE_METHODS = %w[POST PUT PATCH DELETE].freeze
      AUDIT_EQ_FILTERS = { "agent_id" => :agent_id, "upstream_id" => :upstream_id, "decision" => :decision }.freeze

      error do |e|
        AMG.logger.error("amg: admin api error: #{e.class}: #{e.message}")
        response.status = 500
        { error: "internal_error" }
      end

      route do |r|
        r.on "auth" do
          r.post "login" do
            handle_login(r)
          end

          r.post "logout" do
            Session.destroy(AMG.db, session_token(r))
            response.delete_cookie(SESSION_COOKIE)
            response.delete_cookie(CSRF_COOKIE)
            { ok: true }
          end

          r.get "me" do
            admin = Session.current_admin(AMG.db, session_token(r))
            unless admin
              r.halt([401, { "Content-Type" => "application/json" },
                      [{ "error" => "unauthorized" }.to_json]])
            end

            serialize_admin(admin)
          end
        end

        # Public: the redirect target from a third-party authorization server,
        # hit directly by the admin's browser, not by console JS — it carries
        # no session cookie. `state` (checked inside oauth_callback) is the
        # only authentication this request has.
        r.get "upstreams", String, "oauth", "callback" do |id|
          oauth_callback(r, id)
        end

        admin = Session.current_admin(AMG.db, session_token(r))
        r.halt([401, { "Content-Type" => "application/json" }, [{ "error" => "unauthorized" }.to_json]]) unless admin
        enforce_csrf!(r) if WRITE_METHODS.include?(r.request_method)

        r.get "status" do
          status_payload
        end

        r.on "agents" do
          agents_routes(r, admin)
        end

        r.delete "keys", String do |key_id|
          require_write!(r, admin)
          AMG.db[:agent_api_keys].where(id: key_id).update(revoked_at: Time.now)
          { ok: true }
        end

        r.on "upstreams" do
          upstreams_routes(r, admin)
        end

        r.on "policies" do
          policies_routes(r, admin)
        end

        r.get "audit" do
          audit_list(r)
        end
      end

      private

      # ---- auth helpers ----

      def session_token(r)
        r.cookies[SESSION_COOKIE]
      end

      def secure_cookie?
        AMG.config.public_url.to_s.start_with?("https")
      end

      # AMG_PUBLIC_URL is optional everywhere else (only affects the Secure
      # cookie flag), but a redirect_uri needs an absolute URL to send a
      # third-party authorization server to. Falls back to the listen
      # address on localhost for dev setups that never set it.
      def effective_public_url
        AMG.config.public_url || "http://localhost#{AMG.config.listen_addr}"
      end

      def handle_login(r)
        result = Contracts::Login.new.call(r.params)
        return validation_error(result) if result.failure?

        admin = Session.authenticate(AMG.db, result[:email], result[:password])
        return json_error(401, "invalid_credentials") unless admin

        session = Session.create(AMG.db, admin.id)
        response.set_cookie(SESSION_COOKIE, value: session[:token], httponly: true, same_site: :lax,
                                            secure: secure_cookie?, path: "/")
        response.set_cookie(CSRF_COOKIE, value: session[:csrf_token], httponly: false, same_site: :lax,
                                         secure: secure_cookie?, path: "/")
        serialize_admin(admin)
      end

      def enforce_csrf!(r)
        cookie_token = r.cookies[CSRF_COOKIE]
        header_token = r.env[CSRF_HEADER]
        return if cookie_token && header_token && cookie_token == header_token

        r.halt([403, { "Content-Type" => "application/json" }, [{ "error" => "csrf_failed" }.to_json]])
      end

      def require_write!(r, admin)
        return if %w[owner admin].include?(admin.role)

        r.halt([403, { "Content-Type" => "application/json" }, [{ "error" => "read_only" }.to_json]])
      end

      def serialize_admin(admin)
        { "id" => admin.id, "email" => admin.email, "role" => admin.role }
      end

      def validation_error(result)
        response.status = 422
        { "error" => "validation_failed", "details" => result.errors.to_h }
      end

      def json_error(status, error)
        response.status = status
        { "error" => error }
      end

      # ---- status ----

      def status_payload
        upstreams = AMG.db[:upstreams].select(:id, :slug, :kind, :status).all
        { "status" => "ok", "upstreams" => upstreams }
      end

      # ---- agents ----

      def agents_routes(r, admin)
        r.is do
          r.get { { "agents" => AMG.db[:agents].where(workspace_id: admin.workspace_id).all } }
          r.post { create_agent(r, admin) }
        end

        r.on String do |id|
          agent_member_routes(r, admin, id)
        end
      end

      def agent_member_routes(r, admin, id)
        r.is do
          r.get { show_agent(id) }
          r.patch { update_agent(r, admin, id) }
          r.delete { delete_agent(r, admin, id) }
        end

        r.on "keys" do
          r.is do
            r.get { { "keys" => list_keys(id) } }
            r.post do
              require_write!(r, admin)
              create_key(id)
            end
          end
        end

        r.on "policies", String do |policy_id|
          agent_policy_binding_routes(r, admin, id, policy_id)
        end

        r.get "permissions" do
          { "agent_id" => id, "rules" => Store::Queries.rules_for_agent(AMG.db, id) }
        end
      end

      def agent_policy_binding_routes(r, admin, agent_id, policy_id)
        r.put do
          require_write!(r, admin)
          AMG.db[:agent_policy_bindings].insert_conflict.insert(agent_id: agent_id, policy_id: policy_id)
          { "ok" => true }
        end

        r.delete do
          require_write!(r, admin)
          AMG.db[:agent_policy_bindings].where(agent_id: agent_id, policy_id: policy_id).delete
          { "ok" => true }
        end
      end

      def delete_agent(r, admin, id)
        require_write!(r, admin)
        AMG.db[:agents].where(id: id).delete
        { "ok" => true }
      end

      def create_agent(r, admin)
        require_write!(r, admin)
        result = Contracts::AgentCreate.new.call(r.params)
        return validation_error(result) if result.failure?

        row = AMG.db[:agents].returning.insert(
          workspace_id: admin.workspace_id, slug: result[:slug], display_name: result[:display_name]
        ).first
        response.status = 201
        row
      end

      def show_agent(id)
        AMG.db[:agents].where(id: id).first || json_error(404, "not_found")
      end

      def update_agent(r, admin, id)
        require_write!(r, admin)
        result = Contracts::AgentUpdate.new.call(r.params)
        return validation_error(result) if result.failure?

        AMG.db[:agents].where(id: id).update(result.to_h)
        AMG.db[:agents].where(id: id).first
      end

      def create_key(agent_id)
        key = Crypto::ApiKey.generate
        row = AMG.db[:agent_api_keys].returning.insert(
          agent_id: agent_id, key_hash: Sequel.blob(key[:hash]), prefix: key[:prefix]
        ).first
        { "id" => row[:id], "prefix" => row[:prefix], "key" => key[:plaintext] }
      end

      def list_keys(agent_id)
        Store::Queries.keys_for_agent(AMG.db, agent_id)
      end

      # ---- upstreams ----

      def upstreams_routes(r, admin)
        r.is do
          r.get do
            rows = AMG.db[:upstreams].where(workspace_id: admin.workspace_id).all
            { "upstreams" => rows.map { |row| Store::Queries.with_oauth_connected(AMG.db, row) } }
          end
          r.post { create_upstream(r, admin) }
        end

        r.on String do |id|
          upstream_member_routes(r, admin, id)
        end
      end

      def upstream_member_routes(r, admin, id)
        r.is do
          r.get do
            row = AMG.db[:upstreams].where(id: id).first
            row ? Store::Queries.with_oauth_connected(AMG.db, row) : json_error(404, "not_found")
          end
          r.patch { update_upstream(r, admin, id) }
          r.delete do
            require_write!(r, admin)
            AMG.db[:upstreams].where(id: id).delete
            { "ok" => true }
          end
        end

        r.post "test" do
          require_write!(r, admin)
          test_upstream(id)
        end

        r.post "oauth", "connect" do
          require_write!(r, admin)
          oauth_connect(id)
        end
      end

      def oauth_connect(upstream_id)
        upstream = Store::Queries.upstream_by_id(AMG.db, upstream_id)
        return json_error(404, "not_found") unless upstream

        url = AMG.oauth_connector.connect(
          upstream: upstream, db: AMG.db, master_key: AMG.config.master_key, public_url: effective_public_url
        )
        { "authorization_url" => url }
      rescue Mcp::OAuthConnector::TimeoutError => e
        json_error(504, e.message)
      end

      # No admin session on this request (see the public route registration) —
      # `state` is the only correlation/CSRF check available, same as any
      # OAuth redirect endpoint.
      def oauth_callback(r, _upstream_id)
        code = r.params["code"]
        state = r.params["state"]
        ok = code && state && AMG.oauth_connector.resume!(state, code)

        response["Content-Type"] = "text/html"
        message = ok ? "Connected. You can close this tab." : "This authorization link is invalid or has expired."
        "<html><body><p>#{message}</p></body></html>"
      end

      def create_upstream(r, admin)
        require_write!(r, admin)
        result = Contracts::UpstreamCreate.new.call(r.params)
        return validation_error(result) if result.failure?

        row = AMG.db[:upstreams].returning.insert(
          workspace_id: admin.workspace_id, slug: result[:slug], display_name: result[:display_name],
          kind: result[:kind], config: Sequel.pg_jsonb(result[:config])
        ).first
        write_secrets(row[:id], result[:secrets])
        response.status = 201
        row
      end

      def update_upstream(r, admin, id)
        require_write!(r, admin)
        result = Contracts::UpstreamUpdate.new.call(r.params)
        return validation_error(result) if result.failure?

        changes = result.to_h.except(:secrets)
        changes[:config] = Sequel.pg_jsonb(changes[:config]) if changes.key?(:config)
        AMG.db[:upstreams].where(id: id).update(changes) unless changes.empty?
        write_secrets(id, result[:secrets])
        AMG.db[:upstreams].where(id: id).first
      end

      def write_secrets(upstream_id, secrets)
        return unless secrets

        secrets.each { |name, value| Store::Secrets.write(AMG.db, upstream_id, name.to_s, value, AMG.config.master_key) }
      end

      def test_upstream(id)
        upstream = Store::Queries.upstream_by_id(AMG.db, id)
        return json_error(404, "not_found") unless upstream

        case upstream[:kind]
        when "mcp_stdio", "mcp_http" then test_mcp_upstream(upstream)
        else { "ok" => true, "kind" => upstream[:kind] }
        end
      end

      def test_mcp_upstream(upstream)
        tools = AMG.upstream_manager.tools(upstream)
        { "ok" => true, "tools" => tools.map { |t| serialize_tool(t) } }
      rescue StandardError => e
        { "ok" => false, "error" => e.message }
      end

      def serialize_tool(tool)
        {
          "name" => tool.name,
          "description" => tool.description,
          "input_schema" => tool.input_schema,
          "output_schema" => tool.output_schema
        }
      end

      # ---- audit ----

      def audit_list(r)
        rows = audit_dataset(r.params).limit(50).all
        { "events" => enrich_audit_events(rows), "next_cursor" => rows.length == 50 ? rows.last[:id] : nil }
      end

      def enrich_audit_events(rows)
        identities = AMG::Store::Queries.agent_identities(AMG.db, rows.filter_map { |row| row[:agent_id] }.uniq)
        upstreams = AMG::Store::Queries.upstream_slugs(AMG.db, rows.filter_map { |row| row[:upstream_id] }.uniq)
        rows.map do |row|
          identity = identities[row[:agent_id]]
          row.merge(
            "agent" => identity&.fetch(:display_name),
            "role" => identity && identity[:policies].any? ? identity[:policies].join(", ") : nil,
            "upstream" => upstreams[row[:upstream_id]]
          )
        end
      end

      def audit_dataset(params)
        ds = AMG.db[:audit_events].order(Sequel.desc(:occurred_at))
        AUDIT_EQ_FILTERS.each { |param, column| ds = ds.where(column => params[param]) if params[param] }
        ds = ds.where { occurred_at >= Time.parse(params["from"]) } if params["from"]
        ds = ds.where { occurred_at <= Time.parse(params["to"]) } if params["to"]
        ds
      end
    end
  end
end
