# frozen_string_literal: true

module AMG
  module Policy
    module Constraint
      OPERATORS = %i[eq in lte gte matches absent].freeze

      module_function

      def check(op, value, expected)
        case op.to_sym
        when :eq      then value == expected
        when :in      then Array(expected).include?(value)
        when :lte     then value.is_a?(Numeric) && expected.is_a?(Numeric) && value <= expected
        when :gte     then value.is_a?(Numeric) && expected.is_a?(Numeric) && value >= expected
        when :matches then value.is_a?(String) && anchored_match?(expected, value)
        when :absent  then value.nil?
        else false # unknown operator never passes
        end
      end

      def anchored_match?(pattern, value)
        /\A(?:#{pattern})\z/.match?(value)
      rescue RegexpError, ArgumentError
        false
      end
    end
  end
end
