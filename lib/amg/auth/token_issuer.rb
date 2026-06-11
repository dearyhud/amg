# frozen_string_literal: true

module AMG
  module Auth
    class TokenIssuer
      PREFIX = "amg_"

      def initialize(db:, redis: nil)
        @db = db
        @redis = redis
      end

      # Plaintext is returned exactly once; only the digest is stored.
      def issue(agent_id:, expires_at: nil)
        token = PREFIX + SecureRandom.hex(32) # 256-bit
        id = SecureRandom.uuid
        @db[:agent_tokens].insert(
          id: id,
          agent_id: agent_id,
          token_digest: Digest::SHA256.hexdigest(token),
          expires_at: expires_at,
          created_at: Time.now.utc
        )
        { id: id, token: token }
      end

      # Busting the cache makes revocation immediate instead of waiting out
      # the authenticator's TTL.
      def revoke(token_id)
        row = @db[:agent_tokens].where(id: token_id).first
        raise Error, "no such token: #{token_id}" unless row

        @db[:agent_tokens].where(id: token_id).update(revoked_at: Time.now.utc)
        @redis&.del(TokenAuthenticator.cache_key(row[:token_digest]))
        true
      end
    end
  end
end
