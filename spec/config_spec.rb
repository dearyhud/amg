require "spec_helper"

RSpec.describe AMG::Config do
  let(:valid_key) { Base64.strict_encode64("x" * 32) }
  let(:base_env) do
    {
      "AMG_DATABASE_URL" => "postgres://localhost/amg_test",
      "AMG_MASTER_KEY" => valid_key
    }
  end

  it "loads required fields and defaults" do
    config = described_class.new(base_env)
    expect(config.database_url).to eq("postgres://localhost/amg_test")
    expect(config.master_key.bytesize).to eq(32)
    expect(config.listen_addr).to eq(":8420")
    expect(config.rate_limit_per_min).to eq(60)
    expect(config.redact_keys).to eq([])
  end

  it "refuses to boot without AMG_DATABASE_URL" do
    expect { described_class.new(base_env.except("AMG_DATABASE_URL")) }
      .to raise_error(AMG::ConfigError, /AMG_DATABASE_URL/)
  end

  it "refuses to boot without AMG_MASTER_KEY" do
    expect { described_class.new(base_env.except("AMG_MASTER_KEY")) }
      .to raise_error(AMG::ConfigError, /AMG_MASTER_KEY/)
  end

  it "refuses a master key that is not valid base64" do
    expect { described_class.new(base_env.merge("AMG_MASTER_KEY" => "not base64!!")) }
      .to raise_error(AMG::ConfigError, /base64/)
  end

  it "refuses a master key that does not decode to 32 bytes" do
    short_key = Base64.strict_encode64("short")
    expect { described_class.new(base_env.merge("AMG_MASTER_KEY" => short_key)) }
      .to raise_error(AMG::ConfigError, /32 bytes/)
  end

  it "parses AMG_REDACT_KEYS as a trimmed comma-separated list" do
    config = described_class.new(base_env.merge("AMG_REDACT_KEYS" => "foo, bar ,baz"))
    expect(config.redact_keys).to eq(%w[foo bar baz])
  end

  it "treats a blank AMG_BOOTSTRAP_EMAIL/PASSWORD as unset, not as an empty value" do
    # Shell/compose "${VAR:-}" defaults yield "" rather than an absent key;
    # "" is truthy in Ruby, so Store::Bootstrap must never see it as "set".
    config = described_class.new(base_env.merge("AMG_BOOTSTRAP_EMAIL" => "", "AMG_BOOTSTRAP_PASSWORD" => ""))
    expect(config.bootstrap_email).to be_nil
    expect(config.bootstrap_password).to be_nil
  end
end
