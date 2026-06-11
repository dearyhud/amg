# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Audit do
  subject(:audit) { described_class.new(db: db) }

  let(:db) { DbSchema.connect }
  let(:identity) { build_identity(policy_version: 7) }

  it "records the full decision context" do
    audit.record(
      identity: identity, tool: "notion__get_pages",
      arguments: { "workspace_id" => "ws_abc123" },
      decision: "allow", request_id: "req-1",
      upstream_status: "ok", latency_ms: 42
    )

    row = db[:audit_events].first
    expect(row[:agent_id]).to eq(identity.agent_id)
    expect(row[:role_name]).to eq("notion_read")
    expect(row[:policy_version]).to eq(7)
    expect(row[:tool]).to eq("notion__get_pages")
    expect(JSON.parse(row[:arguments])).to eq("workspace_id" => "ws_abc123")
    expect(row[:decision]).to eq("allow")
    expect(row[:upstream_status]).to eq("ok")
    expect(row[:latency_ms]).to eq(42)
    expect(row[:request_id]).to eq("req-1")
  end

  it "redacts listed argument keys before persistence" do
    audit.record(
      identity: identity, tool: "notion__search",
      arguments: { "query" => "salary spreadsheet", "workspace_id" => "ws_abc123" },
      decision: "allow", request_id: "req-2", redact: ["query"]
    )

    args = JSON.parse(db[:audit_events].first[:arguments])
    expect(args["query"]).to eq(AMG::Audit::REDACTED)
    expect(args["workspace_id"]).to eq("ws_abc123")
    expect(db[:audit_events].first[:arguments]).not_to include("salary")
  end

  it "records deny decisions with their reason" do
    audit.record(
      identity: identity, tool: "notion__delete_page", arguments: {},
      decision: "deny", deny_reason: "tool not granted to role", request_id: "req-3"
    )
    row = db[:audit_events].first
    expect(row[:decision]).to eq("deny")
    expect(row[:deny_reason]).to eq("tool not granted to role")
  end

  it "tolerates non-hash arguments" do
    audit.record(identity: identity, tool: "t__t", arguments: nil,
                 decision: "deny", request_id: "req-4")
    expect(JSON.parse(db[:audit_events].first[:arguments])).to eq({})
  end
end
