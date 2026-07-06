module AMG
  module Policy
    # Immutable result of Policy.decide. `reason` is nil on allow; on deny it
    # is one of the SPEC §9.4 deny reason codes relevant to the policy layer
    # (no_policy | no_rule | constraint_failed | unexpected_arg).
    class Decision
      attr_reader :reason, :matched_rule

      def initialize(allowed:, reason: nil, matched_rule: nil)
        @allowed = allowed
        @reason = reason
        @matched_rule = matched_rule
        freeze
      end

      def allowed?
        @allowed
      end

      def denied?
        !@allowed
      end

      def self.allow(matched_rule:)
        new(allowed: true, matched_rule: matched_rule)
      end

      def self.deny(reason)
        new(allowed: false, reason: reason)
      end

      def ==(other)
        other.is_a?(Decision) &&
          allowed? == other.allowed? &&
          reason == other.reason &&
          matched_rule == other.matched_rule
      end
    end
  end
end
