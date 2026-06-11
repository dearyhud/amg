# frozen_string_literal: true

require "rack"

module AMG
  module Admin
    # Control plane: roles, agents, tokens, upstreams, approvals, audit.
    # Two ways in, both resolved server-side:
    #   - bearer admin token (automation; constant-time compared)
    #   - password login -> httpOnly session cookie + CSRF token (console)
    # Intended to sit behind your internal network, not the agents.
    class App
      SESSION_COOKIE = "amg_admin_session"
      SESSION_TTL = 12 * 3600

      def initialize(db:, compiler:, issuer:, approval_gate:, admin_token:, registry: nil,
                     redis: nil, admin_password: nil, admin_email: "admin@localhost")
        raise Error, "admin_token must be configured" if admin_token.to_s.empty?

        @db = db
        @compiler = compiler
        @issuer = issuer
        @approval_gate = approval_gate
        @admin_token = admin_token
        @registry = registry
        @redis = redis
        @admin_password = admin_password
        @admin_email = admin_email
      end

      def call(env)
        req = Rack::Request.new(env)

        return login(req) if req.post? && req.path == "/auth/login"
        return logout(req) if req.path == "/auth/logout"

        bearer = bearer_authorized?(req)
        session = current_session(req)
        return json(401, error: "unauthorized") unless bearer || session

        # CSRF binds mutations to the session; bearer callers carry no
        # cookies, so the check doesn't apply to them.
        if !bearer && mutating?(req) && !csrf_ok?(req, session)
          return json(403, error: "csrf token mismatch")
        end

        return me_response(session) if req.get? && req.path == "/me"

        route(req)
      rescue PolicyError, ApprovalError, Error => e
        json(422, error: e.message)
      rescue JSON::ParserError
        json(400, error: "request body must be JSON")
      end

      private

      def route(req)
        segments = req.path.split("/").reject(&:empty?)

        case [req.request_method, *segments]
        in ["GET", "roles"] then list_roles
        in ["POST", "roles"] then create_role(body(req))
        in ["PUT", "roles", String => name] then update_role(name, body(req))
        in ["GET", "agents"] then list_agents
        in ["POST", "agents"] then create_agent(body(req))
        in ["POST", "agents", String => name, "tokens"] then issue_token(name, body(req))
        in ["POST", "tokens", String => id, "revoke"] then revoke_token(id)
        in ["GET", "upstreams"] then list_upstreams
        in ["POST", "upstreams"] then create_upstream(body(req))
        in ["GET", "approvals"] then list_approvals(req.params["state"])
        in ["POST", "approvals", String => id, "approve"] then resolve_approval(id, body(req), approve: true)
        in ["POST", "approvals", String => id, "deny"] then resolve_approval(id, body(req), approve: false)
        in ["GET", "audit_events"] then list_audit_events(req.params)
        else json(404, error: "not found")
        end
      end

      # -- roles ------------------------------------------------------------

      def list_roles
        json(200, roles: @db[:roles].select(:name, :description, :enforcement, :policy_version).all)
      end

      def create_role(params)
        compiled = @compiler.compile(params.fetch("policy_yaml") { raise Error, "policy_yaml is required" })
        name = compiled[:role]
        return json(409, error: "role #{name} already exists") if @db[:roles].where(name: name).any?

        @db[:roles].insert(
          id: SecureRandom.uuid, name: name, description: params["description"],
          policy: JSON.generate(compiled), policy_version: 1,
          enforcement: compiled[:enforcement],
          created_at: Time.now.utc, updated_at: Time.now.utc
        )
        json(201, role: name, policy_version: 1, enforcement: compiled[:enforcement])
      end

      def update_role(name, params)
        row = @db[:roles].where(name: name).first
        return json(404, error: "no such role: #{name}") unless row

        compiled = @compiler.compile(params.fetch("policy_yaml") { raise Error, "policy_yaml is required" })
        raise Error, "policy role #{compiled[:role].inspect} does not match #{name.inspect}" if compiled[:role] != name

        version = row[:policy_version] + 1
        @db[:roles].where(id: row[:id]).update(
          policy: JSON.generate(compiled), policy_version: version,
          enforcement: compiled[:enforcement],
          description: params["description"] || row[:description],
          updated_at: Time.now.utc
        )
        json(200, role: name, policy_version: version, enforcement: compiled[:enforcement])
      end

      # -- agents & tokens --------------------------------------------------

      def list_agents
        rows = @db[:agents]
               .join(:roles, id: :role_id)
               .select(Sequel[:agents][:id], Sequel[:agents][:name],
                       Sequel[:agents][:status], Sequel[:roles][:name].as(:role))
               .all
        json(200, agents: rows)
      end

      def create_agent(params)
        role = @db[:roles].where(name: params.fetch("role") { raise Error, "role is required" }).first
        raise Error, "no such role: #{params['role']}" unless role

        name = params.fetch("name") { raise Error, "name is required" }
        id = SecureRandom.uuid
        @db[:agents].insert(id: id, name: name, role_id: role[:id],
                            status: "active", created_at: Time.now.utc)
        json(201, agent: { id: id, name: name, role: role[:name] })
      end

      def issue_token(agent_name, params)
        agent = @db[:agents].where(name: agent_name).first
        return json(404, error: "no such agent: #{agent_name}") unless agent

        expires_at = params["expires_in"] && Time.now.utc + Util.parse_duration(params["expires_in"])
        issued = @issuer.issue(agent_id: agent[:id], expires_at: expires_at)
        json(201, token_id: issued[:id], token: issued[:token],
                  note: "store this token now; it is not retrievable again")
      end

      def revoke_token(token_id)
        @issuer.revoke(token_id)
        json(200, revoked: token_id)
      end

      # -- upstreams ----------------------------------------------------------

      def list_upstreams
        json(200, upstreams: @db[:upstreams].select(:name, :kind, :endpoint).all)
      end

      def create_upstream(params)
        %w[name kind endpoint vault_path].each do |k|
          raise Error, "#{k} is required" unless params[k].is_a?(String) && !params[k].empty?
        end
        raise Error, "kind must be mcp or http" unless %w[mcp http].include?(params["kind"])

        @db[:upstreams].insert(
          id: SecureRandom.uuid, name: params["name"], kind: params["kind"],
          endpoint: params["endpoint"], vault_path: params["vault_path"],
          created_at: Time.now.utc
        )
        @registry&.reload!
        json(201, upstream: params["name"])
      end

      # -- approvals & audit --------------------------------------------------

      def list_approvals(state)
        ds = @db[:approvals].order(Sequel.desc(:expires_at))
        ds = ds.where(state: state) if state
        json(200, approvals: ds.limit(100).all.map { |r| r.merge(payload: JSON.parse(r[:payload])) })
      end

      def resolve_approval(id, params, approve:)
        approver = params.fetch("approver") { raise Error, "approver is required" }
        result = @approval_gate.resolve(id, approver: approver, approve: approve)
        json(200, approval_id: id, state: approve ? "approved" : "denied", result: result)
      end

      def list_audit_events(params)
        ds = @db[:audit_events].order(Sequel.desc(:created_at))
        ds = ds.where(agent_id: params["agent_id"]) if params["agent_id"]
        ds = ds.where(tool: params["tool"]) if params["tool"]
        ds = ds.where(decision: params["decision"]) if params["decision"]
        limit = [params.fetch("limit", 100).to_i, 1000].min
        json(200, audit_events: ds.limit(limit).all)
      end

      # -- auth -----------------------------------------------------------------

      def login(req)
        if @admin_password.to_s.empty? || @redis.nil?
          return json(503, error: "password auth not configured")
        end

        password = body(req)["password"].to_s
        return json(401, error: "invalid password") unless Util.secure_compare(password, @admin_password)

        sid = SecureRandom.hex(32)
        session = {
          "email" => @admin_email,
          "name" => "Admin",
          "csrf_token" => SecureRandom.hex(32)
        }
        @redis.setex(session_key(sid), SESSION_TTL, JSON.generate(session))

        status, headers, payload = me_response(session)
        headers["set-cookie"] = session_cookie(sid, max_age: SESSION_TTL)
        [status, headers, payload]
      end

      def logout(req)
        sid = req.cookies[SESSION_COOKIE]
        @redis&.del(session_key(sid)) if sid
        [302, { "location" => "/admin/", "set-cookie" => session_cookie("", max_age: 0) }, []]
      end

      def me_response(session)
        user =
          if session
            { email: session["email"], name: session["name"] }
          else
            { email: @admin_email, name: "Admin (bearer)" }
          end
        json(200, user: user, csrf_token: session ? session["csrf_token"] : "")
      end

      def current_session(req)
        sid = req.cookies[SESSION_COOKIE]
        return nil unless sid && @redis

        raw = @redis.get(session_key(sid))
        return nil unless raw

        @redis.expire(session_key(sid), SESSION_TTL) # sliding window
        JSON.parse(raw)
      end

      def csrf_ok?(req, session)
        provided = req.get_header("HTTP_X_CSRF_TOKEN").to_s
        !provided.empty? && Util.secure_compare(provided, session["csrf_token"].to_s)
      end

      def mutating?(req)
        !(req.get? || req.head?)
      end

      def session_key(sid) = "amg:admin:session:#{sid}"

      def session_cookie(sid, max_age:)
        cookie = "#{SESSION_COOKIE}=#{sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=#{max_age}"
        cookie += "; Secure" if ENV["AMG_COOKIE_SECURE"] == "1"
        cookie
      end

      # -- plumbing -----------------------------------------------------------

      def bearer_authorized?(req)
        m = /\ABearer\s+(\S+)\z/.match(req.get_header("HTTP_AUTHORIZATION").to_s)
        !!(m && Util.secure_compare(m[1], @admin_token))
      end

      def body(req)
        raw = req.body.read.to_s
        raw.empty? ? {} : JSON.parse(raw)
      end

      def json(status, payload)
        [status, { "content-type" => "application/json" }, [JSON.generate(payload)]]
      end
    end
  end
end
