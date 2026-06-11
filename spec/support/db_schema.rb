# frozen_string_literal: true

# SQLite-compatible mirror of db/migrations/001_initial.rb for fast,
# infrastructure-free specs. UUIDs are text; JSONB is JSON text.
module DbSchema
  module_function

  def create(db)
    db.create_table(:roles) do
      String :id, primary_key: true
      String :name, unique: true, null: false
      String :description
      String :policy, text: true, null: false
      Integer :policy_version, null: false, default: 1
      String :enforcement, null: false, default: "enforce"
      Time :created_at
      Time :updated_at
    end

    db.create_table(:agents) do
      String :id, primary_key: true
      String :name, unique: true, null: false
      String :role_id, null: false
      String :status, null: false, default: "active"
      Time :created_at
    end

    db.create_table(:agent_tokens) do
      String :id, primary_key: true
      String :agent_id, null: false
      String :token_digest, unique: true, null: false
      Time :expires_at
      Time :revoked_at
      Time :last_used_at
      Time :created_at
    end

    db.create_table(:upstreams) do
      String :id, primary_key: true
      String :name, unique: true, null: false
      String :kind, null: false
      String :endpoint, null: false
      String :vault_path, null: false
      Time :created_at
    end

    db.create_table(:audit_events) do
      primary_key :id
      String :agent_id, null: false
      String :role_name, null: false
      Integer :policy_version, null: false
      String :tool, null: false
      String :arguments, text: true, null: false
      String :decision, null: false
      String :deny_reason
      String :upstream_status
      Integer :latency_ms
      String :request_id, null: false
      Time :created_at
    end

    db.create_table(:approvals) do
      String :id, primary_key: true
      Integer :audit_event_id
      String :request_id
      String :payload, text: true, null: false
      String :state, null: false, default: "pending"
      String :approver
      Time :expires_at, null: false
      Time :resolved_at
    end

    db
  end

  def connect
    create(Sequel.sqlite)
  end
end
