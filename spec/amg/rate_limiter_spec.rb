# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::RateLimiter do
  subject(:limiter) { described_class.new(redis: redis, clock: -> { now }) }

  let(:redis) { MockRedis.new }
  let(:now) { Time.now.to_f }

  def identity_with(limits)
    build_identity(policy: IdentityHelpers::DEFAULT_POLICY.merge(limits: limits))
  end

  it "is a no-op when the policy declares no limits" do
    identity = identity_with({})
    expect { 50.times { limiter.check!(identity, "t__t") } }.not_to raise_error
  end

  it "allows calls under the role limit and raises over it" do
    identity = identity_with(rate: { limit: 3, period: 60 })
    3.times { limiter.check!(identity, "t__t") }
    expect { limiter.check!(identity, "t__t") }.to raise_error(AMG::RateLimited) do |e|
      expect(e.retry_after_ms).to be > 0
      expect(e.retry_after_ms).to be <= 60_000
    end
  end

  it "enforces the per-agent override independently" do
    identity = identity_with(rate: { limit: 100, period: 60 }, per_agent: { limit: 2, period: 60 })
    2.times { limiter.check!(identity, "t__t") }
    expect { limiter.check!(identity, "t__t") }
      .to raise_error(AMG::RateLimited, /agent:/)
  end

  it "shares the role bucket across agents but not the agent bucket" do
    a = identity_with(per_agent: { limit: 2, period: 60 })
    b = AMG::AgentIdentity.new(
      agent_id: "agent-2", agent_name: "other", role_name: a.role_name,
      policy: a.policy, policy_version: 1, enforcement: "enforce"
    )
    2.times { limiter.check!(a, "t__t") }
    expect { limiter.check!(b, "t__t") }.not_to raise_error
  end

  it "frees capacity once the window slides past old calls" do
    clock_now = Time.now.to_f
    limiter = described_class.new(redis: redis, clock: -> { clock_now })
    identity = identity_with(rate: { limit: 2, period: 60 })

    2.times { limiter.check!(identity, "t__t") }
    expect { limiter.check!(identity, "t__t") }.to raise_error(AMG::RateLimited)

    clock_now += 61
    expect { limiter.check!(identity, "t__t") }.not_to raise_error
  end
end
