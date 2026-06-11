# frozen_string_literal: true

require "json"
require "yaml"
require "digest"
require "securerandom"
require "set"
require "time"

module AMG
  class << self
    # process-wide handles, set at boot (config.ru); components take their
    # dependencies explicitly — these exist for jobs and console use
    attr_accessor :db, :redis, :secrets, :logger
  end
end

require_relative "amg/version"
require_relative "amg/errors"
require_relative "amg/util"
require_relative "amg/tool"
require_relative "amg/json_rpc"
require_relative "amg/agent_identity"
require_relative "amg/secrets"
require_relative "amg/policy/constraint"
require_relative "amg/policy/engine"
require_relative "amg/policy/compiler"
require_relative "amg/auth/token_authenticator"
require_relative "amg/auth/token_issuer"
require_relative "amg/rate_limiter"
require_relative "amg/audit"
require_relative "amg/approval_gate"
require_relative "amg/upstream/mcp_client"
require_relative "amg/upstream/http_adapters/stripe"
require_relative "amg/upstream/registry"
require_relative "amg/upstream/router"
require_relative "amg/mcp/tool_list"
require_relative "amg/mcp/tool_call"
require_relative "amg/mcp/app"
require_relative "amg/admin/app"
