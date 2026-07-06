require "spec_helper"
require "rack/test"
require_relative "../../lib/amg/server/app"

RSpec.describe "MCP gateway", :mcp_fixture do
  include Rack::Test::Methods

  def app
    AMG::Server::App.app
  end

  let(:db) { AMG::Spec::Database.connect }
  let(:workspace_id) { AMG::Store::Bootstrap.ensure_workspace(db) }

  let!(:upstream_id) do
    db[:upstreams].returning(:id).insert(
      workspace_id: workspace_id,
      slug: "github",
      display_name: "GitHub",
      kind: "mcp_stdio",
      config: Sequel.pg_jsonb({ "command" => "ruby", "args" => [AMG::Spec::FIXTURE_MCP_SERVER] })
    ).first[:id]
  end

  let!(:agent_id) do
    db[:agents].returning(:id).insert(workspace_id: workspace_id, slug: "support-bot",
                                      display_name: "Support Bot").first[:id]
  end

  let(:api_key) { AMG::Crypto::ApiKey.generate }

  before do
    db[:agent_api_keys].insert(agent_id: agent_id, key_hash: Sequel.blob(api_key[:hash]), prefix: api_key[:prefix])
  end

  after { AMG.upstream_manager.shutdown }

  def bind_policy!(rules:)
    policy_id = db[:policies].returning(:id).insert(workspace_id: workspace_id, name: "support-triage").first[:id]
    rules.each do |rule|
      db[:policy_rules].insert(
        policy_id: policy_id,
        upstream_id: upstream_id,
        target: rule[:target],
        constraints: Sequel.pg_jsonb(rule[:constraints] || []),
        strict_args: rule[:strict_args] || false
      )
    end
    db[:agent_policy_bindings].insert(agent_id: agent_id, policy_id: policy_id)
  end

  def rpc(method, params = nil, id: 1)
    body = { jsonrpc: "2.0", id: id, method: method }
    body[:params] = params if params
    header "Authorization", "Bearer #{api_key[:plaintext]}"
    header "Content-Type", "application/json"
    post "/mcp/github", body.to_json
    JSON.parse(last_response.body)
  end

  context "with no bound policy" do
    it "denies tools/call with no_policy" do
      response = rpc("tools/call", { name: "get_issue", arguments: {} })
      expect(response.dig("error", "code")).to eq(-32_003)
      expect(response.dig("error", "data", "reason")).to eq("no_policy")
    end
  end

  context "with the support-triage policy bound" do
    before do
      bind_policy!(rules: [
                     { target: "create_issue", constraints: [
                       { "path" => "/owner", "op" => "eq", "value" => "backpackpay" },
                       { "path" => "/repo", "op" => "eq", "value" => "support-tickets" }
                     ] },
                     { target: "get_issue", constraints: [] }
                   ])
    end

    it "filters tools/list to only granted tools" do
      response = rpc("tools/list")
      names = response.dig("result", "tools").map { |t| t["name"] }
      expect(names).to contain_exactly("create_issue", "get_issue")
    end

    it "allows an unconstrained granted tool" do
      response = rpc("tools/call", { name: "get_issue", arguments: { owner: "backpackpay", repo: "support-tickets" } })
      expect(response["result"]["content"].first["text"]).to eq("issue:backpackpay/support-tickets#")
    end

    it "allows create_issue with matching constraints" do
      args = { owner: "backpackpay", repo: "support-tickets", title: "help" }
      response = rpc("tools/call", { name: "create_issue", arguments: args })
      expect(response["result"]["content"].first["text"]).to eq("created:backpackpay/support-tickets:help")
    end

    it "denies create_issue on a different repo with constraint_failed" do
      args = { owner: "backpackpay", repo: "payments-core", title: "x" }
      response = rpc("tools/call", { name: "create_issue", arguments: args })
      expect(response.dig("error", "data", "reason")).to eq("constraint_failed")
    end

    it "denies an ungranted tool with no_rule" do
      response = rpc("tools/call", { name: "delete_repository", arguments: { owner: "x", repo: "y" } })
      expect(response.dig("error", "code")).to eq(-32_003)
      expect(response.dig("error", "data", "reason")).to eq("no_rule")
    end

    it "writes an audit row for every decision" do
      rpc("tools/call", { name: "get_issue", arguments: { owner: "backpackpay", repo: "support-tickets" } })
      rpc("tools/call", { name: "delete_repository", arguments: { owner: "x", repo: "y" } })
      AMG.audit.wait_until_empty

      rows = db[:audit_events].where(agent_id: agent_id).order(:occurred_at).all
      expect(rows.map { |r| r[:decision] }).to eq(%w[allow deny])
      expect(rows.last[:deny_reason]).to eq("no_rule")
      expect(rows).to all(satisfy { |r| !r[:request_id].nil? })
    end

    it "rejects an invalid bearer key with 401" do
      header "Authorization", "Bearer amg_ak_bogus"
      post "/mcp/github", { jsonrpc: "2.0", id: 1, method: "tools/list" }.to_json
      expect(last_response.status).to eq(401)
    end
  end
end
