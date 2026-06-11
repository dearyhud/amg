# frozen_string_literal: true

module AMG
  # Parks destructive tool calls for human approval. The parked payload is
  # the exact original call — an approval forwards it verbatim and cannot
  # mutate arguments.
  class ApprovalGate
    DEFAULT_TIMEOUT = 900 # 15m

    def initialize(db:, router:, notifier: nil, clock: -> { Time.now.utc })
      @db = db
      @router = router
      @notifier = notifier
      @clock = clock
    end

    # Returns the approval id the agent uses with amg__check_approval.
    def park(identity:, tool:, arguments:, rule:, request_id:)
      id = SecureRandom.uuid
      timeout = rule&.fetch(:timeout, nil) || DEFAULT_TIMEOUT
      payload = {
        agent_id: identity.agent_id,
        agent_name: identity.agent_name,
        role_name: identity.role_name,
        tool: tool,
        arguments: arguments,
        request_id: request_id
      }
      @db[:approvals].insert(
        id: id,
        request_id: request_id,
        payload: JSON.generate(payload),
        state: "pending",
        expires_at: @clock.call + timeout
      )
      notify(id, tool, identity)
      id
    end

    def resolve(approval_id, approver:, approve:)
      row = @db[:approvals].where(id: approval_id).first
      raise ApprovalError, "no such approval: #{approval_id}" unless row
      raise ApprovalError, "approval is #{row[:state]}, not pending" unless row[:state] == "pending"

      if expired?(row)
        expire!(approval_id)
        raise ApprovalError, "approval expired"
      end

      payload = JSON.parse(row[:payload])
      if approve
        result = @router.forward(tool: payload["tool"], arguments: payload["arguments"])
        payload["result"] = result
        update(approval_id, state: "approved", approver: approver, payload: payload)
        result
      else
        update(approval_id, state: "denied", approver: approver, payload: payload)
        nil
      end
    end

    # Agent-facing status check; scoped so an agent can only see its own
    # approvals. Returns nil for unknown or foreign ids (indistinguishable).
    def check(approval_id, agent_id:)
      row = @db[:approvals].where(id: approval_id).first
      return nil unless row

      payload = JSON.parse(row[:payload])
      return nil unless payload["agent_id"] == agent_id

      state = row[:state]
      if state == "pending" && expired?(row)
        expire!(approval_id)
        state = "expired"
      end

      { state: state, result: payload["result"] }
    end

    def expire_stale!
      @db[:approvals]
        .where(state: "pending")
        .where { expires_at < Time.now.utc }
        .update(state: "expired", resolved_at: Time.now.utc)
    end

    private

    def expired?(row)
      Util.to_time(row[:expires_at]) < @clock.call
    end

    def expire!(id)
      @db[:approvals].where(id: id).update(state: "expired", resolved_at: @clock.call)
    end

    def update(id, state:, approver:, payload:)
      @db[:approvals].where(id: id).update(
        state: state, approver: approver,
        payload: JSON.generate(payload), resolved_at: @clock.call
      )
    end

    def notify(approval_id, tool, identity)
      @notifier&.call(approval_id: approval_id, tool: tool, agent: identity.agent_name)
    rescue StandardError
      # notification failure must not fail the park; approvers can still
      # find it via GET /approvals?state=pending
      nil
    end
  end
end
