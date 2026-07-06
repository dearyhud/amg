require "spec_helper"

RSpec.describe AMG::Policy::RuleMatcher do
  def rule(constraints: [], strict_args: false)
    { "constraints" => constraints, "strict_args" => strict_args }
  end

  it "matches a rule with no constraints against any args" do
    result = described_class.evaluate(rule, { "anything" => 1 })
    expect(result.matched?).to be true
  end

  it "fails when any constraint fails" do
    constraints = [{ "path" => "/owner", "op" => "eq", "value" => "backpackpay" }]
    result = described_class.evaluate(rule(constraints: constraints), { "owner" => "other" })
    expect(result.matched?).to be false
    expect(result.constraints_ok).to be false
  end

  it "passes when all constraints pass" do
    constraints = [
      { "path" => "/owner", "op" => "eq", "value" => "backpackpay" },
      { "path" => "/repo", "op" => "eq", "value" => "support-tickets" }
    ]
    args = { "owner" => "backpackpay", "repo" => "support-tickets" }
    expect(described_class.evaluate(rule(constraints: constraints), args).matched?).to be true
  end

  describe "strict_args" do
    let(:constraints) { [{ "path" => "/owner", "op" => "eq", "value" => "backpackpay" }] }

    it "matches when args contain only referenced keys" do
      result = described_class.evaluate(rule(constraints: constraints, strict_args: true), { "owner" => "backpackpay" })
      expect(result.matched?).to be true
    end

    it "does not match when args contain an unreferenced key" do
      args = { "owner" => "backpackpay", "extra" => "x" }
      result = described_class.evaluate(rule(constraints: constraints, strict_args: true), args)
      expect(result.constraints_ok).to be true
      expect(result.unexpected_arg).to be true
      expect(result.matched?).to be false
    end

    it "does not check unexpected args when constraints already failed" do
      args = { "owner" => "other", "extra" => "x" }
      result = described_class.evaluate(rule(constraints: constraints, strict_args: true), args)
      expect(result.constraints_ok).to be false
      expect(result.unexpected_arg).to be false
    end

    it "treats a nested pointer as referencing its top-level segment" do
      nested = [{ "path" => "/body/amount", "op" => "eq", "value" => 100 }]
      args = { "body" => { "amount" => 100 } }
      result = described_class.evaluate(rule(constraints: nested, strict_args: true), args)
      expect(result.matched?).to be true
    end

    it "does not raise when args is not a Hash" do
      result = described_class.evaluate(rule(constraints: [], strict_args: true), nil)
      expect(result.matched?).to be true
    end
  end
end
