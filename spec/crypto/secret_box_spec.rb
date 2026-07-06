require "spec_helper"

RSpec.describe AMG::Crypto::SecretBox do
  let(:master_key) { "k" * 32 }

  it "round-trips a secret" do
    envelope = described_class.encrypt("ghp_supersecrettoken", master_key)
    plaintext = described_class.decrypt(envelope[:ciphertext], envelope[:nonce], master_key)
    expect(plaintext).to eq("ghp_supersecrettoken")
  end

  it "uses a random nonce per encryption" do
    a = described_class.encrypt("same-plaintext", master_key)
    b = described_class.encrypt("same-plaintext", master_key)
    expect(a[:nonce]).not_to eq(b[:nonce])
    expect(a[:ciphertext]).not_to eq(b[:ciphertext])
  end

  it "does not store the plaintext anywhere in the ciphertext" do
    envelope = described_class.encrypt("ghp_supersecrettoken", master_key)
    expect(envelope[:ciphertext]).not_to include("ghp_supersecrettoken")
  end

  it "fails closed on the wrong master key instead of returning garbage" do
    envelope = described_class.encrypt("secret", master_key)
    expect { described_class.decrypt(envelope[:ciphertext], envelope[:nonce], "wrong key wrong key wrong key wr") }
      .to raise_error(AMG::ConfigError, /decryption failed/)
  end
end
