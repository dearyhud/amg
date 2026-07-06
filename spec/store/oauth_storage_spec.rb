require "spec_helper"

RSpec.describe AMG::Store::OAuthStorage do
  subject(:storage) { described_class.new(db: db, upstream_id: upstream_id, master_key: master_key) }

  let(:db) { AMG::Spec::Database.connect }
  let(:workspace_id) { AMG::Store::Bootstrap.ensure_workspace(db) }
  let(:master_key) { AMG::Spec::TEST_MASTER_KEY }

  let(:upstream_id) do
    db[:upstreams].returning(:id).insert(
      workspace_id: workspace_id, slug: "u1", display_name: "U1", kind: "mcp_http", config: Sequel.pg_jsonb({})
    ).first[:id]
  end

  it "returns nil for tokens/client_information before anything is saved" do
    expect(storage.tokens).to be_nil
    expect(storage.client_information).to be_nil
  end

  it "round-trips tokens" do
    storage.save_tokens({ "access_token" => "at", "refresh_token" => "rt", "expires_in" => 3600 })
    expect(storage.tokens).to eq({ "access_token" => "at", "refresh_token" => "rt", "expires_in" => 3600 })
  end

  it "round-trips client_information independently of tokens" do
    storage.save_client_information({ "client_id" => "abc123" })
    expect(storage.client_information).to eq({ "client_id" => "abc123" })
    expect(storage.tokens).to be_nil
  end

  it "overwrites on repeated saves rather than erroring" do
    storage.save_tokens({ "access_token" => "first" })
    storage.save_tokens({ "access_token" => "second" })
    expect(storage.tokens).to eq({ "access_token" => "second" })
  end

  it "clears tokens when saved as nil (Provider#clear_tokens! after a dead refresh token)" do
    storage.save_tokens({ "access_token" => "at" })
    storage.save_tokens(nil)
    expect(storage.tokens).to be_nil
  end

  it "never stores the plaintext token value in the ciphertext column" do
    storage.save_tokens({ "access_token" => "super-secret-token" })
    row = db[:upstream_oauth_state].where(upstream_id: upstream_id).first
    expect(row[:tokens_ciphertext].to_s).not_to include("super-secret-token")
  end
end
