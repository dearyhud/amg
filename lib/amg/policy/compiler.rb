# frozen_string_literal: true

module AMG
  module Policy
    # Compiles admin-authored YAML into the document stored on roles.policy.
    # All validation happens here, at save time — the data-plane Engine only
    # ever sees documents this compiler has accepted.
    class Compiler
      ENFORCEMENTS = %w[enforce shadow].freeze
      TOOL_NAME = /\A[a-z0-9_]+\z/
      GLOB = /\A[a-z0-9_*?]+\z/

      # registry (optional) validates tool names against live upstream
      # tools/list so unknown tools are rejected at save time, not call time.
      def initialize(registry: nil)
        @registry = registry
      end

      def compile(yaml)
        raw = begin
          YAML.safe_load(yaml, permitted_classes: [], aliases: false)
        rescue Psych::Exception => e
          raise PolicyError, "invalid YAML: #{e.message}"
        end
        raise PolicyError, "policy must be a YAML mapping" unless raw.is_a?(Hash)

        doc = Util.deep_symbolize(raw)
        role = doc[:role].to_s
        raise PolicyError, "role is required" if role.empty?

        enforcement = (doc[:enforcement] || "enforce").to_s
        unless ENFORCEMENTS.include?(enforcement)
          raise PolicyError, "enforcement must be one of: #{ENFORCEMENTS.join(', ')}"
        end

        {
          role: role,
          enforcement: enforcement,
          servers: compile_servers(doc[:servers]),
          limits: compile_limits(doc[:limits]),
          approvals: compile_approvals(doc[:approvals])
        }
      end

      private

      def compile_servers(servers)
        raise PolicyError, "servers must be a mapping" unless servers.is_a?(Hash)

        servers.to_h do |server, cfg|
          unless Tool::SEGMENT.match?(server.to_s)
            raise PolicyError, "invalid server name #{server.to_s.inspect}"
          end
          raise PolicyError, "server #{server} must define tools" unless cfg.is_a?(Hash) && cfg[:tools].is_a?(Array)

          [server, { tools: cfg[:tools].map { |t| compile_tool(server.to_s, t) } }]
        end
      end

      def compile_tool(server, tool)
        tool = { name: tool } if tool.is_a?(String)
        raise PolicyError, "tool entries must be mappings" unless tool.is_a?(Hash)

        name = tool[:name].to_s
        raise PolicyError, "invalid tool name #{name.inspect}" unless TOOL_NAME.match?(name)

        if @registry && !@registry.tool_exists?(server, name)
          raise PolicyError, "unknown tool #{Tool.join(server, name)} (not in upstream tools/list)"
        end

        compiled = { name: name }
        compiled[:constraints] = compile_constraints(server, name, tool[:constraints]) if tool[:constraints]
        compiled[:allow_args] = Array(tool[:allow_args]).map(&:to_s) if tool[:allow_args]
        compiled[:redact] = Array(tool[:redact]).map(&:to_s) if tool[:redact]
        compiled
      end

      def compile_constraints(server, name, constraints)
        raise PolicyError, "constraints for #{server}__#{name} must be a mapping" unless constraints.is_a?(Hash)

        constraints.each do |arg, ops|
          raise PolicyError, "constraint on #{arg} must map operator to operand" unless ops.is_a?(Hash)

          ops.each do |op, expected|
            unless Constraint::OPERATORS.include?(op.to_sym)
              raise PolicyError, "unknown constraint operator #{op.inspect} on #{server}__#{name}.#{arg}"
            end
            validate_operand(server, name, arg, op.to_sym, expected)
          end
        end
        constraints
      end

      def validate_operand(server, name, arg, op, expected)
        at = "#{server}__#{name}.#{arg}"
        case op
        when :in
          raise PolicyError, "`in` operand at #{at} must be an array" unless expected.is_a?(Array)
        when :lte, :gte
          raise PolicyError, "`#{op}` operand at #{at} must be numeric" unless expected.is_a?(Numeric)
        when :matches
          begin
            Regexp.new(expected.to_s)
          rescue RegexpError => e
            raise PolicyError, "invalid regex at #{at}: #{e.message}"
          end
        when :absent
          raise PolicyError, "`absent` operand at #{at} must be true" unless expected == true
        end
      end

      def compile_limits(limits)
        return {} if limits.nil?
        raise PolicyError, "limits must be a mapping" unless limits.is_a?(Hash)

        compiled = {}
        compiled[:rate] = Util.parse_rate(limits[:rate]) if limits[:rate]
        compiled[:per_agent] = Util.parse_rate(limits[:per_agent]) if limits[:per_agent]
        compiled
      end

      def compile_approvals(approvals)
        return [] if approvals.nil?
        raise PolicyError, "approvals must be a list" unless approvals.is_a?(Array)

        approvals.map do |rule|
          raise PolicyError, "approval rules must be mappings" unless rule.is_a?(Hash)

          match = rule[:match].to_s
          raise PolicyError, "invalid approval match pattern #{match.inspect}" unless GLOB.match?(match)
          unless rule[:require].to_s == "human"
            raise PolicyError, "approval require must be \"human\" (got #{rule[:require].inspect})"
          end

          { match: match, require: "human",
            timeout: Util.parse_duration(rule[:timeout] || "15m") }
        end
      end
    end
  end
end
