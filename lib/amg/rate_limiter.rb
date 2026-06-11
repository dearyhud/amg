# frozen_string_literal: true

module AMG
  # Sliding-window limiter over Redis sorted sets. Two buckets per call:
  # the role-wide ceiling and an optional per-agent override, both from the
  # compiled policy's limits section.
  class RateLimiter
    def initialize(redis:, clock: -> { Process.clock_gettime(Process::CLOCK_REALTIME) })
      @redis = redis
      @clock = clock
    end

    def check!(identity, _tool)
      limits = identity.policy[:limits]
      return unless limits.is_a?(Hash)

      check_bucket!("role:#{identity.role_name}", limits[:rate])
      check_bucket!("agent:#{identity.agent_id}", limits[:per_agent])
      nil
    end

    private

    def check_bucket!(bucket, rate)
      return unless rate.is_a?(Hash) && rate[:limit] && rate[:period]

      limit = rate[:limit]
      window_ms = rate[:period] * 1000
      key = "amg:rl:#{bucket}"
      now_ms = (@clock.call * 1000).to_i

      @redis.zremrangebyscore(key, 0, now_ms - window_ms)
      if @redis.zcard(key) >= limit
        oldest = @redis.zrange(key, 0, 0, withscores: true).dig(0, 1).to_i
        retry_after = [oldest + window_ms - now_ms, 0].max
        raise RateLimited.new("rate limit exceeded for #{bucket} (#{limit}/#{rate[:period]}s)",
                              retry_after_ms: retry_after)
      end

      @redis.zadd(key, now_ms, "#{now_ms}:#{SecureRandom.hex(4)}")
      @redis.expire(key, rate[:period] * 2)
    end
  end
end
