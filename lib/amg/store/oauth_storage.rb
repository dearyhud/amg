require "json"
require_relative "../crypto/secret_box"

module AMG
  module Store
    # Postgres-backed, encrypted-at-rest implementation of the
    # `MCP::Client::OAuth` storage contract (`tokens`, `save_tokens`,
    # `client_information`, `save_client_information`). One instance per
    # upstream. `tokens` and `client_information` are opaque Hashes as
    # returned by the token endpoint / dynamic client registration — stored
    # as encrypted JSON blobs, same AES-256-GCM envelope as upstream_secrets.
    class OAuthStorage
      def initialize(db:, upstream_id:, master_key:)
        @db = db
        @upstream_id = upstream_id
        @master_key = master_key
      end

      def tokens
        decrypt_column(:tokens_ciphertext, :tokens_nonce)
      end

      # `tokens` may be nil (Provider#clear_tokens! after a dead refresh token).
      def save_tokens(tokens)
        write_column(:tokens_ciphertext, :tokens_nonce, tokens)
      end

      def client_information
        decrypt_column(:client_info_ciphertext, :client_info_nonce)
      end

      def save_client_information(info)
        write_column(:client_info_ciphertext, :client_info_nonce, info)
      end

      private

      def row
        @db[:upstream_oauth_state].where(upstream_id: @upstream_id).first
      end

      def decrypt_column(ciphertext_col, nonce_col)
        current = row
        return nil unless current && current[ciphertext_col]

        plaintext = Crypto::SecretBox.decrypt(current[ciphertext_col].to_s, current[nonce_col].to_s, @master_key)
        JSON.parse(plaintext)
      end

      def write_column(ciphertext_col, nonce_col, value)
        if value.nil?
          upsert(ciphertext_col => nil, nonce_col => nil)
        else
          envelope = Crypto::SecretBox.encrypt(JSON.generate(value), @master_key)
          upsert(ciphertext_col => Sequel.blob(envelope[:ciphertext]), nonce_col => Sequel.blob(envelope[:nonce]))
        end
      end

      def upsert(columns)
        @db[:upstream_oauth_state]
          .insert_conflict(target: :upstream_id, update: columns.merge(updated_at: Time.now))
          .insert(columns.merge(upstream_id: @upstream_id))
      end
    end
  end
end
