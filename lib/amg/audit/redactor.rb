module AMG
  module Audit
    # Redacts sensitive values before persisting args_redacted (SPEC §12).
    module Redactor
      DEFAULT_KEYS = %w[password token secret authorization api-key api_key apikey ssn account-number
                        account_number].freeze
      MAX_STRING = 512
      MAX_TOTAL_BYTES = 16 * 1024

      def self.redact(value, extra_keys: [])
        keys = (DEFAULT_KEYS + extra_keys.map(&:downcase)).freeze
        redacted = walk(value, keys)
        json = redacted.to_json
        return redacted if json.bytesize <= MAX_TOTAL_BYTES

        { "_truncated" => true }
      end

      def self.walk(value, keys)
        case value
        when Hash
          value.each_with_object({}) do |(k, v), out|
            out[k] = sensitive_key?(k, keys) ? "[redacted]" : walk(v, keys)
          end
        when Array
          value.map { |v| walk(v, keys) }
        when String
          truncate(value)
        else
          value
        end
      end
      private_class_method :walk

      def self.sensitive_key?(key, keys)
        keys.include?(key.to_s.downcase)
      end
      private_class_method :sensitive_key?

      def self.truncate(str)
        return str if str.bytesize <= MAX_STRING

        "#{str.byteslice(0, MAX_STRING)}…"
      end
      private_class_method :truncate
    end
  end
end
