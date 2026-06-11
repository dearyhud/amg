# frozen_string_literal: true

module AMG
  module Policy
    # Evaluates a compiled policy document (deep-symbolized Hash, see
    # Policy::Compiler) against tool calls. Pure: no IO, no clock, no state
    # beyond the document itself. Any internal error is a deny.
    class Engine
      Decision = Data.define(:verdict, :reason) do
        def allow?          = verdict == :allow
        def deny?           = verdict == :deny
        def needs_approval? = verdict == :needs_approval
      end

      def initialize(policy_doc)
        @policy = policy_doc.is_a?(Hash) ? policy_doc : {}
      end

      # Which namespaced tools does this role get to see in tools/list?
      def visible_tools
        servers.flat_map do |server, cfg|
          Array(cfg.is_a?(Hash) ? cfg[:tools] : nil).map { |t| Tool.join(server, t[:name]) }
        end
      end

      def authorize(tool:, arguments:)
        return deny("malformed tool name") unless Tool.valid?(tool)

        server, tool_name = Tool.split(tool)
        rule = rule_for(server, tool_name)
        return deny("tool not granted to role") unless rule

        arguments = {} unless arguments.is_a?(Hash)
        if (violation = constraint_violation(rule, arguments))
          return deny(violation)
        end

        if (approval = approval_rule(tool))
          return Decision.new(verdict: :needs_approval,
                              reason: "human approval required (matched #{approval[:match].inspect})")
        end

        Decision.new(verdict: :allow, reason: nil)
      rescue StandardError => e
        # fail closed: a malformed policy doc must never become a passthrough
        deny("policy evaluation error: #{e.class}")
      end

      def approval_rule(tool)
        Array(@policy[:approvals]).find { |r| File.fnmatch(r[:match].to_s, tool.to_s) }
      end

      def redactions_for(tool)
        return [] unless Tool.valid?(tool)

        server, tool_name = Tool.split(tool)
        Array(rule_for(server, tool_name)&.fetch(:redact, nil)).map(&:to_s)
      rescue StandardError
        []
      end

      private

      def servers
        @policy[:servers].is_a?(Hash) ? @policy[:servers] : {}
      end

      def rule_for(server, tool_name)
        cfg = servers[server.to_sym]
        return nil unless cfg.is_a?(Hash)

        Array(cfg[:tools]).find { |t| t.is_a?(Hash) && t[:name].to_s == tool_name }
      end

      def constraint_violation(rule, arguments)
        constraints = rule[:constraints]
        return nil if constraints.nil? || constraints.empty?

        args = arguments.transform_keys(&:to_sym)

        # default-deny unknown argument keys on constrained tools
        allowed = constraints.keys + Array(rule[:allow_args]).map(&:to_sym)
        unknown = args.keys - allowed
        return "unexpected argument(s): #{unknown.join(', ')}" if unknown.any?

        constraints.each do |key, ops|
          value = args[key]
          ops.each do |op, expected|
            unless Constraint.check(op, value, expected)
              return "constraint failed: #{key} #{op} #{expected.inspect}"
            end
          end
        end
        nil
      end

      def deny(reason) = Decision.new(verdict: :deny, reason: reason)
    end
  end
end
