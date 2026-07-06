require "json"
require "securerandom"

module AMG
  module Audit
    # Bounded, batching, non-blocking audit writer (ADR-0009). `record` never
    # blocks enforcement: on a full queue it drops the oldest event and bumps
    # a counter instead of raising or backpressuring the caller.
    class Writer
      QUEUE_CAP = 10_000
      BATCH_SIZE = 500
      FLUSH_INTERVAL = 0.25

      attr_reader :dropped_count

      def initialize(db)
        @db = db
        @queue = []
        @mutex = Mutex.new
        @dropped_count = 0
        @stop = false
        @flushing = false
        @thread = Thread.new { run_loop }
      end

      def record(event)
        @mutex.synchronize do
          if @queue.size >= QUEUE_CAP
            @queue.shift
            @dropped_count += 1
          end
          @queue << event.merge(id: SecureRandom.uuid, occurred_at: Time.now)
        end
        nil
      end

      # Test/shutdown helper: blocks until the queue has drained AND any
      # in-flight batch insert has completed (or timeout). Checking the
      # queue alone races with flush_batch, which empties the queue before
      # the INSERT it's about to run has landed.
      def wait_until_empty(timeout: 2)
        deadline = monotonic_now + timeout
        loop do
          done = @mutex.synchronize { @queue.empty? && !@flushing }
          return true if done
          return false if monotonic_now > deadline

          sleep(0.01)
        end
      end

      def stop
        @stop = true
        @thread.join(2)
      end

      private

      def run_loop
        until @stop
          flush_batch
          sleep(FLUSH_INTERVAL)
        end
        flush_batch
      end

      def flush_batch
        batch = @mutex.synchronize do
          items = @queue.shift(BATCH_SIZE)
          @flushing = true unless items.empty?
          items
        end
        return if batch.empty?

        @db[:audit_events].multi_insert(batch)
      rescue StandardError => e
        AMG.logger&.error("amg: audit write failed: #{e.class}: #{e.message}")
      ensure
        @mutex.synchronize { @flushing = false } unless batch && batch.empty?
      end

      def monotonic_now
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end
  end
end
