# frozen_string_literal: true

require "spec_helper"
require_relative "../../support/app_harness"

RSpec.describe AMG::MCP::App do
  include_context "mcp app"

  describe "protocol plumbing" do
    it "completes the MCP handshake" do
      response = rpc("initialize", { "protocolVersion" => "2025-06-18" })
      expect(last_response.status).to eq(200)
      expect(response.dig("result", "serverInfo", "name")).to eq("amg")
      expect(response.dig("result", "protocolVersion")).to eq("2025-06-18")
    end

    it "answers ping and rejects unknown methods" do
      expect(rpc("ping")["result"]).to eq({})
      expect(rpc("resources/list").dig("error", "code")).to eq(-32_601)
    end

    it "accepts notifications with a 202" do
      header "Authorization", "Bearer #{token}"
      post "/mcp", JSON.generate(jsonrpc: "2.0", method: "notifications/initialized")
      expect(last_response.status).to eq(202)
    end

    it "propagates a request id header" do
      rpc("ping")
      expect(last_response.headers["x-request-id"]).to match(/\A[0-9a-f-]{36}\z/)
    end

    it "404s other paths, 405s other verbs, 400s garbage" do
      get "/mcp"
      expect(last_response.status).to eq(405)
      post "/other"
      expect(last_response.status).to eq(404)

      header "Authorization", "Bearer #{token}"
      post "/mcp", "not json"
      expect(last_response.status).to eq(400)
      expect(JSON.parse(last_response.body).dig("error", "code")).to eq(-32_700)
    end
  end

  describe "authentication" do
    it "401s missing and invalid tokens with a JSON-RPC error" do
      expect(rpc("tools/list", bearer: nil)).to include("error")
      expect(last_response.status).to eq(401)

      rpc("tools/list", bearer: "amg_forged")
      expect(last_response.status).to eq(401)
    end
  end

  describe "tools/list visibility" do
    it "shows only role-granted tools plus AMG natives" do
      names = rpc("tools/list").dig("result", "tools").map { |t| t["name"] }
      expect(names).to contain_exactly(
        "notion__get_pages", "notion__get_users", "notion__delete_page",
        "amg__check_approval"
      )
      expect(names).not_to include("stripe__get_payment_intents")
    end
  end

  describe "tools/call enforcement" do
    it "forwards an allowed call and audits it" do
      response = call_tool("notion__get_pages", { "workspace_id" => "ws_abc123" })

      expect(response.dig("result", "content", 0, "text")).to eq("ok")
      expect(router.calls.map(&:tool)).to eq(["notion__get_pages"])

      row = audit_rows.last
      expect(row[:decision]).to eq("allow")
      expect(row[:upstream_status]).to eq("ok")
      expect(row[:latency_ms]).to be_a(Integer)
    end

    it "denies constraint violations in-band without touching the upstream" do
      response = call_tool("notion__get_pages", { "workspace_id" => "ws_evil" })

      expect(response.dig("result", "isError")).to be true
      expect(tool_text(response)["code"]).to eq("amg.denied")
      expect(router.calls).to be_empty
      expect(audit_rows.last[:decision]).to eq("deny")
      expect(audit_rows.last[:deny_reason]).to match(/constraint failed/)
    end

    it "denies tools outside the role" do
      response = call_tool("stripe__get_payment_intents", { "limit" => 1 })
      expect(tool_text(response)["code"]).to eq("amg.denied")
      expect(router.calls).to be_empty
    end

    it "maps upstream failure to a tool error and audits the status" do
      router.error = AMG::UpstreamTimeout.new("slow")
      response = call_tool("notion__get_pages", { "workspace_id" => "ws_abc123" })
      expect(tool_text(response)["code"]).to eq("amg.upstream_timeout")
      expect(audit_rows.last[:upstream_status]).to eq("timeout")
    end
  end

  describe "shadow mode" do
    let(:enforcement) { "shadow" }

    it "logs the would-be deny but forwards anyway" do
      response = call_tool("notion__get_pages", { "workspace_id" => "ws_evil" })

      expect(response.dig("result", "content", 0, "text")).to eq("ok")
      expect(router.calls.size).to eq(1)

      row = audit_rows.last
      expect(row[:decision]).to eq("shadow_deny")
      expect(row[:deny_reason]).to match(/constraint failed/)
    end
  end

  describe "rate limiting" do
    let(:policy) { super().merge(limits: { rate: { limit: 2, period: 60 } }) }

    it "returns amg.rate_limited with a retry hint once the bucket fills" do
      2.times { call_tool("notion__get_users") }
      response = call_tool("notion__get_users")

      body = tool_text(response)
      expect(body["code"]).to eq("amg.rate_limited")
      expect(body.dig("data", "retry_after_ms")).to be_a(Integer)
      expect(router.calls.size).to eq(2)
      expect(audit_rows.last[:deny_reason]).to match(/rate_limited/)
    end
  end

  describe "approval flow" do
    it "parks destructive calls, then releases the result after approval" do
      response = call_tool("notion__delete_page", { "page_id" => "p1" })

      body = tool_text(response)
      expect(response.dig("result", "isError")).to be false
      expect(body["code"]).to eq("amg.pending_approval")
      approval_id = body.dig("data", "approval_id")
      expect(approval_id).not_to be_nil
      expect(router.calls).to be_empty
      expect(audit_rows.last[:decision]).to eq("needs_approval")

      pending = call_tool("amg__check_approval", { "approval_id" => approval_id })
      expect(tool_text(pending).dig("data", "state")).to eq("pending")

      approval_gate.resolve(approval_id, approver: "deary", approve: true)
      expect(router.calls.map(&:tool)).to eq(["notion__delete_page"])

      done = call_tool("amg__check_approval", { "approval_id" => approval_id })
      expect(done.dig("result", "content", 0, "text")).to eq("ok")
    end

    it "reports denial to the agent" do
      approval_id = tool_text(call_tool("notion__delete_page", {})).dig("data", "approval_id")
      approval_gate.resolve(approval_id, approver: "deary", approve: false)

      response = call_tool("amg__check_approval", { "approval_id" => approval_id })
      expect(tool_text(response).dig("data", "state")).to eq("denied")
      expect(router.calls).to be_empty
    end
  end

  describe "argument redaction in audit" do
    let(:policy) do
      base = super()
      base[:servers][:notion][:tools][0] =
        { name: "get_pages", constraints: { workspace_id: { in: ["ws_abc123"] } },
          allow_args: ["query"], redact: ["query"] }
      base
    end

    it "persists redacted arguments only" do
      call_tool("notion__get_pages", { "workspace_id" => "ws_abc123", "query" => "secret thing" })
      args = JSON.parse(audit_rows.last[:arguments])
      expect(args["query"]).to eq("[REDACTED]")
      expect(audit_rows.last[:arguments]).not_to include("secret thing")
    end
  end
end
