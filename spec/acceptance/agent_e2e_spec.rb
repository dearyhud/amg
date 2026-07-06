require "spec_helper"
require "mcp/client"
require "net/http"
require "stringio"
require_relative "../../lib/amg/server/app"
require_relative "../fixtures/fixture_rest_server"
require_relative "../support/live_server"

# The SPEC's acceptance narrative (docs/using-amg-with-an-agent.md), as RSpec:
# AMG + Postgres boot with a fixture stdio MCP upstream; a seeded agent + API
# key + a support-triage-style policy with argument constraints, bound to the
# agent; a real MCP client authenticates with its bearer key and sees a
# filtered tool list, executes an allowed call, is denied a disallowed one
# and a constraint-violating one with reason codes; the REST surface proxies
# an allowed route with injected creds and denies a violating body; every
# decision is audited with redacted args and a shared request_id; no secret
# appears anywhere in AMG's own output (SPEC §16.3).
AGENT_E2E_SECRET = "ghp_realsecrettoken12345".freeze

RSpec.describe "AMG agent acceptance narrative" do
  let(:db) { AMG::Spec::Database.connect }
  let(:workspace_id) { AMG::Store::Bootstrap.ensure_workspace(db) }
  let(:master_key) { AMG::Spec::TEST_MASTER_KEY }

  let!(:log_capture) { StringIO.new }
  let!(:previous_logger) { AMG.logger }

  let!(:live_server) { AMG::Spec::LiveServer.start(AMG::Server::App.app) }
  let!(:rest_fixture) { AMG::Spec::FixtureRestServer.start }

  let!(:github_upstream_id) do
    db[:upstreams].returning(:id).insert(
      workspace_id: workspace_id, slug: "github", display_name: "GitHub", kind: "mcp_stdio",
      config: Sequel.pg_jsonb({ "command" => "ruby", "args" => [AMG::Spec::FIXTURE_MCP_SERVER] })
    ).first[:id]
  end

  let!(:treasury_upstream_id) do
    id = db[:upstreams].returning(:id).insert(
      workspace_id: workspace_id, slug: "treasury", display_name: "Treasury", kind: "rest",
      config: Sequel.pg_jsonb({
                                "base_url" => rest_fixture_base_url,
                                "headers" => { "Authorization" => "Bearer {{secret:tp_token}}" },
                                "timeout_ms" => 5000
                              })
    ).first[:id]
    AMG::Store::Secrets.write(db, id, "tp_token", AGENT_E2E_SECRET, master_key)
    id
  end

  let(:rest_fixture_base_url) { "http://127.0.0.1:#{rest_fixture.port}" }

  let!(:agent_id) do
    db[:agents].returning(:id).insert(workspace_id: workspace_id, slug: "support-bot",
                                      display_name: "Support Bot").first[:id]
  end

  let(:api_key) { AMG::Crypto::ApiKey.generate }

  before do
    AMG.logger = Logger.new(log_capture)

    db[:agent_api_keys].insert(agent_id: agent_id, key_hash: Sequel.blob(api_key[:hash]), prefix: api_key[:prefix])

    policy_id = db[:policies].returning(:id).insert(workspace_id: workspace_id, name: "support-triage").first[:id]
    db[:policy_rules].insert(
      policy_id: policy_id, upstream_id: github_upstream_id, target: "create_issue",
      constraints: Sequel.pg_jsonb([
                                     { "path" => "/owner", "op" => "eq", "value" => "backpackpay" },
                                     { "path" => "/repo", "op" => "eq", "value" => "support-tickets" }
                                   ])
    )
    db[:policy_rules].insert(
      policy_id: policy_id, upstream_id: github_upstream_id, target: "get_issue", constraints: Sequel.pg_jsonb([])
    )
    db[:policy_rules].insert(
      policy_id: policy_id, upstream_id: treasury_upstream_id, target: "POST /book",
      constraints: Sequel.pg_jsonb([
                                     { "path" => "/body/amount", "op" => "lte", "value" => 10_000 },
                                     { "path" => "/body/currency", "op" => "eq", "value" => "USD" }
                                   ])
    )
    db[:agent_policy_bindings].insert(agent_id: agent_id, policy_id: policy_id)
  end

  after do
    live_server.stop
    rest_fixture.stop
    AMG.upstream_manager.shutdown
    AMG.logger = previous_logger
  end

  def mcp_client
    transport = MCP::Client::HTTP.new(url: "#{live_server.base_url}/mcp/github",
                                      headers: { "Authorization" => "Bearer #{api_key[:plaintext]}" })
    client = MCP::Client.new(transport: transport)
    client.connect
    client
  end

  def rest_request(method, path, body: nil)
    uri = URI("#{live_server.base_url}/proxy/treasury#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    request_class = method == :post ? Net::HTTP::Post : Net::HTTP::Delete
    request = request_class.new(uri)
    request["Authorization"] = "Bearer #{api_key[:plaintext]}"
    if body
      request["Content-Type"] = "application/json"
      request.body = body.to_json
    end
    http.request(request)
  end

  it "proves the whole governed-agent narrative end to end" do
    client = mcp_client

    # tools/list shows ONLY granted tools.
    tools = client.tools
    expect(tools.map(&:name)).to contain_exactly("create_issue", "get_issue")

    # An allowed tools/call succeeds.
    result = client.call_tool(name: "get_issue", arguments: { owner: "backpackpay", repo: "support-tickets" })
    expect(result.dig("result", "content").first["text"]).to eq("issue:backpackpay/support-tickets#")

    # An ungranted tool returns -32003 no_rule.
    expect { client.call_tool(name: "delete_repository", arguments: { owner: "x", repo: "y" }) }
      .to raise_error(MCP::Client::ServerError) { |e|
        expect(e.code).to eq(-32_003)
        expect(e.data["reason"]).to eq("no_rule")
      }
    no_rule_request_id = nil
    begin
      client.call_tool(name: "delete_repository", arguments: { owner: "x", repo: "y" })
    rescue MCP::Client::ServerError => e
      no_rule_request_id = e.data["request_id"]
    end

    # Constraint-violating args return -32003 constraint_failed.
    constraint_failed_request_id = nil
    begin
      client.call_tool(name: "create_issue", arguments: { owner: "backpackpay", repo: "payments-core", title: "x" })
    rescue MCP::Client::ServerError => e
      expect(e.code).to eq(-32_003)
      expect(e.data["reason"]).to eq("constraint_failed")
      constraint_failed_request_id = e.data["request_id"]
    end

    # REST surface: allowed route with injected creds.
    allow_response = rest_request(:post, "/book", body: { amount: 5000, currency: "USD" })
    expect(allow_response.code).to eq("200")
    expect(rest_fixture.requests_received.last[:authorization]).to eq("Bearer #{AGENT_E2E_SECRET}")

    # REST surface: denies a violating body.
    deny_response = rest_request(:post, "/book", body: { amount: 999_999, currency: "USD" })
    expect(deny_response.code).to eq("403")
    deny_body = JSON.parse(deny_response.body)
    expect(deny_body["reason"]).to eq("constraint_failed")
    rest_deny_request_id = deny_body["request_id"]

    # An audit row exists for every decision, args redacted, joined by request_id.
    AMG.audit.wait_until_empty
    rows_by_request_id = db[:audit_events].where(agent_id: agent_id).all.to_h do |r|
      [r[:request_id], r]
    end

    expect(rows_by_request_id[no_rule_request_id][:decision]).to eq("deny")
    expect(rows_by_request_id[no_rule_request_id][:deny_reason]).to eq("no_rule")
    expect(rows_by_request_id[constraint_failed_request_id][:decision]).to eq("deny")
    expect(rows_by_request_id[constraint_failed_request_id][:deny_reason]).to eq("constraint_failed")
    expect(rows_by_request_id[rest_deny_request_id][:decision]).to eq("deny")
    expect(rows_by_request_id[rest_deny_request_id][:surface]).to eq("rest")

    allow_row = db[:audit_events].where(agent_id: agent_id, surface: "mcp", decision: "allow").first
    expect(allow_row).not_to be_nil
    expect(allow_row[:args_redacted].to_json).not_to include(AGENT_E2E_SECRET)

    # No secret appears anywhere in AMG's own output: audit rows, logs, or
    # AMG-authored error bodies (SPEC §16.3). The upstream's own verbatim
    # response body is out of scope (no response-body DLP in v1, ADR-0007) —
    # proven separately above via requests_received, not via response echo.
    all_audit_text = db[:audit_events].where(agent_id: agent_id).all.join("\n")
    expect(all_audit_text).not_to include(AGENT_E2E_SECRET)
    expect(log_capture.string).not_to include(AGENT_E2E_SECRET)
    expect(deny_response.body).not_to include(AGENT_E2E_SECRET)
    expect(allow_response.body).not_to include(AGENT_E2E_SECRET)
  end
end
