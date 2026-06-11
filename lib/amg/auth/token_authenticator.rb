# frozen_string_literal: true

module AMG
  module Auth
    class TokenAuthenticator
      CACHE_TTL = 30 # seconds; revocation latency ceiling

      def initialize(db:, redis:)
        @db = db
        @redis = redis
      end

      def call(bearer_token)
        raise AuthError, "missing bearer token" if bearer_token.to_s.empty?

        digest = Digest::SHA256.hexdigest(bearer_token.to_s)

        cached = @redis.get(cache_key(digest))
        return AgentIdentity.from_json(cached) if cached

        row = lookup(digest)
        raise AuthError, "invalid or revoked token" unless row

        @db[:agent_tokens].where(token_digest: digest).update(last_used_at: Time.now.utc)

        AgentIdentity.new(**row).tap do |identity|
          @redis.setex(cache_key(digest), CACHE_TTL, identity.to_json)
        end
      end

      def self.cache_key(digest) = "amg:token:#{digest}"

      private

      def lookup(digest)
        @db[:agent_tokens]
          .join(:agents, id: :agent_id)
          .join(:roles, Sequel[:roles][:id] => Sequel[:agents][:role_id])
          .where(Sequel[:agent_tokens][:token_digest] => digest,
                 Sequel[:agent_tokens][:revoked_at] => nil)
          .where do
            (Sequel[:agent_tokens][:expires_at] =~ nil) |
              (Sequel[:agent_tokens][:expires_at] > Sequel::CURRENT_TIMESTAMP)
          end
          .where(Sequel[:agents][:status] => "active")
          .select(
            Sequel[:agents][:id].as(:agent_id),
            Sequel[:agents][:name].as(:agent_name),
            Sequel[:roles][:name].as(:role_name),
            Sequel[:roles][:policy],
            Sequel[:roles][:policy_version],
            Sequel[:roles][:enforcement]
          ).first
      end

      def cache_key(digest) = self.class.cache_key(digest)
    end
  end
end
