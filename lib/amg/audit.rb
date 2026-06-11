# frozen_string_literal: true

module AMG
  class Audit
    REDACTED = "[REDACTED]"

    def initialize(db:, async: false)
      @db = db
      @async = async
    end

    # decision is the final label: allow | deny | shadow_deny | needs_approval
    def record(identity:, tool:, arguments:, decision:, request_id:,
               deny_reason: nil, redact: [], upstream_status: nil, latency_ms: nil)
      attrs = {
        agent_id: identity.agent_id,
        role_name: identity.role_name,
        policy_version: identity.policy_version,
        tool: clean_string(tool),
        arguments: JSON.generate(deep_clean(redact_arguments(arguments, redact))),
        decision: decision.to_s,
        deny_reason: deny_reason && clean_string(deny_reason),
        upstream_status: upstream_status,
        latency_ms: latency_ms,
        request_id: request_id,
        created_at: Time.now.utc
      }

      if @async
        require_relative "jobs/audit_write_job"
        Jobs::AuditWriteJob.perform_async(JSON.generate(attrs))
        nil
      else
        @db[:audit_events].insert(attrs)
      end
    end

    private

    # Redaction happens before persistence, ever: redacted fields never
    # touch the audit table.
    def redact_arguments(arguments, redact)
      arguments = {} unless arguments.is_a?(Hash)
      return arguments if redact.empty?

      redact = redact.map(&:to_s)
      arguments.to_h do |k, v|
        [k, redact.include?(k.to_s) ? REDACTED : v]
      end
    end

    # Hostile input (NUL bytes, invalid UTF-8) must not be able to break the
    # audit write — Postgres rejects NUL in text and jsonb.
    def clean_string(str)
      str.to_s.scrub("�").delete("\u0000")
    end

    def deep_clean(obj)
      case obj
      when String then clean_string(obj)
      when Hash then obj.to_h { |k, v| [deep_clean(k.to_s), deep_clean(v)] }
      when Array then obj.map { |v| deep_clean(v) }
      else obj
      end
    end
  end
end
