# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Policy::Engine do
  subject(:engine) { described_class.new(policy) }

  let(:policy) do
    {
      servers: {
        notion: {
          tools: [
            { name: "get_pages",
              constraints: { workspace_id: { in: ["ws_abc123"] } } },
            { name: "get_users" }
          ]
        }
      },
      approvals: [{ match: "*delete*", require: "human", timeout: 900 }]
    }
  end

  describe "#visible_tools" do
    it "namespaces tools by server" do
      expect(engine.visible_tools)
        .to contain_exactly("notion__get_pages", "notion__get_users")
    end

    it "is empty for an empty policy" do
      expect(described_class.new({}).visible_tools).to eq([])
    end
  end

  describe "#authorize" do
    it "allows a granted tool within constraints" do
      decision = engine.authorize(
        tool: "notion__get_pages",
        arguments: { "workspace_id" => "ws_abc123" }
      )
      expect(decision).to be_allow
    end

    it "denies when a constraint fails" do
      decision = engine.authorize(
        tool: "notion__get_pages",
        arguments: { "workspace_id" => "ws_evil" }
      )
      expect(decision.verdict).to eq(:deny)
      expect(decision.reason).to match(/constraint failed/)
    end

    it "denies tools not granted to the role" do
      decision = engine.authorize(tool: "notion__delete_page", arguments: {})
      expect(decision.verdict).to eq(:deny)
      expect(decision.reason).to eq("tool not granted to role")
    end

    it "denies tools on servers not in the policy" do
      decision = engine.authorize(tool: "stripe__get_payment_intents", arguments: {})
      expect(decision.verdict).to eq(:deny)
    end

    it "denies unexpected arguments on constrained tools" do
      decision = engine.authorize(
        tool: "notion__get_pages",
        arguments: { "workspace_id" => "ws_abc123", "include_archived" => true }
      )
      expect(decision.verdict).to eq(:deny)
      expect(decision.reason).to match(/unexpected argument/)
    end

    it "permits declared allow_args alongside constraints" do
      policy[:servers][:notion][:tools][0][:allow_args] = ["page_size"]
      decision = engine.authorize(
        tool: "notion__get_pages",
        arguments: { "workspace_id" => "ws_abc123", "page_size" => 10 }
      )
      expect(decision).to be_allow
    end

    it "leaves unconstrained tools free of the unknown-arg check" do
      decision = engine.authorize(tool: "notion__get_users", arguments: { "anything" => 1 })
      expect(decision).to be_allow
    end

    it "routes destructive tools to approval" do
      policy[:servers][:notion][:tools] << { name: "delete_page" }
      decision = engine.authorize(tool: "notion__delete_page", arguments: { "page_id" => "p1" })
      expect(decision).to be_needs_approval
    end

    it "checks constraints before approval routing" do
      policy[:servers][:notion][:tools] << {
        name: "delete_page", constraints: { workspace_id: { eq: "ws_abc123" } }
      }
      decision = engine.authorize(tool: "notion__delete_page",
                                  arguments: { "workspace_id" => "ws_evil" })
      expect(decision.verdict).to eq(:deny)
    end

    it "denies malformed tool names outright" do
      ["notion__../stripe__x", "no_namespace", "", "notion__GET_PAGES", nil].each do |tool|
        decision = engine.authorize(tool: tool, arguments: {})
        expect(decision.verdict).to eq(:deny), "expected deny for #{tool.inspect}"
        expect(decision.reason).to eq("malformed tool name")
      end
    end

    it "fails closed when the policy document is garbage" do
      garbage = described_class.new(servers: "not a hash")
      expect(garbage.authorize(tool: "notion__get_pages", arguments: {}).verdict).to eq(:deny)

      nested_garbage = described_class.new(servers: { notion: { tools: "nope" } })
      expect(nested_garbage.authorize(tool: "notion__get_pages", arguments: {}).verdict).to eq(:deny)
    end

    it "fails closed when arguments are not a hash" do
      decision = engine.authorize(tool: "notion__get_pages", arguments: "ws_abc123")
      expect(decision.verdict).to eq(:deny)
    end
  end

  describe "#approval_rule" do
    it "matches globs against the namespaced name" do
      expect(engine.approval_rule("notion__delete_page")).to include(match: "*delete*")
      expect(engine.approval_rule("notion__get_pages")).to be_nil
    end
  end

  describe "#redactions_for" do
    it "returns the tool's redaction list" do
      policy[:servers][:notion][:tools][0][:redact] = ["query"]
      expect(engine.redactions_for("notion__get_pages")).to eq(["query"])
      expect(engine.redactions_for("notion__get_users")).to eq([])
      expect(engine.redactions_for("bogus")).to eq([])
    end
  end
end
