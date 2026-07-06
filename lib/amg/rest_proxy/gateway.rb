require "faraday"
require_relative "../policy"
require_relative "../store/queries"
require_relative "../store/secrets"

module AMG
  module RestProxy
    # Governed REST passthrough (SPEC §10). Policy targets are
    # "METHOD /path/glob"; the constraint arg-space is synthesized as
    # {path: [...], query: {...}, body: <parsed JSON or omitted>}.
    class Gateway
      HOP_BY_HOP = %w[
        connection keep-alive proxy-authenticate proxy-authorization te trailer transfer-encoding upgrade
      ].freeze

      Result = Struct.new(:status, :headers, :body, keyword_init: true)
      Ctx = Struct.new(:agent, :upstream, :http_method, :path, :query, :content_type, :raw_body, :request_id,
                       keyword_init: true)

      def initialize(db:, audit:, master_key:, rate_limiter: nil)
        @db = db
        @audit = audit
        @master_key = master_key
        @rate_limiter = rate_limiter
      end

      def call(slug:, workspace_id:, agent_key:, http_method:, path:, query:, content_type:, raw_body:, request_id:)
        agent = Store::Queries.agent_for_key(@db, agent_key)
        return Result.new(status: 401, headers: {}, body: { "error" => "invalid_key" }) unless agent
        return rate_limited(request_id) if @rate_limiter && !@rate_limiter.allow?(agent.agent_id)

        upstream = Store::Queries.upstream_by_slug(@db, workspace_id, slug)
        return deny_response("upstream_disabled", request_id) unless upstream && upstream[:kind] == "rest"

        handle(Ctx.new(agent: agent, upstream: upstream, http_method: http_method, path: path, query: query,
                       content_type: content_type, raw_body: raw_body, request_id: request_id))
      end

      private

      def handle(ctx)
        target = "#{ctx.http_method} /#{ctx.path}"
        args = arg_space(ctx)
        rules = Store::Queries.rules_for_agent_upstream(@db, ctx.agent.agent_id, ctx.upstream[:id])
        has_policies = Store::Queries.has_bound_policies?(@db, ctx.agent.agent_id)

        decision = Policy.decide(rules: rules, target: target, args: args, kind: :rest,
                                 has_bound_policies: has_policies)

        if decision.allowed?
          forward(ctx, decision, target, args)
        else
          audit(ctx, target: target, decision: "deny", args: args, reason: decision.reason)
          deny_response(decision.reason, ctx.request_id)
        end
      end

      def arg_space(ctx)
        { "path" => ctx.path.split("/").reject(&:empty?), "query" => ctx.query || {}, "body" => parsed_body(ctx) }
      end

      def parsed_body(ctx)
        return nil unless ctx.content_type&.include?("application/json")
        return nil if ctx.raw_body.nil? || ctx.raw_body.empty?

        JSON.parse(ctx.raw_body)
      rescue JSON::ParserError
        nil
      end

      def forward(ctx, decision, target, args)
        config = Store::Secrets.resolve(@db, ctx.upstream[:id], ctx.upstream[:config], @master_key)
        started = monotonic_now
        response = send_upstream_request(config, ctx)

        audit(ctx, target: target, decision: "allow", args: args, matched_rule: decision.matched_rule,
                   latency_ms: elapsed_ms(started), upstream_status: response.status)

        Result.new(status: response.status, headers: relay_headers(response.headers), body: response.body)
      rescue Faraday::TimeoutError
        audit(ctx, target: target, decision: "error", args: args, latency_ms: elapsed_ms(started))
        Result.new(status: 504, headers: {}, body: { "error" => "upstream_timeout", "request_id" => ctx.request_id })
      end

      def send_upstream_request(config, ctx)
        conn = Faraday.new(url: config["base_url"]) do |f|
          f.options.timeout = (config["timeout_ms"] || 30_000) / 1000.0
        end

        conn.run_request(ctx.http_method.downcase.to_sym, "/#{ctx.path}", ctx.raw_body,
                         config["headers"] || {}) do |req|
          req.params.update(ctx.query || {})
          req.headers["Content-Type"] = ctx.content_type if ctx.content_type
        end
      end

      def relay_headers(headers)
        headers.reject { |k, _| HOP_BY_HOP.include?(k.to_s.downcase) }
      end

      def rate_limited(request_id)
        Result.new(status: 429, headers: {},
                   body: { "error" => "amg_denied", "reason" => "rate_limited", "request_id" => request_id })
      end

      def deny_response(reason, request_id)
        Result.new(status: 403, headers: {},
                   body: { "error" => "amg_denied", "reason" => reason, "request_id" => request_id })
      end

      def audit(ctx, target:, decision:, args: {}, reason: nil, matched_rule: nil, latency_ms: nil,
                upstream_status: nil)
        @audit.record(
          workspace_id: ctx.agent.workspace_id,
          agent_id: ctx.agent.agent_id,
          api_key_id: ctx.agent.api_key_id,
          upstream_id: ctx.upstream[:id],
          surface: "rest",
          target: target,
          decision: decision,
          deny_reason: reason&.to_s,
          matched_rule: matched_rule,
          args_redacted: Sequel.pg_jsonb(Audit::Redactor.redact(args)),
          upstream_status: upstream_status,
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
