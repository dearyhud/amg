# frozen_string_literal: true

require "sequel"
require "mock_redis"
require "webmock/rspec"
require "rack/test"

Sequel.default_timezone = :utc

require_relative "../lib/amg"
require_relative "support/db_schema"
require_relative "support/fakes"
require_relative "support/identity_helpers"

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end
  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end
  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.disable_monkey_patching!
  config.order = :random
  Kernel.srand config.seed
end
