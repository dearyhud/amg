# frozen_string_literal: true

# Full data-plane harness: real authenticator, policy engine, rate limiter,
# audit, and approval gate over SQLite + MockRedis; fake upstream registry
# and router. Specs talk to the app exactly like an agent does.
RSpec.shared_context "mcp app" do
  include Rack::Test::Methods

  let(:db) { DbSchema.connect }
  let(:redis) { MockRedis.new }
  let(:registry) do
    Fakes::Registry.new(tools: [
                          { name: "notion__get_pages", description: "Get pages",
                            inputSchema: { type: "object" } },
                          { name: "notion__get_users", description: "Get users",
                            inputSchema: { type: "object" } },
                          { name: "notion__delete_page", description: "Delete a page",
                            inputSchema: { type: "object" } },
                          { name: "stripe__get_payment_intents", description: "List PIs",
                            inputSchema: { type: "object" } }
                        ])
  end
  let(:router) { Fakes::Router.new }
  let(:audit) { AMG::Audit.new(db: db) }
  let(:approval_gate) { AMG::ApprovalGate.new(db: db, router: router) }
  let(:issuer) { AMG::Auth::TokenIssuer.new(db: db, redis: redis) }

  let(:policy) do
    {
      role: "notion_read",
      enforcement: "enforce",
      servers: {
        notion: {
          tools: [
            { name: "get_pages", constraints: { workspace_id: { in: ["ws_abc123"] } } },
            { name: "get_users" },
            { name: "delete_page" }
          ]
        }
      },
      limits: {},
      approvals: [{ match: "*delete*", require: "human", timeout: 900 }]
    }
  end
  let(:enforcement) { "enforce" }

  let(:role_id) { SecureRandom.uuid }
  let(:agent_id) { SecureRandom.uuid }
  let(:token) { issuer.issue(agent_id: agent_id)[:token] }

  let(:app) do
    AMG::MCP::App.new(
      authenticator: AMG::Auth::TokenAuthenticator.new(db: db, redis: redis),
      registry: registry,
      router: router,
      audit: audit,
      rate_limiter: AMG::RateLimiter.new(redis: redis),
      approval_gate: approval_gate
    )
  end

  before do
    db[:roles].insert(id: role_id, name: policy[:role], policy: JSON.generate(policy),
                      policy_version: 1, enforcement: enforcement,
                      created_at: Time.now.utc, updated_at: Time.now.utc)
    db[:agents].insert(id: agent_id, name: "test-agent", role_id: role_id,
                       status: "active", created_at: Time.now.utc)
  end

  def rpc(method, params = {}, id: 1, bearer: token)
    header "Authorization", "Bearer #{bearer}" if bearer
    header "Content-Type", "application/json"
    post "/mcp", JSON.generate(jsonrpc: "2.0", id: id, method: method, params: params)
    JSON.parse(last_response.body) unless last_response.body.empty?
  end

  def call_tool(name, arguments = {}, **kwargs)
    rpc("tools/call", { "name" => name, "arguments" => arguments }, **kwargs)
  end

  def tool_text(response)
    JSON.parse(response.dig("result", "content", 0, "text"))
  end

  def audit_rows = db[:audit_events].order(:id).all
end
