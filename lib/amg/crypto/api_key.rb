require "securerandom"
require "digest"

module AMG
  module Crypto
    # Agent bearer keys: amg_ak_<32B base62>, SHA-256 stored (ADR-0005).
    module ApiKey
      PREFIX = "amg_ak_".freeze
      RAW_BYTES = 32
      ALPHABET = ("0".."9").to_a + ("a".."z").to_a + ("A".."Z").to_a

      def self.generate
        random = SecureRandom.random_bytes(RAW_BYTES)
        body = base62(random)
        plaintext = "#{PREFIX}#{body}"
        { plaintext: plaintext, hash: hash_for(plaintext), prefix: plaintext[0, 12] }
      end

      def self.hash_for(plaintext)
        Digest::SHA256.digest(plaintext)
      end

      def self.base62(bytes)
        n = bytes.bytes.reduce(0) { |acc, b| (acc << 8) | b }
        return ALPHABET[0] if n.zero?

        digits = []
        while n.positive?
          digits << ALPHABET[n % 62]
          n /= 62
        end
        digits.reverse.join
      end
      private_class_method :base62
    end
  end
end
