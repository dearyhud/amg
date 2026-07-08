require "spec_helper"
require "rack/test"
require_relative "../../lib/amg/server/app"

RSpec.describe "Admin API" do
  include Rack::Test::Methods

  def app
    AMG::Server::App.app
  end

  let(:db) { AMG::Spec::Database.connect }
  let(:workspace_id) { AMG::Store::Bootstrap.ensure_workspace(db) }

  def create_admin(role: "owner", password: "hunter2hunter2")
    id = db[:admins].returning(:id).insert(
      workspace_id: workspace_id, email: "#{role}-#{SecureRandom.hex(4)}@example.com",
      password_hash: AMG::Crypto::Password.hash(password), role: role
    ).first[:id]
    email = db[:admins].where(id: id).get(:email)
    { id: id, email: email, password: password }
  end

  def login(admin)
    post "/api/v1/auth/login", { email: admin[:email], password: admin[:password] }.to_json,
         "CONTENT_TYPE" => "application/json"
    JSON.parse(last_response.body)
  end

  def csrf_header
    token = rack_mock_session.cookie_jar["amg_csrf"]
    { "HTTP_X_AMG_CSRF" => token }
  end

  def json_post(path, body)
    post path, body.to_json, { "CONTENT_TYPE" => "application/json" }.merge(csrf_header)
  end

  def json_patch(path, body)
    patch path, body.to_json, { "CONTENT_TYPE" => "application/json" }.merge(csrf_header)
  end

  describe "auth" do
    it "logs in with valid credentials and rejects invalid ones" do
      admin = create_admin
      login(admin)
      expect(last_response.status).to eq(200)
      expect(JSON.parse(last_response.body)["email"]).to eq(admin[:email])

      post "/api/v1/auth/login", { email: admin[:email], password: "wrong" }.to_json,
           "CONTENT_TYPE" => "application/json"
      expect(last_response.status).to eq(401)
    end

    it "rejects unauthenticated requests to protected routes" do
      get "/api/v1/agents"
      expect(last_response.status).to eq(401)
    end

    it "supports /auth/me and /auth/logout" do
      admin = create_admin
      login(admin)

      get "/api/v1/auth/me"
      expect(last_response.status).to eq(200)

      post "/api/v1/auth/logout", "", csrf_header
      get "/api/v1/auth/me"
      expect(last_response.status).to eq(401)
    end
  end

  describe "CSRF" do
    it "rejects a mutation without the CSRF header" do
      login(create_admin)
      post "/api/v1/agents", { slug: "x", display_name: "X" }.to_json, "CONTENT_TYPE" => "application/json"
      expect(last_response.status).to eq(403)
    end
  end

  describe "role enforcement" do
    it "returns 403 for a mutation from an auditor" do
      login(create_admin(role: "auditor"))
      json_post("/api/v1/agents", { slug: "x", display_name: "X" })
      expect(last_response.status).to eq(403)
    end

    it "allows an auditor to read" do
      login(create_admin(role: "auditor"))
      get "/api/v1/agents"
      expect(last_response.status).to eq(200)
    end
  end

  describe "agents CRUD + keys + bindings" do
    before { login(create_admin) }

    it "creates, lists, and updates an agent" do
      json_post("/api/v1/agents", { slug: "support-bot", display_name: "Support Bot" })
      expect(last_response.status).to eq(201)
      agent = JSON.parse(last_response.body)

      get "/api/v1/agents"
      expect(JSON.parse(last_response.body)["agents"].map { |a| a["slug"] }).to include("support-bot")

      json_patch("/api/v1/agents/#{agent["id"]}", { display_name: "Renamed" })
      expect(JSON.parse(last_response.body)["display_name"]).to eq("Renamed")
    end

    it "issues a key shown once and revokes it" do
      json_post("/api/v1/agents", { slug: "support-bot", display_name: "Support Bot" })
      agent = JSON.parse(last_response.body)

      json_post("/api/v1/agents/#{agent["id"]}/keys", {})
      expect(last_response.status).to eq(200)
      key_response = JSON.parse(last_response.body)
      expect(key_response["key"]).to start_with("amg_ak_")

      delete "/api/v1/keys/#{key_response["id"]}", nil, csrf_header
      expect(last_response.status).to eq(200)
      expect(db[:agent_api_keys].where(id: key_response["id"]).get(:revoked_at)).not_to be_nil
    end

    it "lists keys for an agent without ever exposing key_hash" do
      json_post("/api/v1/agents", { slug: "support-bot", display_name: "Support Bot" })
      agent = JSON.parse(last_response.body)
      json_post("/api/v1/agents/#{agent["id"]}/keys", {})
      key_response = JSON.parse(last_response.body)

      get "/api/v1/agents/#{agent["id"]}/keys"
      keys = JSON.parse(last_response.body)["keys"]
      expect(keys.length).to eq(1)
      expect(keys.first["prefix"]).to eq(key_response["prefix"])
      expect(keys.first).not_to have_key("key_hash")
    end

    def bind_fixture_policy
      agent_id = db[:agents].returning(:id).insert(workspace_id: workspace_id, slug: "a1",
                                                   display_name: "A1").first[:id]
      upstream_id = db[:upstreams].returning(:id).insert(
        workspace_id: workspace_id, slug: "gh", display_name: "GH", kind: "mcp_stdio", config: Sequel.pg_jsonb({})
      ).first[:id]
      policy_id = db[:policies].returning(:id).insert(workspace_id: workspace_id, name: "p1").first[:id]
      db[:policy_rules].insert(policy_id: policy_id, upstream_id: upstream_id, target: "get_issue",
                               constraints: Sequel.pg_jsonb([]))
      [agent_id, policy_id]
    end

    it "binds a policy and reports it in effective permissions" do
      agent_id, policy_id = bind_fixture_policy

      put "/api/v1/agents/#{agent_id}/policies/#{policy_id}", nil, csrf_header
      expect(last_response.status).to eq(200)

      get "/api/v1/agents/#{agent_id}/permissions"
      rules = JSON.parse(last_response.body)["rules"]
      expect(rules.map { |r| r["target"] }).to include("get_issue")
    end

    it "unbinds a policy and removes it from effective permissions" do
      agent_id, policy_id = bind_fixture_policy
      put "/api/v1/agents/#{agent_id}/policies/#{policy_id}", nil, csrf_header

      delete "/api/v1/agents/#{agent_id}/policies/#{policy_id}", nil, csrf_header
      get "/api/v1/agents/#{agent_id}/permissions"
      expect(JSON.parse(last_response.body)["rules"]).to be_empty
    end
  end

  describe "upstreams CRUD + secrets write-only" do
    before { login(create_admin) }

    it "creates an upstream with secrets and never returns the secret value on GET" do
      json_post("/api/v1/upstreams", {
                  slug: "github", display_name: "GitHub", kind: "mcp_stdio",
                  config: { "command" => "ruby", "args" => ["fixture.rb"] },
                  secrets: { "github_token" => "ghp_supersecret" }
                })
      expect(last_response.status).to eq(201)
      upstream = JSON.parse(last_response.body)

      get "/api/v1/upstreams/#{upstream["id"]}"
      expect(last_response.body).not_to include("ghp_supersecret")

      row = db[:upstream_secrets].where(upstream_id: upstream["id"], name: "github_token").first
      expect(row[:ciphertext].to_s).not_to include("ghp_supersecret")
    end
  end

  describe "policies CRUD + simulate" do
    before { login(create_admin) }

    let!(:upstream_id) do
      db[:upstreams].returning(:id).insert(
        workspace_id: workspace_id, slug: "github", display_name: "GH", kind: "mcp_stdio", config: Sequel.pg_jsonb({})
      ).first[:id]
    end

    it "creates a policy with rules and reports bound_agents count on mutation" do
      json_post("/api/v1/policies", {
                  name: "support-triage",
                  rules: [
                    { upstream_id: upstream_id, target: "create_issue",
                      constraints: [{ "path" => "/owner", "op" => "eq", "value" => "backpackpay" }] },
                    { upstream_id: upstream_id, target: "get_issue", constraints: [] }
                  ]
                })
      expect(last_response.status).to eq(201)
      policy = JSON.parse(last_response.body)
      expect(policy["rules"].length).to eq(2)
      expect(policy["bound_agents"]).to eq(0)
    end

    it "reports rule_count in the list view (not just the single-policy view)" do
      json_post("/api/v1/policies", {
                  name: "support-triage",
                  rules: [{ upstream_id: upstream_id, target: "get_issue", constraints: [] }]
                })

      get "/api/v1/policies"
      listed = JSON.parse(last_response.body)["policies"].find { |p| p["name"] == "support-triage" }
      expect(listed["rule_count"]).to eq(1)
    end

    it "simulates a decision without writing an audit row" do
      json_post("/api/v1/policies", {
                  name: "support-triage",
                  rules: [{ upstream_id: upstream_id, target: "create_issue",
                            constraints: [{ "path" => "/owner", "op" => "eq", "value" => "backpackpay" }] }]
                })
      policy = JSON.parse(last_response.body)

      json_post("/api/v1/policies/#{policy["id"]}/simulate",
                { upstream_id: upstream_id, target: "create_issue", args: { "owner" => "payments-core" } })
      result = JSON.parse(last_response.body)
      expect(result["allowed"]).to be false
      expect(result["reason"]).to eq("constraint_failed")

      expect(db[:audit_events].count).to eq(0)
    end

    def create_and_bind_policy_to(agent_id)
      json_post("/api/v1/policies", {
                  name: "support-triage",
                  rules: [{ upstream_id: upstream_id, target: "get_issue", constraints: [] }]
                })
      policy = JSON.parse(last_response.body)
      put "/api/v1/agents/#{agent_id}/policies/#{policy["id"]}", nil, csrf_header
      policy["id"]
    end

    it "reports bound_agent_list with slug/display_name on the single-policy view" do
      agent_id = db[:agents].returning(:id).insert(
        workspace_id: workspace_id, slug: "support-bot", display_name: "Support Bot"
      ).first[:id]
      policy_id = create_and_bind_policy_to(agent_id)

      get "/api/v1/policies/#{policy_id}"
      shown = JSON.parse(last_response.body)
      expect(shown["bound_agent_list"]).to contain_exactly(
        hash_including("slug" => "support-bot", "display_name" => "Support Bot")
      )
    end

    it "simulates against rules passed directly in the request, ignoring any persisted policy" do
      json_post("/api/v1/policies/simulate", {
                  upstream_id: upstream_id, target: "get_issue", args: {},
                  rules: [{ upstream_id: upstream_id, target: "get_issue", constraints: [], strict_args: false }]
                })
      expect(JSON.parse(last_response.body)["allowed"]).to be true
    end

    it "denies via draft simulate when no draft rule matches the target" do
      json_post("/api/v1/policies/simulate", {
                  upstream_id: upstream_id, target: "delete_issue", args: {},
                  rules: [{ upstream_id: upstream_id, target: "get_issue", constraints: [], strict_args: false }]
                })
      denied = JSON.parse(last_response.body)
      expect(denied["allowed"]).to be false
      expect(denied["reason"]).to eq("no_rule")
    end

    it "denies via draft simulate when the matching rule belongs to a different upstream" do
      other_upstream_id = db[:upstreams].returning(:id).insert(
        workspace_id: workspace_id, slug: "stripe", display_name: "Stripe", kind: "mcp_stdio",
        config: Sequel.pg_jsonb({})
      ).first[:id]

      json_post("/api/v1/policies/simulate", {
                  upstream_id: upstream_id, target: "get_issue", args: {},
                  rules: [{ upstream_id: other_upstream_id, target: "get_issue", constraints: [], strict_args: false }]
                })
      denied = JSON.parse(last_response.body)
      expect(denied["allowed"]).to be false
      expect(denied["reason"]).to eq("no_rule")
    end
  end

  describe "audit browsing" do
    before { login(create_admin) }

    it "lists audit events" do
      db[:audit_events].insert(
        workspace_id: workspace_id, surface: "mcp", target: "get_issue", decision: "allow", request_id: "req_1"
      )

      get "/api/v1/audit"
      expect(last_response.status).to eq(200)
      expect(JSON.parse(last_response.body)["events"].length).to eq(1)
    end
  end
end
