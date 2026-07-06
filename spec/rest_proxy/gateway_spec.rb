require "spec_helper"
require "rack/test"
require_relative "../../lib/amg/server/app"
require_relative "../fixtures/fixture_rest_server"

RSpec.describe "REST proxy" do
  include Rack::Test::Methods

  def app
    AMG::Server::App.app
  end

  let(:db) { AMG::Spec::Database.connect }
  let(:workspace_id) { AMG::Store::Bootstrap.ensure_workspace(db) }
  let(:master_key) { AMG::Spec::TEST_MASTER_KEY }

  let!(:fixture_server) { AMG::Spec::FixtureRestServer.start }
  let!(:upstream_id) do
    id = db[:upstreams].returning(:id).insert(
      workspace_id: workspace_id,
      slug: "treasury",
      display_name: "Treasury",
      kind: "rest",
      config: Sequel.pg_jsonb({
                                "base_url" => "http://127.0.0.1:#{fixture_server.port}",
                                "headers" => { "Authorization" => "Basic {{secret:tp_basic}}" },
                                "timeout_ms" => 5000
                              })
    ).first[:id]
    AMG::Store::Secrets.write(db, id, "tp_basic", "supersecretcreds", master_key)
    id
  end
  let!(:agent_id) do
    db[:agents].returning(:id).insert(workspace_id: workspace_id, slug: "deploy-bot",
                                      display_name: "Deploy Bot").first[:id]
  end
  let(:api_key) { AMG::Crypto::ApiKey.generate }

  after { fixture_server.stop }

  before do
    db[:agent_api_keys].insert(agent_id: agent_id, key_hash: Sequel.blob(api_key[:hash]), prefix: api_key[:prefix])

    policy_id = db[:policies].returning(:id).insert(workspace_id: workspace_id, name: "payments-limited").first[:id]
    db[:policy_rules].insert(
      policy_id: policy_id, upstream_id: upstream_id, target: "POST /book",
      constraints: Sequel.pg_jsonb([
                                     { "path" => "/body/amount", "op" => "lte", "value" => 10_000 },
                                     { "path" => "/body/currency", "op" => "eq", "value" => "USD" }
                                   ])
    )
    db[:policy_rules].insert(
      policy_id: policy_id, upstream_id: upstream_id, target: "GET /accounts/**", constraints: Sequel.pg_jsonb([])
    )
    db[:agent_policy_bindings].insert(agent_id: agent_id, policy_id: policy_id)
  end

  def call(method, path, body: nil)
    header "Authorization", "Bearer #{api_key[:plaintext]}"
    header "Content-Type", "application/json" if body
    send(method, "/proxy/treasury#{path}", body&.to_json)
  end

  it "forwards an allowed request with injected credentials, not the agent's own header" do
    call(:post, "/book", body: { amount: 5000, currency: "USD" })

    expect(last_response.status).to eq(200)
    parsed = JSON.parse(last_response.body)
    expect(parsed["booked"]).to be true
    expect(fixture_server.requests_received.last[:authorization]).to eq("Basic supersecretcreds")
  end

  it "allows a glob-matched read route" do
    call(:get, "/accounts/123")
    expect(last_response.status).to eq(200)
    expect(JSON.parse(last_response.body)["account"]).to eq("123")
  end

  it "denies a body that violates constraints with 403 constraint_failed" do
    call(:post, "/book", body: { amount: 999_999, currency: "USD" })

    expect(last_response.status).to eq(403)
    parsed = JSON.parse(last_response.body)
    expect(parsed["error"]).to eq("amg_denied")
    expect(parsed["reason"]).to eq("constraint_failed")
  end

  it "denies an unrouted method/path with no_rule" do
    call(:delete, "/book")
    expect(last_response.status).to eq(403)
    expect(JSON.parse(last_response.body)["reason"]).to eq("no_rule")
  end

  it "writes an audit row with the secret redacted from args" do
    call(:post, "/book", body: { amount: 5000, currency: "USD" })
    AMG.audit.wait_until_empty

    row = db[:audit_events].where(agent_id: agent_id, surface: "rest").first
    expect(row[:decision]).to eq("allow")
    expect(row[:upstream_status]).to eq(200)
    expect(row[:args_redacted].to_json).not_to include("supersecretcreds")
  end
end
