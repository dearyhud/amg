# frozen_string_literal: true

module IdentityHelpers
  DEFAULT_POLICY = {
    role: "notion_read",
    enforcement: "enforce",
    servers: {
      notion: {
        tools: [
          { name: "get_pages", constraints: { workspace_id: { in: ["ws_abc123"] } } },
          { name: "get_users" }
        ]
      }
    },
    limits: {},
    approvals: [{ match: "*delete*", require: "human", timeout: 900 }]
  }.freeze

  def build_identity(policy: DEFAULT_POLICY, enforcement: nil, agent_id: "agent-1",
                     agent_name: "test-agent", role_name: nil, policy_version: 1)
    AMG::AgentIdentity.new(
      agent_id: agent_id,
      agent_name: agent_name,
      role_name: role_name || policy[:role] || "test_role",
      policy: policy,
      policy_version: policy_version,
      enforcement: enforcement || policy[:enforcement] || "enforce"
    )
  end
end

RSpec.configure { |c| c.include IdentityHelpers }
