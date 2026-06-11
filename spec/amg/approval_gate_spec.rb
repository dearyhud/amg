# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::ApprovalGate do
  subject(:gate) do
    described_class.new(db: db, router: router, notifier: notifier, clock: -> { now })
  end

  let(:db) { DbSchema.connect }
  let(:router) { Fakes::Router.new }
  let(:notifier) { Fakes::Notifier.new }
  let(:now) { Time.now.utc }
  let(:identity) { build_identity }
  let(:rule) { { match: "*delete*", require: "human", timeout: 900 } }

  def park(arguments: { "page_id" => "p1" })
    gate.park(identity: identity, tool: "notion__delete_page",
              arguments: arguments, rule: rule, request_id: "req-1")
  end

  it "parks the call as pending with the policy timeout and notifies" do
    id = park
    row = db[:approvals].first
    expect(row[:id]).to eq(id)
    expect(row[:state]).to eq("pending")
    expect(AMG::Util.to_time(row[:expires_at]).to_i).to eq((now + 900).to_i)
    expect(notifier.notifications).to contain_exactly(
      hash_including(approval_id: id, tool: "notion__delete_page", agent: "test-agent")
    )
    expect(router.calls).to be_empty
  end

  it "approval forwards the exact original payload" do
    id = park(arguments: { "page_id" => "p1", "force" => true })
    result = gate.resolve(id, approver: "deary", approve: true)

    expect(router.calls.size).to eq(1)
    expect(router.calls.first.tool).to eq("notion__delete_page")
    expect(router.calls.first.arguments).to eq("page_id" => "p1", "force" => true)
    expect(result).to eq(router.result)

    row = db[:approvals].first
    expect(row[:state]).to eq("approved")
    expect(row[:approver]).to eq("deary")
    expect(JSON.parse(row[:payload])["result"]).to eq(router.result)
  end

  it "denial resolves without forwarding" do
    id = park
    gate.resolve(id, approver: "deary", approve: false)
    expect(router.calls).to be_empty
    expect(db[:approvals].first[:state]).to eq("denied")
  end

  it "refuses to resolve twice" do
    id = park
    gate.resolve(id, approver: "deary", approve: false)
    expect { gate.resolve(id, approver: "deary", approve: true) }
      .to raise_error(AMG::ApprovalError, /denied, not pending/)
    expect(router.calls).to be_empty
  end

  it "expires unresolved approvals instead of forwarding them" do
    id = park
    late = described_class.new(db: db, router: router, clock: -> { now + 901 })
    expect { late.resolve(id, approver: "deary", approve: true) }
      .to raise_error(AMG::ApprovalError, /expired/)
    expect(router.calls).to be_empty
    expect(db[:approvals].first[:state]).to eq("expired")
  end

  describe "#check" do
    it "reports state to the owning agent, including the result once approved" do
      id = park
      expect(gate.check(id, agent_id: identity.agent_id)).to eq(state: "pending", result: nil)

      gate.resolve(id, approver: "deary", approve: true)
      expect(gate.check(id, agent_id: identity.agent_id))
        .to eq(state: "approved", result: router.result)
    end

    it "hides other agents' approvals and unknown ids identically" do
      id = park
      expect(gate.check(id, agent_id: "someone-else")).to be_nil
      expect(gate.check("nope", agent_id: identity.agent_id)).to be_nil
    end

    it "reports expiry lazily" do
      id = park
      late = described_class.new(db: db, router: router, clock: -> { now + 901 })
      expect(late.check(id, agent_id: identity.agent_id)).to eq(state: "expired", result: nil)
    end
  end

  it "a failing notifier does not lose the park" do
    boom = ->(**) { raise "slack is down" }
    gate = described_class.new(db: db, router: router, notifier: boom, clock: -> { now })
    id = gate.park(identity: identity, tool: "notion__delete_page",
                   arguments: {}, rule: rule, request_id: "req-1")
    expect(db[:approvals].where(id: id).first[:state]).to eq("pending")
  end
end
