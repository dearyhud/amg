# AMG — Agentic MCP Gateway

AMG sits between AI agents and the tools they use — MCP servers and internal
REST APIs — and enforces **default-deny, argument-level policies** on every
call. Agents authenticate with an AMG-issued key and never hold real upstream
credentials; every decision is written to an append-only audit log.

Full requirements, architecture, and the ADRs behind every non-obvious
decision live in [`amg-spec/`](amg-spec/) (the original handoff package).
Notable implementation findings and fail-closed resolutions to spec
ambiguities are in [`DECISIONS.log`](DECISIONS.log).

## Quickstart

```bash
export AMG_MASTER_KEY=$(openssl rand -base64 32)
export AMG_BOOTSTRAP_EMAIL=you@company.com
export AMG_BOOTSTRAP_PASSWORD=change-me-now
docker compose -f deploy/docker-compose.yml up -d
```

Open `http://localhost:8420` and log in with the bootstrap credentials. From
there: register an upstream MCP server or REST API, create an agent identity
and issue it a key, author a policy (a named, reusable role with argument
constraints) and bind it to the agent. Full walkthrough:
[`amg-spec/docs/using-amg-with-an-agent.md`](amg-spec/docs/using-amg-with-an-agent.md).

Point any MCP client at `http://localhost:8420/mcp/{upstream_slug}` with
`Authorization: Bearer amg_ak_...`, or any HTTP client at
`http://localhost:8420/proxy/{upstream_slug}/...` for REST upstreams.

## Development

Requires Ruby 3.3+, Postgres 16, and Node 20 (for the console).

```bash
bundle install
(cd web && npm install)

export AMG_DATABASE_URL=postgres://localhost/amg_dev
export AMG_MASTER_KEY=$(openssl rand -base64 32)
bundle exec rake db:migrate

bundle exec rake test    # RE2-ban check + RSpec + policy coverage gate
bundle exec rubocop
(cd web && npm run build && npm run lint)
```

`rake test` requires a running Postgres reachable at `AMG_DATABASE_URL`
(defaults to `AMG_TEST_DATABASE_URL`, falling back to
`postgres://postgres:amg@127.0.0.1:55432/amg_test` — see `spec/support/database.rb`).

## Repository layout

```
lib/amg/
  server/    roda app: healthz, /mcp/:slug, /proxy/:slug, mounts admin API
  mcp/       downstream MCP gateway + upstream session manager
  rest_proxy/ REST proxying + arg-space synthesis
  policy/    pure decision engine — no I/O, RE2-only, ≥95% coverage
  admin/     /api/v1: sessions, CSRF, agents/upstreams/policies/audit
  store/     Sequel queries + SQL-first migrations
  crypto/    argon2id passwords, AES-256-GCM secret envelopes, API keys
  audit/     async batching writer + redaction
web/         Vite + React + shadcn/ui admin console
spec/        RSpec: unit, integration, and the full acceptance narrative
             in spec/acceptance/agent_e2e_spec.rb
deploy/      docker-compose.yml
```

## Status

M0–M5 (SPEC §17) are built: policy engine, MCP gateway, REST proxy, secrets
crypto, admin API + console, docker-compose packaging. The acceptance
narrative in `spec/acceptance/agent_e2e_spec.rb` drives a real MCP client
against a real stdio MCP upstream and a real REST upstream through the full
stack and passes end to end.
