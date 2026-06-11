# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Auth::TokenAuthenticator do
  subject(:authenticator) { described_class.new(db: db, redis: redis) }

  let(:db) { DbSchema.connect }
  let(:redis) { MockRedis.new }
  let(:issuer) { AMG::Auth::TokenIssuer.new(db: db, redis: redis) }
  let(:policy) { IdentityHelpers::DEFAULT_POLICY }

  let(:role_id) { SecureRandom.uuid }
  let(:agent_id) { SecureRandom.uuid }

  before do
    db[:roles].insert(id: role_id, name: "notion_read", policy: JSON.generate(policy),
                      policy_version: 3, enforcement: "enforce",
                      created_at: Time.now.utc, updated_at: Time.now.utc)
    db[:agents].insert(id: agent_id, name: "berg-enrichment-worker", role_id: role_id,
                       status: "active", created_at: Time.now.utc)
  end

  def issue(**kwargs) = issuer.issue(agent_id: agent_id, **kwargs)

  it "resolves a valid token to the agent's identity and role policy" do
    token = issue[:token]
    identity = authenticator.call(token)

    expect(identity.agent_id).to eq(agent_id)
    expect(identity.agent_name).to eq("berg-enrichment-worker")
    expect(identity.role_name).to eq("notion_read")
    expect(identity.policy_version).to eq(3)
    expect(identity.policy[:servers][:notion][:tools].first[:name]).to eq("get_pages")
    expect(identity.shadow?).to be false
  end

  it "touches last_used_at" do
    token = issue[:token]
    authenticator.call(token)
    expect(db[:agent_tokens].first[:last_used_at]).not_to be_nil
  end

  it "rejects unknown, empty, and missing tokens" do
    expect { authenticator.call("amg_bogus") }.to raise_error(AMG::AuthError)
    expect { authenticator.call("") }.to raise_error(AMG::AuthError)
    expect { authenticator.call(nil) }.to raise_error(AMG::AuthError)
  end

  it "rejects expired tokens but honors future expiries" do
    expired = issue(expires_at: Time.now.utc - 86_400)[:token]
    expect { authenticator.call(expired) }.to raise_error(AMG::AuthError)

    live = issue(expires_at: Time.now.utc + 86_400)[:token]
    expect { authenticator.call(live) }.not_to raise_error
  end

  it "rejects tokens of suspended agents" do
    token = issue[:token]
    db[:agents].where(id: agent_id).update(status: "suspended")
    expect { authenticator.call(token) }.to raise_error(AMG::AuthError)
  end

  it "serves cache hits without touching the database" do
    token = issue[:token]
    authenticator.call(token)

    db[:agent_tokens].delete # cached identity survives the row's deletion...
    expect(authenticator.call(token).agent_id).to eq(agent_id)

    digest = Digest::SHA256.hexdigest(token)
    redis.del(described_class.cache_key(digest)) # ...until the cache entry dies
    expect { authenticator.call(token) }.to raise_error(AMG::AuthError)
  end

  it "caches with the documented TTL (revocation latency ceiling)" do
    token = issue[:token]
    authenticator.call(token)
    digest = Digest::SHA256.hexdigest(token)
    expect(redis.ttl(described_class.cache_key(digest))).to be_between(1, described_class::CACHE_TTL)
  end

  it "revocation through the issuer busts the cache immediately (token replay)" do
    issued = issue
    authenticator.call(issued[:token]) # warm the cache

    issuer.revoke(issued[:id])
    expect { authenticator.call(issued[:token]) }.to raise_error(AMG::AuthError)
  end

  it "stores only digests, never the plaintext token" do
    token = issue[:token]
    expect(db[:agent_tokens].map(:token_digest)).to all(match(/\A[0-9a-f]{64}\z/))
    expect(db[:agent_tokens].where(token_digest: token).count).to eq(0)
  end
end
