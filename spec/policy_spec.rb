require "spec_helper"

RSpec.describe AMG::Policy do
  # SPEC §8.3 worked example: support-triage role, github upstream.
  let(:rules) do
    [
      {
        "id" => "rule-create-issue",
        "target" => "create_issue",
        "constraints" => [
          { "path" => "/owner", "op" => "eq", "value" => "backpackpay" },
          { "path" => "/repo", "op" => "eq", "value" => "support-tickets" }
        ],
        "strict_args" => false,
        "created_at" => Time.at(1)
      },
      {
        "id" => "rule-get-issue",
        "target" => "get_issue",
        "constraints" => [],
        "strict_args" => false,
        "created_at" => Time.at(2)
      }
    ]
  end

  it "denies no_policy when the agent has no bound policies" do
    decision = described_class.decide(rules: [], target: "get_issue", args: {}, has_bound_policies: false)
    expect(decision).to eq(AMG::Policy::Decision.deny(:no_policy))
  end

  it "denies no_rule for a tool with no matching rule" do
    decision = described_class.decide(rules: rules, target: "delete_repository", args: {}, has_bound_policies: true)
    expect(decision).to eq(AMG::Policy::Decision.deny(:no_rule))
  end

  it "allows a tool with an unconstrained rule" do
    decision = described_class.decide(rules: rules, target: "get_issue", args: { "issue" => 1 },
                                      has_bound_policies: true)
    expect(decision.allowed?).to be true
    expect(decision.matched_rule).to eq("rule-get-issue")
  end

  it "allows create_issue in the constrained repo" do
    args = { "owner" => "backpackpay", "repo" => "support-tickets" }
    decision = described_class.decide(rules: rules, target: "create_issue", args: args, has_bound_policies: true)
    expect(decision.allowed?).to be true
    expect(decision.matched_rule).to eq("rule-create-issue")
  end

  it "denies constraint_failed for create_issue on a different repo" do
    args = { "owner" => "backpackpay", "repo" => "payments-core" }
    decision = described_class.decide(rules: rules, target: "create_issue", args: args, has_bound_policies: true)
    expect(decision).to eq(AMG::Policy::Decision.deny(:constraint_failed))
  end

  it "matches * targets as a catch-all rule" do
    star_rules = [{ "id" => "r", "target" => "*", "constraints" => [], "strict_args" => false,
                    "created_at" => Time.at(1) }]
    decision = described_class.decide(rules: star_rules, target: "anything", args: {}, has_bound_policies: true)
    expect(decision.allowed?).to be true
  end

  it "picks the first matching rule by created_at when multiple rules could match" do
    early = { "id" => "early", "target" => "*", "constraints" => [], "strict_args" => false,
              "created_at" => Time.at(1) }
    late = { "id" => "late", "target" => "*", "constraints" => [], "strict_args" => false, "created_at" => Time.at(2) }
    decision = described_class.decide(rules: [late, early], target: "x", args: {}, has_bound_policies: true)
    expect(decision.matched_rule).to eq("early")
  end

  it "denies unexpected_arg when the single candidate rule fails only on strict_args" do
    strict_rule = [{
      "id" => "r", "target" => "book", "strict_args" => true, "created_at" => Time.at(1),
      "constraints" => [{ "path" => "/amount", "op" => "lte", "value" => 10_000 }]
    }]
    args = { "amount" => 5000, "currency" => "USD" }
    decision = described_class.decide(rules: strict_rule, target: "book", args: args, has_bound_policies: true)
    expect(decision).to eq(AMG::Policy::Decision.deny(:unexpected_arg))
  end

  it "denies constraint_failed (not unexpected_arg) when more than one candidate rule exists" do
    rule_a = {
      "id" => "a", "target" => "book", "strict_args" => true, "created_at" => Time.at(1),
      "constraints" => [{ "path" => "/amount", "op" => "lte", "value" => 10_000 }]
    }
    rule_b = {
      "id" => "b", "target" => "book", "strict_args" => false, "created_at" => Time.at(2),
      "constraints" => [{ "path" => "/amount", "op" => "gt", "value" => 999_999 }]
    }
    args = { "amount" => 5000, "currency" => "USD" }
    decision = described_class.decide(rules: [rule_a, rule_b], target: "book", args: args, has_bound_policies: true)
    expect(decision).to eq(AMG::Policy::Decision.deny(:constraint_failed))
  end

  it "matches REST targets by method and glob path" do
    rest_rules = [{
      "id" => "r", "target" => "GET /accounts/**", "constraints" => [],
      "strict_args" => false, "created_at" => Time.at(1)
    }]
    decision = described_class.decide(
      rules: rest_rules, target: "GET /accounts/123", args: {}, has_bound_policies: true, kind: :rest
    )
    expect(decision.allowed?).to be true
  end
end
