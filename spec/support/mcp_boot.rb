require_relative "../../lib/amg"

module AMG
  module Spec
    FIXTURE_MCP_SERVER = File.expand_path("../fixtures/github_like_server.rb", __dir__)
    TEST_MASTER_KEY = "x" * 32
  end
end

RSpec.configure do |config|
  config.before(:suite) do
    AMG.logger = Logger.new(File::NULL)
    AMG.db = AMG::Spec::Database.connect
    AMG.config = AMG::Config.new(
      "AMG_DATABASE_URL" => AMG::Spec::Database.url,
      "AMG_MASTER_KEY" => Base64.strict_encode64(AMG::Spec::TEST_MASTER_KEY)
    )
    AMG.upstream_manager = AMG::Mcp::UpstreamManager.new(db: AMG.db, master_key: AMG::Spec::TEST_MASTER_KEY)
    AMG.oauth_connector = AMG::Mcp::OAuthConnector.new
    AMG.audit = AMG::Audit::Writer.new(AMG.db)
    AMG.rate_limiter = AMG::Server::RateLimiter.new(rate_per_min: 60, burst: 120)
  end

  config.after(:suite) do
    AMG.upstream_manager&.shutdown
    AMG.audit&.stop
  end
end
