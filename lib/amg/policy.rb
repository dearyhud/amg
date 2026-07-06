require_relative "policy/decision"
require_relative "policy/target_matcher"
require_relative "policy/rule_matcher"

module AMG
  # Pure decision engine (SPEC §8). No I/O: callers load an agent's bound
  # policies/rules and pass the pre-filtered-by-upstream rule set in.
  module Policy
    # @param rules [Array<Hash>] rules for this agent+upstream, each with
    #   string keys "id", "target", "constraints", "strict_args", "created_at".
    #   Empty/nil means the agent has no bound policies at all (SPEC §8.1 step 1) —
    #   callers must pass `rules: []` in that case to get `no_policy`, since the
    #   pure engine cannot otherwise distinguish "no bindings" from "bindings but
    #   no rule for this upstream+target".
    # @param target [String] tool name (MCP) or "METHOD /path" (REST).
    # @param args [Hash] the request's argument object.
    # @param kind [:mcp, :rest] selects target-matching semantics.
    # @param has_bound_policies [Boolean] true iff the agent has >=1 active
    #   policy binding, regardless of whether any rule matched this upstream.
    # @return [Decision]
    def self.decide(rules:, target:, args:, has_bound_policies:, kind: :mcp)
      return Decision.deny(:no_policy) unless has_bound_policies

      candidates = matching_candidates(rules, target, kind)
      return Decision.deny(:no_rule) if candidates.empty?

      evaluate_candidates(candidates, args)
    end

    def self.matching_candidates(rules, target, kind)
      Array(rules)
        .select { |rule| TargetMatcher.match?(rule["target"], target, kind: kind) }
        .sort_by { |rule| rule["created_at"] }
    end
    private_class_method :matching_candidates

    def self.evaluate_candidates(candidates, args)
      results = candidates.map { |rule| [rule, RuleMatcher.evaluate(rule, args)] }
      allowed = results.find { |_rule, result| result.matched? }
      return Decision.allow(matched_rule: allowed.first["id"]) if allowed

      Decision.deny(final_deny_reason(results))
    end
    private_class_method :evaluate_candidates

    def self.final_deny_reason(results)
      return :constraint_failed unless results.size == 1

      _rule, result = results.first
      result.constraints_ok && result.unexpected_arg ? :unexpected_arg : :constraint_failed
    end
    private_class_method :final_deny_reason
  end
end
