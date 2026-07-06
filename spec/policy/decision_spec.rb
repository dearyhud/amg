require "spec_helper"

RSpec.describe AMG::Policy::Decision do
  it "builds an allow decision" do
    decision = described_class.allow(matched_rule: "rule-1")
    expect(decision.allowed?).to be true
    expect(decision.denied?).to be false
    expect(decision.matched_rule).to eq("rule-1")
    expect(decision.reason).to be_nil
  end

  it "builds a deny decision with a reason" do
    decision = described_class.deny(:no_rule)
    expect(decision.allowed?).to be false
    expect(decision.denied?).to be true
    expect(decision.reason).to eq(:no_rule)
    expect(decision.matched_rule).to be_nil
  end

  it "is frozen" do
    expect(described_class.deny(:no_rule)).to be_frozen
  end

  it "compares equal by allowed/reason/matched_rule" do
    reason = :no_rule
    matched_rule = "a"
    expect(described_class.deny(reason)).to eq(described_class.deny(:no_rule))
    expect(described_class.allow(matched_rule: matched_rule)).to eq(described_class.allow(matched_rule: "a"))
    expect(described_class.deny(:no_rule)).not_to eq(described_class.deny(:no_policy))
    expect(described_class.deny(:no_rule)).not_to eq("not a decision")
  end
end
