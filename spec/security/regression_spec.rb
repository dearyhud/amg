# frozen_string_literal: true

require "spec_helper"
require_relative "../support/app_harness"

# The suite that must pass before any deploy (design doc §14/§15).
RSpec.describe "security regressions" do
  include_context "mcp app"

  describe "roles are never agent-declared" do
    it "ignores role claims smuggled into params and arguments" do
      response = rpc("tools/call", {
                       "name" => "stripe__get_payment_intents",
                       "arguments" => { "limit" => 1 },
                       "role" => "admin",
                       "_meta" => { "role" => "admin" }
                     })
      expect(tool_text(response)["code"]).to eq("amg.denied")
      expect(router.calls).to be_empty
    end

    it "resolves the role from the token even when headers claim otherwise" do
      header "X-Amg-Role", "admin"
      header "X-Role", "admin"
      names = rpc("tools/list").dig("result", "tools").map { |t| t["name"] }
      expect(names).not_to include("stripe__get_payment_intents")
    end
  end

  describe "namespace confusion" do
    [
      "notion__../stripe__x",
      "notion__..__stripe__x/",
      "../notion__get_pages",
      "notion//get_pages",
      "notion__get_pages ",
      "notion__get_pages\0",
      "NOTION__GET_PAGES",
      "stripe__get_payment_intents;notion__get_pages"
    ].each do |name|
      it "rejects #{name.inspect} before routing" do
        response = call_tool(name, {})
        expect(tool_text(response)["code"]).to eq("amg.denied")
        expect(router.calls).to be_empty
        expect(audit_rows.last[:decision]).to eq("deny")
      end
    end
  end

  describe "argument smuggling" do
    it "denies undeclared arguments on constrained tools" do
      response = call_tool("notion__get_pages",
                           { "workspace_id" => "ws_abc123", "admin_override" => true })
      expect(tool_text(response)["code"]).to eq("amg.denied")
      expect(router.calls).to be_empty
    end

    it "denies constraint keys supplied as symbol-lookalike duplicates" do
      response = call_tool("notion__get_pages",
                           { "workspace_id" => "ws_abc123", "workspace_id " => "ws_evil" })
      expect(tool_text(response)["code"]).to eq("amg.denied")
    end
  end

  describe "token lifecycle" do
    it "rejects replay after revocation, including the cached window" do
      issued = issuer.issue(agent_id: agent_id)
      call_tool("notion__get_users", {}, bearer: issued[:token])
      expect(last_response.status).to eq(200)

      issuer.revoke(issued[:id])
      call_tool("notion__get_users", {}, bearer: issued[:token])
      expect(last_response.status).to eq(401)
    end

    it "rejects tokens of suspended agents" do
      db[:agents].where(id: agent_id).update(status: "suspended")
      call_tool("notion__get_users", {})
      expect(last_response.status).to eq(401)
    end
  end

  describe "oversized payloads" do
    it "rejects bodies over the cap before parsing" do
      header "Authorization", "Bearer #{token}"
      huge = JSON.generate(jsonrpc: "2.0", id: 1, method: "tools/call",
                           params: { "name" => "notion__get_users",
                                     "arguments" => { "pad" => "x" * (2 << 20) } })
      post "/mcp", huge
      expect(last_response.status).to eq(413)
      expect(router.calls).to be_empty
    end
  end

  describe "fail closed" do
    it "denies when the stored policy is malformed instead of passing through" do
      db[:roles].where(id: role_id).update(policy: JSON.generate("servers" => "garbage"))
      redis.flushdb # drop the cached identity

      response = call_tool("notion__get_pages", { "workspace_id" => "ws_abc123" })
      expect(tool_text(response)["code"]).to eq("amg.denied")
      expect(router.calls).to be_empty
    end

    it "approval ids of other agents are unguessable-or-nothing" do
      approval_id = tool_text(call_tool("notion__delete_page", {})).dig("data", "approval_id")

      other_role = SecureRandom.uuid
      other_agent = SecureRandom.uuid
      db[:roles].insert(id: other_role, name: "other", policy: JSON.generate(policy),
                        policy_version: 1, enforcement: "enforce",
                        created_at: Time.now.utc, updated_at: Time.now.utc)
      db[:agents].insert(id: other_agent, name: "other-agent", role_id: other_role,
                         status: "active", created_at: Time.now.utc)
      other_token = issuer.issue(agent_id: other_agent)[:token]

      response = call_tool("amg__check_approval", { "approval_id" => approval_id },
                           bearer: other_token)
      expect(tool_text(response)["code"]).to eq("amg.not_found")
    end
  end
end
