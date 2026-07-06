require "re2"
require_relative "json_pointer"

module AMG
  module Policy
    # Evaluates a single constraint object (SPEC §8.2) against an args hash.
    # Fails closed: missing paths and type mismatches return false for every
    # op except `absent`. `matches` is RE2-only (native Regexp banned here).
    module Constraint
      NUMERIC = Numeric

      OPS = {
        "eq" => ->(value, expected) { value == expected },
        "neq" => ->(value, expected) { value != expected },
        "in" => ->(value, expected) { expected.is_a?(Array) && expected.include?(value) },
        "not_in" => ->(value, expected) { expected.is_a?(Array) && !expected.include?(value) },
        "matches" => ->(value, expected) { regexp_matches?(value, expected) },
        "lt" => ->(value, expected) { numeric_compare(value, expected) { |a, b| a < b } },
        "lte" => ->(value, expected) { numeric_compare(value, expected) { |a, b| a <= b } },
        "gt" => ->(value, expected) { numeric_compare(value, expected) { |a, b| a > b } },
        "gte" => ->(value, expected) { numeric_compare(value, expected) { |a, b| a >= b } },
        "prefix" => lambda { |value, expected|
          value.is_a?(String) && expected.is_a?(String) && value.start_with?(expected)
        }
      }.freeze

      def self.match?(constraint, args)
        path = constraint.fetch("path")
        operator = constraint.fetch("op")
        value = JsonPointer.resolve(args, path)
        missing = value.equal?(JsonPointer::MISSING)

        return missing if operator == "absent"
        return !missing if operator == "exists"
        return false if missing

        handler = OPS[operator]
        handler ? handler.call(value, constraint["value"]) : false
      end

      def self.regexp_matches?(value, pattern)
        return false unless value.is_a?(String) && pattern.is_a?(String)

        regexp = RE2::Regexp.new(pattern)
        return false unless regexp.ok?

        !!regexp.match(value)
      end
      private_class_method :regexp_matches?

      def self.numeric_compare(value, expected)
        return false unless value.is_a?(NUMERIC) && expected.is_a?(NUMERIC)

        yield value, expected
      end
      private_class_method :numeric_compare
    end
  end
end
