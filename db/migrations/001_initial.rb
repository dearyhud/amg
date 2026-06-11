# frozen_string_literal: true

# Postgres-only. Deviations from the design doc's schema:
#   - approvals.audit_event_id is nullable and approvals carries request_id,
#     because the audit write is async and the approval row is created first;
#     the two are joined on request_id.
Sequel.migration do
  up do
    run <<~SQL
      CREATE TABLE roles (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        text UNIQUE NOT NULL,
        description text,
        policy      jsonb NOT NULL,
        policy_version integer NOT NULL DEFAULT 1,
        enforcement text NOT NULL DEFAULT 'enforce'
                    CHECK (enforcement IN ('enforce', 'shadow')),
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE agents (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name       text UNIQUE NOT NULL,
        role_id    uuid NOT NULL REFERENCES roles(id),
        status     text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'suspended')),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE agent_tokens (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id     uuid NOT NULL REFERENCES agents(id),
        token_digest text UNIQUE NOT NULL,
        expires_at   timestamptz,
        revoked_at   timestamptz,
        last_used_at timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE upstreams (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name       text UNIQUE NOT NULL,
        kind       text NOT NULL CHECK (kind IN ('mcp', 'http')),
        endpoint   text NOT NULL,
        vault_path text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE audit_events (
        id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        agent_id    uuid NOT NULL,
        role_name   text NOT NULL,
        policy_version integer NOT NULL,
        tool        text NOT NULL,
        arguments   jsonb NOT NULL,
        decision    text NOT NULL
                    CHECK (decision IN ('allow', 'deny', 'shadow_deny', 'needs_approval')),
        deny_reason text,
        upstream_status text,
        latency_ms  integer,
        request_id  uuid NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ON audit_events (agent_id, created_at DESC);
      CREATE INDEX ON audit_events (tool, decision, created_at DESC);

      CREATE TABLE approvals (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        audit_event_id bigint,
        request_id  uuid,
        payload     jsonb NOT NULL,
        state       text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'approved', 'denied', 'expired')),
        approver    text,
        expires_at  timestamptz NOT NULL,
        resolved_at timestamptz
      );
      CREATE INDEX ON approvals (state, expires_at);
    SQL
  end

  down do
    run "DROP TABLE approvals, audit_events, upstreams, agent_tokens, agents, roles;"
  end
end
