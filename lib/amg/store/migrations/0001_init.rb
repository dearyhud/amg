Sequel.migration do
  up do
    run <<~SQL
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS citext;

      CREATE TABLE workspaces (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE admins (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  UUID NOT NULL REFERENCES workspaces(id),
        email         CITEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL CHECK (role IN ('owner','admin','auditor')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE admin_sessions (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id     UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        token_hash   BYTEA NOT NULL UNIQUE,
        expires_at   TIMESTAMPTZ NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE agents (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  UUID NOT NULL REFERENCES workspaces(id),
        slug          TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workspace_id, slug)
      );

      CREATE TABLE agent_api_keys (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        key_hash     BYTEA NOT NULL UNIQUE,
        prefix       TEXT NOT NULL,
        last_used_at TIMESTAMPTZ,
        revoked_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE upstreams (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  UUID NOT NULL REFERENCES workspaces(id),
        slug          TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        kind          TEXT NOT NULL CHECK (kind IN ('mcp_stdio','mcp_http','rest')),
        config        JSONB NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workspace_id, slug)
      );

      CREATE TABLE upstream_secrets (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        upstream_id  UUID NOT NULL REFERENCES upstreams(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        ciphertext   BYTEA NOT NULL,
        nonce        BYTEA NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (upstream_id, name)
      );

      CREATE TABLE policies (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  UUID NOT NULL REFERENCES workspaces(id),
        name          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workspace_id, name)
      );

      CREATE TABLE policy_rules (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        upstream_id UUID NOT NULL REFERENCES upstreams(id) ON DELETE CASCADE,
        target      TEXT NOT NULL,
        constraints JSONB NOT NULL DEFAULT '[]',
        strict_args BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE agent_policy_bindings (
        agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        policy_id  UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (agent_id, policy_id)
      );

      CREATE TABLE audit_events (
        id              UUID NOT NULL DEFAULT gen_random_uuid(),
        workspace_id    UUID NOT NULL,
        occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        agent_id        UUID,
        api_key_id      UUID,
        upstream_id     UUID,
        surface         TEXT NOT NULL CHECK (surface IN ('mcp','rest','admin')),
        target          TEXT NOT NULL,
        decision        TEXT NOT NULL CHECK (decision IN ('allow','deny','error')),
        deny_reason     TEXT,
        matched_rule    UUID,
        args_redacted   JSONB,
        upstream_status INT,
        latency_ms      INT,
        request_id      TEXT NOT NULL,
        PRIMARY KEY (id, occurred_at)
      ) PARTITION BY RANGE (occurred_at);

      CREATE INDEX audit_events_workspace_occurred_idx ON audit_events (workspace_id, occurred_at DESC);
      CREATE INDEX audit_events_agent_occurred_idx ON audit_events (agent_id, occurred_at DESC);
      CREATE INDEX policy_rules_policy_id_idx ON policy_rules (policy_id);
      CREATE INDEX policy_rules_upstream_id_idx ON policy_rules (upstream_id);
      CREATE INDEX agent_policy_bindings_policy_id_idx ON agent_policy_bindings (policy_id);
      CREATE INDEX agent_api_keys_key_hash_idx ON agent_api_keys (key_hash);
    SQL
  end

  down do
    run <<~SQL
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS agent_policy_bindings;
      DROP TABLE IF EXISTS policy_rules;
      DROP TABLE IF EXISTS policies;
      DROP TABLE IF EXISTS upstream_secrets;
      DROP TABLE IF EXISTS upstreams;
      DROP TABLE IF EXISTS agent_api_keys;
      DROP TABLE IF EXISTS agents;
      DROP TABLE IF EXISTS admin_sessions;
      DROP TABLE IF EXISTS admins;
      DROP TABLE IF EXISTS workspaces;
    SQL
  end
end
