# frozen_string_literal: true

module AMG
  module MCP
    # The enforcement point. Every tools/call lands here and leaves an
    # audit event no matter which branch it takes.
    class ToolCall
      NATIVE_PREFIX = "amg__"

      def initialize(identity:, router:, audit:, rate_limiter:, approval_gate:, request_id:)
        @identity = identity
        @router = router
        @audit = audit
        @rate_limiter = rate_limiter
        @approval_gate = approval_gate
        @request_id = request_id
        @engine = Policy::Engine.new(identity.policy)
      end

      def call(rpc)
        tool = rpc.params["name"].to_s
        arguments = rpc.params["arguments"].is_a?(Hash) ? rpc.params["arguments"] : {}

        return check_approval(rpc, arguments) if tool == "#{NATIVE_PREFIX}check_approval"

        decision = @engine.authorize(tool: tool, arguments: arguments)
        shadowed = @identity.shadow? && decision.deny?

        if decision.allow? || shadowed
          forward(rpc, tool, arguments, decision, shadowed: shadowed)
        elsif decision.needs_approval?
          park(rpc, tool, arguments, decision)
        else
          record(tool, arguments, decision: "deny", deny_reason: decision.reason)
          JsonRpc.tool_error(rpc, code: "amg.denied", message: decision.reason)
        end
      end

      private

      def forward(rpc, tool, arguments, decision, shadowed:)
        begin
          @rate_limiter.check!(@identity, tool)
        rescue RateLimited => e
          record(tool, arguments, decision: "deny", deny_reason: "rate_limited: #{e.message}")
          return JsonRpc.tool_error(rpc, code: "amg.rate_limited", message: e.message,
                                         data: { retry_after_ms: e.retry_after_ms })
        end

        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        upstream_status = "ok"
        response =
          begin
            JsonRpc.result(rpc, @router.forward(tool: tool, arguments: arguments))
          rescue UpstreamTimeout
            upstream_status = "timeout"
            JsonRpc.tool_error(rpc, code: "amg.upstream_timeout", message: "upstream timed out")
          rescue StandardError
            upstream_status = "error"
            JsonRpc.tool_error(rpc, code: "amg.upstream_error", message: "upstream call failed")
          end
        latency_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round

        record(tool, arguments,
               decision: shadowed ? "shadow_deny" : "allow",
               deny_reason: shadowed ? decision.reason : nil,
               upstream_status: upstream_status, latency_ms: latency_ms)
        response
      end

      def park(rpc, tool, arguments, decision)
        approval_id = @approval_gate.park(
          identity: @identity, tool: tool, arguments: arguments,
          rule: @engine.approval_rule(tool), request_id: @request_id
        )
        record(tool, arguments, decision: "needs_approval", deny_reason: decision.reason)
        JsonRpc.tool_info(rpc, code: "amg.pending_approval",
                               message: "call parked for human approval; poll amg__check_approval",
                               data: { approval_id: approval_id })
      end

      def check_approval(rpc, arguments)
        approval_id = arguments["approval_id"].to_s
        status = @approval_gate.check(approval_id, agent_id: @identity.agent_id)
        record("#{NATIVE_PREFIX}check_approval", arguments, decision: "allow")

        return JsonRpc.tool_error(rpc, code: "amg.not_found", message: "no such approval") unless status

        if status[:state] == "approved" && status[:result]
          JsonRpc.result(rpc, status[:result])
        else
          JsonRpc.tool_info(rpc, code: "amg.approval_status", message: status[:state],
                                 data: { approval_id: approval_id, state: status[:state] })
        end
      end

      def record(tool, arguments, decision:, deny_reason: nil, upstream_status: nil, latency_ms: nil)
        @audit.record(
          identity: @identity, tool: tool, arguments: arguments,
          decision: decision, deny_reason: deny_reason,
          redact: @engine.redactions_for(tool),
          upstream_status: upstream_status, latency_ms: latency_ms,
          request_id: @request_id
        )
      end
    end
  end
end
