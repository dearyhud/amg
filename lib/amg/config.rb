require "base64"

module AMG
  class ConfigError < StandardError; end

  # Loads and validates process configuration from ENV. Fails closed: any
  # missing or malformed required value raises before the app boots.
  class Config
    MASTER_KEY_BYTES = 32

    attr_reader :listen_addr, :database_url, :master_key, :public_url,
                :bootstrap_email, :bootstrap_password, :rate_limit_per_min,
                :redact_keys, :log_level

    def initialize(env = ENV)
      @listen_addr = env.fetch("AMG_LISTEN_ADDR", ":8420")
      @database_url = require_env(env, "AMG_DATABASE_URL")
      @master_key = decode_master_key(require_env(env, "AMG_MASTER_KEY"))
      @public_url = env["AMG_PUBLIC_URL"]
      @bootstrap_email = blank_to_nil(env["AMG_BOOTSTRAP_EMAIL"])
      @bootstrap_password = blank_to_nil(env["AMG_BOOTSTRAP_PASSWORD"])
      @rate_limit_per_min = Integer(env.fetch("AMG_RATE_LIMIT_PER_MIN", "60"))
      @redact_keys = (env["AMG_REDACT_KEYS"] || "").split(",").map(&:strip).reject(&:empty?)
      @log_level = env.fetch("AMG_LOG_LEVEL", "info")
    end

    def self.load(env = ENV)
      new(env)
    end

    private

    # Env vars are frequently wired through shell/compose "${VAR:-}" defaults,
    # which yield "" rather than an absent key. "" is truthy in Ruby, so
    # anything that gates on presence (e.g. Store::Bootstrap's admin check)
    # must never see a blank string as "set".
    def blank_to_nil(value)
      value.nil? || value.empty? ? nil : value
    end

    def require_env(env, name)
      value = env[name]
      raise ConfigError, "#{name} is required; refusing to boot" if value.nil? || value.empty?

      value
    end

    def decode_master_key(raw)
      key = Base64.strict_decode64(raw)
      unless key.bytesize == MASTER_KEY_BYTES
        raise ConfigError,
              "AMG_MASTER_KEY must decode to #{MASTER_KEY_BYTES} bytes (got #{key.bytesize}); refusing to boot"
      end

      key
    rescue ArgumentError
      raise ConfigError, "AMG_MASTER_KEY must be valid base64; refusing to boot"
    end
  end
end
