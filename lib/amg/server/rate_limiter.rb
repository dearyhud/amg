module AMG
  module Server
    # One global per-agent token bucket (SPEC §10, non-goals: no per-route
    # config in v1). Shared across surfaces so a single agent identity has
    # one budget regardless of which surface it calls.
    class RateLimiter
      def initialize(rate_per_min:, burst:)
        @rate_per_min = rate_per_min
        @burst = burst
        @buckets = {}
        @mutex = Mutex.new
      end

      # @return [Boolean] true if the request is allowed (and consumes a token)
      def allow?(agent_id)
        @mutex.synchronize do
          bucket = @buckets[agent_id] ||= { tokens: @burst.to_f, updated_at: monotonic_now }
          refill(bucket)
          return false if bucket[:tokens] < 1

          bucket[:tokens] -= 1
          true
        end
      end

      private

      def refill(bucket)
        now = monotonic_now
        elapsed = now - bucket[:updated_at]
        bucket[:tokens] = [@burst.to_f, bucket[:tokens] + (elapsed * @rate_per_min / 60.0)].min
        bucket[:updated_at] = now
      end

      def monotonic_now
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end
  end
end
