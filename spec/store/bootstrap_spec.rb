require "spec_helper"

RSpec.describe AMG::Store::Bootstrap do
  let(:db) { AMG::Store::DB.connect(AMG::Spec::Database.url) }
  let(:config) do
    instance_double(
      AMG::Config,
      bootstrap_email: "owner@example.com",
      bootstrap_password: "change-me-now"
    )
  end

  it "creates exactly one workspace, idempotently" do
    id1 = described_class.ensure_workspace(db)
    id2 = described_class.ensure_workspace(db)

    expect(id1).to eq(id2)
    expect(db[:workspaces].count).to eq(1)
  end

  it "creates an owner admin from bootstrap env when none exists" do
    workspace_id = described_class.ensure_workspace(db)
    described_class.ensure_owner_admin(db, workspace_id, config)

    admin = db[:admins].first
    expect(admin[:email]).to eq("owner@example.com")
    expect(admin[:role]).to eq("owner")
    expect(AMG::Crypto::Password.verify?("change-me-now", admin[:password_hash])).to be true
  end

  it "does not create a second admin on repeated calls" do
    workspace_id = described_class.ensure_workspace(db)
    described_class.ensure_owner_admin(db, workspace_id, config)
    described_class.ensure_owner_admin(db, workspace_id, config)

    expect(db[:admins].count).to eq(1)
  end

  it "logs and skips admin creation when bootstrap env is unset" do
    workspace_id = described_class.ensure_workspace(db)
    unset_config = instance_double(AMG::Config, bootstrap_email: nil, bootstrap_password: nil)
    logger = instance_double(Logger, warn: nil)

    described_class.ensure_owner_admin(db, workspace_id, unset_config, logger: logger)

    expect(logger).to have_received(:warn)
    expect(db[:admins].count).to eq(0)
  end
end
