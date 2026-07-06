require "openssl"

module AMG
  module Crypto
    # AES-256-GCM envelope for upstream secrets (ADR-0006). Each secret gets
    # its own random 12-byte nonce; the auth tag is appended to ciphertext.
    module SecretBox
      CIPHER = "aes-256-gcm".freeze
      NONCE_BYTES = 12

      def self.encrypt(plaintext, master_key)
        cipher = OpenSSL::Cipher.new(CIPHER)
        cipher.encrypt
        cipher.key = master_key
        nonce = cipher.random_iv
        ciphertext = cipher.update(plaintext) + cipher.final
        { ciphertext: ciphertext + cipher.auth_tag, nonce: nonce }
      end

      def self.decrypt(ciphertext, nonce, master_key)
        tag = ciphertext[-16..]
        body = ciphertext[0...-16]

        cipher = OpenSSL::Cipher.new(CIPHER)
        cipher.decrypt
        cipher.key = master_key
        cipher.iv = nonce
        cipher.auth_tag = tag
        cipher.update(body) + cipher.final
      rescue OpenSSL::Cipher::CipherError
        raise AMG::ConfigError, "amg: secret decryption failed (wrong AMG_MASTER_KEY or corrupted row)"
      end
    end
  end
end
