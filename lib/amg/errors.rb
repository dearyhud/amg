# frozen_string_literal: true

module AMG
  Error = Class.new(StandardError)

  # token missing / invalid / revoked / expired, or agent suspended
  AuthError = Class.new(Error)

  # policy compile-time rejection (admin plane); never raised on the data plane
  PolicyError = Class.new(Error)

  ApprovalError = Class.new(Error)

  UpstreamError = Class.new(Error)
  UpstreamTimeout = Class.new(UpstreamError)
  UnknownUpstream = Class.new(UpstreamError)

  SecretNotFound = Class.new(Error)

  class RateLimited < Error
    attr_reader :retry_after_ms

    def initialize(message, retry_after_ms:)
      super(message)
      @retry_after_ms = retry_after_ms
    end
  end
end
