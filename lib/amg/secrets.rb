# frozen_string_literal: true

module AMG
  module Secrets
    # Development / single-box fallback: vault_path "notion/api_key" reads
    # ENV["AMG_SECRET_NOTION_API_KEY"].
    class Env
      def initialize(env: ENV, prefix: "AMG_SECRET_")
        @env = env
        @prefix = prefix
      end

      def read(path)
        key = @prefix + path.to_s.gsub(/[^A-Za-z0-9]+/, "_").upcase.sub(/\A_+|_+\z/, "")
        @env.fetch(key) { raise SecretNotFound, "no env secret #{key} for vault path #{path.inspect}" }
      end
    end

    # HashiCorp Vault KV v2. vault_path may carry a field suffix:
    # "notion/creds#api_key" (field defaults to "value").
    class Vault
      def initialize(addr:, token:, mount: "secret", http: nil)
        require "faraday"
        @conn = http || Faraday.new(url: addr) { |f| f.options.timeout = 5 }
        @token = token
        @mount = mount
      end

      def read(path)
        rel, field = path.to_s.split("#", 2)
        field ||= "value"
        resp = @conn.get("/v1/#{@mount}/data/#{rel}") do |req|
          req.headers["X-Vault-Token"] = @token
        end
        raise SecretNotFound, "vault read failed for #{rel} (HTTP #{resp.status})" unless resp.status == 200

        JSON.parse(resp.body).dig("data", "data", field) or
          raise SecretNotFound, "vault secret #{rel} has no field #{field.inspect}"
      end
    end
  end
end
