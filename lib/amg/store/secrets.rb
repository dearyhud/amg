require_relative "../crypto/secret_box"

module AMG
  module Store
    # Resolves {{secret:name}} placeholders in upstream config against
    # upstream_secrets, decrypting in memory only (SPEC §7, ADR-0006).
    module Secrets
      PLACEHOLDER = "{{secret:".freeze

      def self.resolve(db, upstream_id, value, master_key)
        case value
        when String then resolve_string(db, upstream_id, value, master_key)
        when Hash then value.transform_values { |v| resolve(db, upstream_id, v, master_key) }
        when Array then value.map { |v| resolve(db, upstream_id, v, master_key) }
        else value
        end
      end

      def self.resolve_string(db, upstream_id, str, master_key)
        return str unless str.include?(PLACEHOLDER)

        name = str[/\{\{secret:([^}]+)\}\}/, 1]
        return str unless name

        row = db[:upstream_secrets].where(upstream_id: upstream_id, name: name).first
        return str unless row

        plaintext = Crypto::SecretBox.decrypt(row[:ciphertext].to_s, row[:nonce].to_s, master_key)
        str.sub("{{secret:#{name}}}", plaintext)
      end
      private_class_method :resolve_string

      def self.write(db, upstream_id, name, plaintext, master_key)
        envelope = Crypto::SecretBox.encrypt(plaintext, master_key)
        update = { ciphertext: Sequel[:excluded][:ciphertext], nonce: Sequel[:excluded][:nonce] }

        db[:upstream_secrets]
          .insert_conflict(target: %i[upstream_id name], update: update)
          .insert(
            upstream_id: upstream_id,
            name: name,
            ciphertext: Sequel.blob(envelope[:ciphertext]),
            nonce: Sequel.blob(envelope[:nonce])
          )
      end
    end
  end
end
