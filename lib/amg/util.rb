# frozen_string_literal: true

require "openssl"

module AMG
  module Util
    RATE = %r{\A(\d+)/(sec|s|min|m|hour|hr|h)\z}
    DURATION = /\A(\d+)(s|m|h)\z/
    PERIODS = { "sec" => 1, "s" => 1, "min" => 60, "m" => 60, "hour" => 3600, "hr" => 3600, "h" => 3600 }.freeze

    module_function

    def deep_symbolize(obj)
      case obj
      when Hash then obj.each_with_object({}) { |(k, v), h| h[k.to_sym] = deep_symbolize(v) }
      when Array then obj.map { |v| deep_symbolize(v) }
      else obj
      end
    end

    # "100/min" -> { limit: 100, period: 60 }
    def parse_rate(str)
      m = RATE.match(str.to_s) or
        raise PolicyError, "invalid rate #{str.inspect} (expected e.g. \"100/min\")"
      { limit: Integer(m[1], 10), period: PERIODS.fetch(m[2]) }
    end

    # "15m" -> 900 seconds; bare integers pass through as seconds
    def parse_duration(val)
      return val if val.is_a?(Integer)

      m = DURATION.match(val.to_s) or
        raise PolicyError, "invalid duration #{val.inspect} (expected e.g. \"15m\")"
      Integer(m[1], 10) * PERIODS.fetch(m[2])
    end

    def secure_compare(a, b)
      a = a.to_s
      b = b.to_s
      OpenSSL.fixed_length_secure_compare(
        OpenSSL::Digest::SHA256.digest(a),
        OpenSSL::Digest::SHA256.digest(b)
      ) && a.bytesize == b.bytesize
    end

    def to_time(val)
      case val
      when Time then val
      when String then Time.parse(val)
      when DateTime, Date then val.to_time
      end
    end
  end
end
