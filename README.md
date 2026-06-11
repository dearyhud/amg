# AMG — Agentic MCP Gateway

A policy-enforcing gateway between AI agents and the MCP servers / third-party
APIs they consume. Agents authenticate to AMG with a scoped bearer token, AMG
resolves that token to a **role**, and the role determines exactly which
upstream tools the agent can discover and invoke — down to the argument level.

AMG presents itself to agents as a single MCP server (JSON-RPC over streamable
HTTP). Upstream, it holds MCP client connections and hand-written HTTP
adapters. Agents never hold upstream credentials.

See `DESIGN.md` / the technical design doc for the full rationale. The
load-bearing principle: **the agent is untrusted input**. Roles are bound to
tokens server-side; nothing an agent says (or is prompt-injected into saying)
can widen its grant.

## Layout

```
config.ru                     data plane: the MCP endpoint agents talk to
admin.ru                      control plane: roles / agents / tokens / upstreams / approvals / audit
db/migrations/                Postgres schema
lib/amg/
  policy/                     compiler (YAML -> doc), engine (pure decisions), constraint ops
  auth/                       token authenticator (+30s cache) and issuer
  mcp/                        Rack app, tools/list filter, tools/call enforcement point
  upstream/                   registry, router, MCP client, Stripe HTTP adapter
  approval_gate.rb            human-in-the-loop parking for destructive tools
  rate_limiter.rb             sliding-window limits in Redis (role + per-agent buckets)
  audit.rb                    every decision -> audit_events (sync or Sidekiq)
  jobs/                       Sidekiq workers (async audit writes)
spec/                         RSpec; pure policy specs, rack-test request specs,
                              and the security regression suite
```

## Running

Requirements: Ruby 3.3+ (`.ruby-version` pins 3.4.5), Postgres, Redis.

```sh
bundle install
DATABASE_URL=postgres://localhost/amg bundle exec rake db:migrate

# data plane (agents)
DATABASE_URL=... REDIS_URL=... bundle exec rackup config.ru -p 9292

# control plane (admins; keep off the agent network)
DATABASE_URL=... REDIS_URL=... AMG_ADMIN_TOKEN=$(openssl rand -hex 32) \
  bundle exec rackup admin.ru -p 9293
```

Secrets: set `VAULT_ADDR`/`VAULT_TOKEN` for Vault KV v2, or fall back to env
vars (`vault_path` `stripe/key` reads `AMG_SECRET_STRIPE_KEY`). Optional:
`SLACK_WEBHOOK_URL` for approval notifications, `AMG_AUDIT_ASYNC=1` to push
audit writes through Sidekiq.

### Bootstrapping a role and agent

```sh
ADMIN="Authorization: Bearer $AMG_ADMIN_TOKEN"

curl -sH "$ADMIN" -XPOST localhost:9293/upstreams -d '{
  "name": "notion", "kind": "mcp",
  "endpoint": "https://mcp.notion.com/mcp", "vault_path": "notion/key"
}'

curl -sH "$ADMIN" -XPOST localhost:9293/roles -d '{"policy_yaml":
"role: notion_read\nenforcement: shadow\nservers:\n  notion:\n    tools:\n      - name: get_pages\n        constraints:\n          workspace_id:\n            in: [\"ws_abc123\"]\n      - name: get_users\nlimits:\n  rate: 100/min\napprovals:\n  - match: \"*delete*\"\n    require: human\n    timeout: 15m\n"}'

curl -sH "$ADMIN" -XPOST localhost:9293/agents \
  -d '{"name": "berg-enrichment-worker", "role": "notion_read"}'

curl -sH "$ADMIN" -XPOST localhost:9293/agents/berg-enrichment-worker/tokens -d '{}'
# -> { "token": "amg_..." }  shown once; hand to the agent runtime
```

Point the agent's MCP client at `http://amg:9292/mcp` with that bearer token.
Watch `GET /audit_events?decision=shadow_deny` until the would-deny rate hits
zero, then re-`PUT` the role with `enforcement: enforce`.

### Approvals

Calls matching an `approvals` rule are parked, not forwarded. The agent gets
`amg.pending_approval` with an approval id and polls the always-visible
`amg__check_approval` tool. Admins resolve via
`POST /approvals/:id/approve {"approver": "name"}` (or `/deny`); approval
forwards the *exact* parked payload — arguments cannot be mutated after the
fact. Unresolved approvals expire per the policy `timeout`.

## Tests

```sh
bundle exec rspec
```

No infrastructure needed: SQLite in-memory stands in for Postgres, MockRedis
for Redis, WebMock for upstreams. The policy engine is specced as a pure
function; `spec/security/regression_spec.rb` is the suite the design doc gates
deploys on (spoofed roles, namespace confusion, token replay after revocation,
oversized payloads, fail-closed on malformed policy).

## Deviations from the design doc (v0.1)

- **Bare Rack instead of Roda** for both planes (§7 allowed "Roda or bare
  Rack"); the data plane is one POST route and dependency injection is simpler
  without framework class-level state.
- **`approvals.audit_event_id` is nullable** and approvals carry `request_id`:
  audit writes can be async, so the approval row can't reference an audit row
  that may not exist yet. The two join on `request_id`.
- **Sidekiq is optional at runtime**: audit writes are synchronous unless
  `AMG_AUDIT_ASYNC=1`; the Slack notifier is an inline webhook POST in v1.
- **`allow_args`** (per-tool argument allowlist) supplements §9: constrained
  tools deny unknown argument keys by default, so optional-but-unconstrained
  arguments must be declared explicitly.
- Everything lives under the `AMG::` namespace rather than the doc's top-level
  class names.
