require_relative "../policy"
require_relative "../store/queries"

module AMG
  module Mcp
    # Downstream MCP surface (SPEC §9). AMG terminates the MCP session itself
    # and speaks JSON-RPC per request (no standing SSE notification channel —
    # v1 serves per-request response streams only). Stateless: every POST is
    # self-contained, so no Mcp-Session-Id bookkeeping is needed for
    # tools-only proxying with no server-initiated messages.
    class Gateway
      DENY_CODE = -32_003

      # @return [Result] status:, body: (Hash or nil for 202-empty)
      Result = Struct.new(:status, :body, keyword_init: true)
      Ctx = Struct.new(:agent, :upstream, :rpc, :request_id, keyword_init: true)

      def initialize(db:, upstream_manager:, audit:)
        @db = db
        @upstream_manager = upstream_manager
        @audit = audit
      end

      def call(slug:, workspace_id:, agent_key:, request_id:, rpc:)
        agent = Store::Queries.agent_for_key(@db, agent_key)
        return invalid_key(rpc, request_id) unless agent

        upstream = Store::Queries.upstream_by_slug(@db, workspace_id, slug)
        return upstream_unavailable(rpc, request_id) unless upstream

        dispatch(Ctx.new(agent: agent, upstream: upstream, rpc: rpc, request_id: request_id))
      end

      private

      def dispatch(ctx)
        case ctx.rpc["method"]
        when "initialize" then initialize_result(ctx)
        when "notifications/initialized" then Result.new(status: 202, body: nil)
        when "tools/list" then tools_list(ctx)
        when "tools/call" then tools_call(ctx)
        when %r{\A(resources|prompts|sampling)/} then empty_surface_result(ctx.rpc)
        else method_not_found(ctx.rpc)
        end
      end

      def initialize_result(ctx)
        json_rpc_result(ctx.rpc, {
                          "protocolVersion" => ctx.rpc.dig("params", "protocolVersion") || "2025-06-18",
                          "capabilities" => { "tools" => {} },
                          "serverInfo" => { "name" => "amg/#{ctx.upstream[:slug]}", "version" => "1.0.0" }
                        })
      end

      def tools_list(ctx)
        rules = Store::Queries.rules_for_agent_upstream(@db, ctx.agent.agent_id, ctx.upstream[:id])
        all_tools = @upstream_manager.tools(ctx.upstream)
        granted = all_tools.select { |tool| rules.any? { |r| r["target"] == "*" || r["target"] == tool.name } }

        json_rpc_result(ctx.rpc, { "tools" => granted.map { |t| tool_to_h(t) } })
      end

      def tools_call(ctx)
        name = ctx.rpc.dig("params", "name")
        arguments = ctx.rpc.dig("params", "arguments") || {}
        rules = Store::Queries.rules_for_agent_upstream(@db, ctx.agent.agent_id, ctx.upstream[:id])
        has_policies = Store::Queries.has_bound_policies?(@db, ctx.agent.agent_id)

        decision = Policy.decide(rules: rules, target: name, args: arguments, kind: :mcp,
                                 has_bound_policies: has_policies)

        if decision.allowed?
          forward_tool_call(ctx, name, arguments, decision)
        else
          audit(ctx, target: name, decision: "deny", reason: decision.reason, args: arguments)
          deny_result(ctx.rpc, decision.reason, ctx.request_id)
        end
      end

      def forward_tool_call(ctx, name, arguments, decision)
        started = monotonic_now
        response = @upstream_manager.call_tool(ctx.upstream, name, arguments)
        audit(ctx, target: name, decision: "allow", args: arguments,
                   matched_rule: decision.matched_rule, latency_ms: elapsed_ms(started))

        json_rpc_result(ctx.rpc, response["result"])
      rescue StandardError => e
        audit(ctx, target: name, decision: "error", args: arguments,
                   matched_rule: decision.matched_rule, latency_ms: elapsed_ms(started))
        AMG.logger&.error("amg: upstream call failed: #{e.class}: #{e.message}")
        json_rpc_error(ctx.rpc, code: -32_000, message: "amg: upstream error", data: { "request_id" => ctx.request_id })
      end

      def empty_surface_result(rpc)
        key = rpc["method"].split("/").first
        json_rpc_result(rpc, { key => [] })
      end

      def method_not_found(rpc)
        json_rpc_error(rpc, code: -32_601, message: "Method not found")
      end

      def invalid_key(_rpc, request_id)
        Result.new(status: 401, body: { "error" => "invalid_key", "request_id" => request_id })
      end

      def upstream_unavailable(rpc, request_id)
        deny_result(rpc, "upstream_disabled", request_id)
      end

      def deny_result(rpc, reason, request_id)
        json_rpc_error(rpc, code: DENY_CODE, message: "amg: denied",
                            data: { "reason" => reason, "request_id" => request_id })
      end

      def tool_to_h(tool)
        { "name" => tool.name, "description" => tool.description, "inputSchema" => tool.input_schema }.compact
      end

      def json_rpc_result(rpc, result)
        Result.new(status: 200, body: { "jsonrpc" => "2.0", "id" => rpc["id"], "result" => result })
      end

      def json_rpc_error(rpc, code:, message:, data: nil)
        error = { "code" => code, "message" => message }
        error["data"] = data if data
        Result.new(status: 200, body: { "jsonrpc" => "2.0", "id" => rpc["id"], "error" => error })
      end

      def audit(ctx, target:, decision:, args: {}, reason: nil, matched_rule: nil, latency_ms: nil)
        @audit.record(
          workspace_id: ctx.agent.workspace_id,
          agent_id: ctx.agent.agent_id,
          api_key_id: ctx.agent.api_key_id,
          upstream_id: ctx.upstream[:id],
          surface: "mcp",
          target: target,
          decision: decision,
          deny_reason: reason&.to_s,
          matched_rule: matched_rule,
          args_redacted: Sequel.pg_jsonb(Audit::Redactor.redact(args)),
          latency_ms: latency_ms,
          request_id: ctx.request_id
        )
      end

      def elapsed_ms(started)
        ((monotonic_now - started) * 1000).round
      end

      def monotonic_now
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end
  end
end
