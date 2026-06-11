# frozen_string_literal: true

# AMG admin plane: roles / agents / tokens / upstreams / approvals / audit.
# Run on a separate port, behind your internal network:
#   DATABASE_URL=... REDIS_URL=... AMG_ADMIN_TOKEN=... bundle exec rackup admin.ru -p 9293

require "sequel"
require "redis"
require_relative "lib/amg"

Sequel.default_timezone = :utc

AMG.db = Sequel.connect(ENV.fetch("DATABASE_URL"))
AMG.db.extension :pg_json if AMG.db.adapter_scheme == :postgres
AMG.redis = Redis.new(url: ENV.fetch("REDIS_URL", "redis://localhost:6379/0"))
AMG.secrets =
  if ENV["VAULT_ADDR"]
    AMG::Secrets::Vault.new(addr: ENV.fetch("VAULT_ADDR"), token: ENV.fetch("VAULT_TOKEN"))
  else
    AMG::Secrets::Env.new
  end

registry = AMG::Upstream::Registry.new(db: AMG.db, secrets: AMG.secrets)
router = AMG::Upstream::Router.new(registry: registry, secrets: AMG.secrets)

run AMG::Admin::App.new(
  db: AMG.db,
  compiler: AMG::Policy::Compiler.new(registry: registry),
  issuer: AMG::Auth::TokenIssuer.new(db: AMG.db, redis: AMG.redis),
  approval_gate: AMG::ApprovalGate.new(db: AMG.db, router: router),
  admin_token: ENV.fetch("AMG_ADMIN_TOKEN"),
  registry: registry
)
