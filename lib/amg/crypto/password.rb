require "argon2"

module AMG
  module Crypto
    # Argon2id password hashing (PHC string format), per SPEC §6 admins.password_hash.
    module Password
      def self.hash(plaintext)
        Argon2::Password.create(plaintext)
      end

      def self.verify?(plaintext, phc_hash)
        Argon2::Password.verify_password(plaintext, phc_hash)
      end
    end
  end
end
