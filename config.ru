# frozen_string_literal: true

# AMG data plane: the MCP endpoint agents talk to.
#   DATABASE_URL=postgres://... REDIS_URL=redis://... bundle exec rackup config.ru

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

slack_notifier =
  if (webhook = ENV["SLACK_WEBHOOK_URL"])
    require "faraday"
    lambda do |approval_id:, tool:, agent:|
      Faraday.new(url: webhook) { |f| f.options.timeout = 5 }.post(nil) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = JSON.generate(
          text: "AMG approval pending: `#{tool}` from agent `#{agent}` — id `#{approval_id}`"
        )
      end
    end
  end

run AMG::MCP::App.new(
  authenticator: AMG::Auth::TokenAuthenticator.new(db: AMG.db, redis: AMG.redis),
  registry: registry,
  router: router,
  audit: AMG::Audit.new(db: AMG.db, async: ENV["AMG_AUDIT_ASYNC"] == "1"),
  rate_limiter: AMG::RateLimiter.new(redis: AMG.redis),
  approval_gate: AMG::ApprovalGate.new(db: AMG.db, router: router, notifier: slack_notifier)
)
