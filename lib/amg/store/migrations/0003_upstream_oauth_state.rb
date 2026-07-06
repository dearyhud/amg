Sequel.migration do
  up do
    run <<~SQL
      -- One row per upstream that has ever started an OAuth connect flow.
      -- `tokens` and `client_information` are the two Hashes the mcp gem's
      -- OAuth::StorageBackedProvider contract persists (SPEC has no schema
      -- for this — OAuth-connected upstreams are a post-v1 addition).
      -- Both are encrypted as opaque JSON blobs under AMG_MASTER_KEY, same
      -- envelope as upstream_secrets (AES-256-GCM, random nonce per write).
      CREATE TABLE upstream_oauth_state (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        upstream_id               UUID NOT NULL UNIQUE REFERENCES upstreams(id) ON DELETE CASCADE,
        tokens_ciphertext         BYTEA,
        tokens_nonce              BYTEA,
        client_info_ciphertext    BYTEA,
        client_info_nonce         BYTEA,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    SQL
  end

  down do
    run "DROP TABLE IF EXISTS upstream_oauth_state;"
  end
end
