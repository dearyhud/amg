require "json"
require_relative "../amg"

module AMG
  # Boots process-wide state: config, structured logger, DB connection,
  # migrations, bootstrap admin. Called once from bin/amg and config.ru.
  module Boot
    def self.call(env = ENV)
      # Defense-in-depth per SPEC §8.2: lib/amg/policy is RE2-only and never
      # constructs a native Regexp, but a global timeout still bounds any
      # accidental/third-party Regexp use elsewhere in the process.
      Regexp.timeout = 1

      AMG.config = Config.load(env)
      AMG.logger = build_logger(AMG.config.log_level)
      boot_store
      boot_runtime
      AMG
    end

    def self.boot_store
      AMG.db = Store::DB.migrate(AMG.config.database_url)
      Store::DB.ensure_audit_partitions(AMG.db)
      Store::Bootstrap.run(AMG.db, AMG.config, logger: AMG.logger)
    end

    def self.boot_runtime
      AMG.upstream_manager = Mcp::UpstreamManager.new(db: AMG.db, master_key: AMG.config.master_key)
      AMG.oauth_connector = Mcp::OAuthConnector.new
      AMG.audit = Audit::Writer.new(AMG.db)
      AMG.rate_limiter = build_rate_limiter(AMG.config)
    end

    def self.build_rate_limiter(config)
      Server::RateLimiter.new(rate_per_min: config.rate_limit_per_min, burst: config.rate_limit_per_min * 2)
    end

    def self.build_logger(level)
      logger = Logger.new($stdout)
      logger.level = level
      logger.formatter = proc do |severity, datetime, _progname, msg|
        "#{{ ts: datetime.iso8601, level: severity, msg: msg }.to_json}\n"
      end
      logger
    end
  end
end
