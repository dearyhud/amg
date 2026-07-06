require "logger"

module AMG
  class << self
    attr_accessor :config, :db, :logger, :upstream_manager, :audit, :rate_limiter, :oauth_connector
  end
end

require_relative "amg/config"
require_relative "amg/store/db"
require_relative "amg/store/bootstrap"
require_relative "amg/policy"
require_relative "amg/audit/redactor"
require_relative "amg/audit/writer"
require_relative "amg/mcp/upstream_manager"
require_relative "amg/mcp/oauth_connector"
require_relative "amg/crypto/secret_box"
require_relative "amg/store/secrets"
require_relative "amg/store/oauth_storage"
require_relative "amg/server/rate_limiter"
