# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Upstream::Router do
  subject(:router) { described_class.new(registry: registry, secrets: secrets) }

  let(:db) { DbSchema.connect }
  let(:secrets) do
    AMG::Secrets::Env.new(env: { "AMG_SECRET_STRIPE_KEY" => "sk_test_1",
                                 "AMG_SECRET_NOTION_KEY" => "ntn_1" })
  end
  let(:mcp_client) { instance_double(AMG::Upstream::McpClient) }
  let(:registry) do
    AMG::Upstream::Registry.new(db: db, secrets: secrets,
                                mcp_client_factory: ->(_u) { mcp_client })
  end

  before do
    db[:upstreams].insert(id: SecureRandom.uuid, name: "notion", kind: "mcp",
                          endpoint: "https://mcp.notion.example/mcp",
                          vault_path: "notion/key", created_at: Time.now.utc)
    db[:upstreams].insert(id: SecureRandom.uuid, name: "stripe", kind: "http",
                          endpoint: "https://api.stripe.com",
                          vault_path: "stripe/key", created_at: Time.now.utc)
  end

  it "routes namespaced tools to the right MCP upstream" do
    expect(mcp_client).to receive(:call_tool)
      .with("get_pages", { "workspace_id" => "ws_1" })
      .and_return({ "content" => [] })
    router.forward(tool: "notion__get_pages", arguments: { "workspace_id" => "ws_1" })
  end

  it "routes http upstreams through the adapter with the brokered credential" do
    stub = stub_request(:get, "https://api.stripe.com/v1/payment_intents")
           .with(headers: { "Authorization" => "Bearer sk_test_1" })
           .to_return(status: 200, body: "{}")
    router.forward(tool: "stripe__get_payment_intents", arguments: {})
    expect(stub).to have_been_requested
  end

  it "fails closed on unknown upstreams and malformed names" do
    expect { router.forward(tool: "ghost__tool", arguments: {}) }
      .to raise_error(AMG::UnknownUpstream)
    expect { router.forward(tool: "not-a-tool", arguments: {}) }
      .to raise_error(AMG::Error, /malformed/)
  end

  describe AMG::Upstream::Registry do
    it "namespaces and unions tool lists, hiding unreachable upstreams" do
      allow(mcp_client).to receive(:list_tools).and_raise(AMG::UpstreamError, "down")
      names = registry.all_tools.map { |t| t[:name] }
      expect(names).to include("stripe__get_payment_intents", "stripe__get_customer")
      expect(names.none? { |n| n.start_with?("notion__") }).to be true
    end

    it "serves tool_exists? for the policy compiler" do
      allow(mcp_client).to receive(:list_tools).and_return([{ "name" => "get_pages" }])
      expect(registry.tool_exists?("notion", "get_pages")).to be true
      expect(registry.tool_exists?("notion", "delete_page")).to be false
      expect(registry.tool_exists?("stripe", "get_customer")).to be true
    end
  end
end
