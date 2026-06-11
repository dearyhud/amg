# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Admin::App do
  include Rack::Test::Methods

  let(:db) { DbSchema.connect }
  let(:redis) { MockRedis.new }
  let(:admin_token) { "admin-secret" }
  let(:router) { Fakes::Router.new }

  let(:app) do
    described_class.new(
      db: db,
      compiler: AMG::Policy::Compiler.new,
      issuer: AMG::Auth::TokenIssuer.new(db: db, redis: redis),
      approval_gate: AMG::ApprovalGate.new(db: db, router: router),
      admin_token: admin_token
    )
  end

  let(:policy_yaml) { <<~YAML }
    role: notion_read
    servers:
      notion:
        tools:
          - name: get_pages
            constraints:
              workspace_id:
                in: ["ws_abc123"]
  YAML

  def request(method, path, body = nil, token: admin_token)
    header "Authorization", "Bearer #{token}" if token
    header "Content-Type", "application/json"
    public_send(method, path, body && JSON.generate(body))
    JSON.parse(last_response.body)
  end

  it "rejects missing or wrong admin tokens" do
    request(:get, "/roles", token: nil)
    expect(last_response.status).to eq(401)
    request(:get, "/roles", token: "wrong")
    expect(last_response.status).to eq(401)
  end

  it "manages the full role -> agent -> token lifecycle" do
    body = request(:post, "/roles", { "policy_yaml" => policy_yaml })
    expect(last_response.status).to eq(201)
    expect(body).to include("role" => "notion_read", "policy_version" => 1)

    request(:post, "/agents", { "name" => "worker-1", "role" => "notion_read" })
    expect(last_response.status).to eq(201)

    body = request(:post, "/agents/worker-1/tokens", {})
    expect(last_response.status).to eq(201)
    token = body.fetch("token")
    expect(token).to start_with("amg_")

    # the issued token actually authenticates on the data plane
    identity = AMG::Auth::TokenAuthenticator.new(db: db, redis: redis).call(token)
    expect(identity.role_name).to eq("notion_read")

    request(:post, "/tokens/#{body['token_id']}/revoke")
    expect(last_response.status).to eq(200)
    expect { AMG::Auth::TokenAuthenticator.new(db: db, redis: redis).call(token) }
      .to raise_error(AMG::AuthError)
  end

  it "rejects invalid policy YAML with a 422 and the compiler's reason" do
    bad = policy_yaml.sub("in:", "contains:")
    body = request(:post, "/roles", { "policy_yaml" => bad })
    expect(last_response.status).to eq(422)
    expect(body["error"]).to match(/unknown constraint operator/)
  end

  it "bumps policy_version on update and refuses role renames" do
    request(:post, "/roles", { "policy_yaml" => policy_yaml })
    body = request(:put, "/roles/notion_read", { "policy_yaml" => policy_yaml })
    expect(body["policy_version"]).to eq(2)

    renamed = policy_yaml.sub("notion_read", "other_role")
    request(:put, "/roles/notion_read", { "policy_yaml" => renamed })
    expect(last_response.status).to eq(422)
  end

  it "duplicate roles conflict" do
    request(:post, "/roles", { "policy_yaml" => policy_yaml })
    request(:post, "/roles", { "policy_yaml" => policy_yaml })
    expect(last_response.status).to eq(409)
  end

  it "registers upstreams and validates kind" do
    request(:post, "/upstreams", { "name" => "notion", "kind" => "mcp",
                                   "endpoint" => "https://x/mcp", "vault_path" => "notion/key" })
    expect(last_response.status).to eq(201)

    request(:post, "/upstreams", { "name" => "x", "kind" => "ftp",
                                   "endpoint" => "e", "vault_path" => "v" })
    expect(last_response.status).to eq(422)
  end

  it "lists and resolves approvals" do
    identity = build_identity
    gate = AMG::ApprovalGate.new(db: db, router: router)
    approval_id = gate.park(identity: identity, tool: "notion__delete_page",
                            arguments: { "page_id" => "p1" },
                            rule: { timeout: 900 }, request_id: "req-1")

    body = request(:get, "/approvals?state=pending")
    expect(body["approvals"].map { |a| a["id"] }).to include(approval_id)

    body = request(:post, "/approvals/#{approval_id}/approve", { "approver" => "deary" })
    expect(body["state"]).to eq("approved")
    expect(router.calls.map(&:tool)).to eq(["notion__delete_page"])

    request(:post, "/approvals/#{approval_id}/approve", { "approver" => "deary" })
    expect(last_response.status).to eq(422)
  end

  it "filters audit events" do
    audit = AMG::Audit.new(db: db)
    audit.record(identity: build_identity, tool: "notion__get_pages", arguments: {},
                 decision: "allow", request_id: "r1")
    audit.record(identity: build_identity, tool: "notion__get_pages", arguments: {},
                 decision: "deny", deny_reason: "nope", request_id: "r2")

    body = request(:get, "/audit_events?decision=deny")
    expect(body["audit_events"].size).to eq(1)
    expect(body["audit_events"].first["deny_reason"]).to eq("nope")
  end
end
