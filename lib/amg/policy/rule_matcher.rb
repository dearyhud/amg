require_relative "constraint"

module AMG
  module Policy
    # Evaluates one rule's constraints (all must pass, AND) and strict_args
    # against an args hash. Distinguishes an outright constraint failure from
    # a strict_args rule that passed its constraints but was defeated by an
    # unreferenced extra argument (SPEC §8.1 step 4).
    module RuleMatcher
      Result = Struct.new(:constraints_ok, :unexpected_arg, keyword_init: true) do
        def matched?
          constraints_ok && !unexpected_arg
        end
      end

      def self.evaluate(rule, args)
        constraints = rule["constraints"] || []
        constraints_ok = constraints.all? { |c| Constraint.match?(c, args) }
        unexpected_arg = constraints_ok && rule["strict_args"] && unexpected_args?(constraints, args)
        Result.new(constraints_ok: constraints_ok, unexpected_arg: !!unexpected_arg)
      end

      # An argument is "referenced" by a constraint if the constraint's JSON
      # pointer's first segment names it, e.g. "/repo" references "repo" and
      # "/body/amount" references "body".
      def self.unexpected_args?(constraints, args)
        return false unless args.is_a?(Hash)

        referenced = constraints.filter_map { |c| top_level_key(c["path"]) }
        args.keys.any? { |k| !referenced.include?(k) }
      end
      private_class_method :unexpected_args?

      def self.top_level_key(pointer)
        return nil unless pointer.is_a?(String) && pointer.start_with?("/")

        pointer[1..].split("/", 2).first
      end
      private_class_method :top_level_key
    end
  end
end
