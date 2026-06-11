# frozen_string_literal: true

require "faraday"
require "cgi"

module AMG
  module Upstream
    module HttpAdapters
      # Reference HTTP adapter: a hand-written, read-only slice of the
      # Stripe API exposed as MCP-shaped tools.
      class Stripe
        BASE_URL = "https://api.stripe.com"

        TOOLS = [
          { name: "get_payment_intents",
            description: "List Stripe payment intents",
            inputSchema: { type: "object",
                           properties: { limit: { type: "integer" },
                                         customer: { type: "string" } } } },
          { name: "get_payment_intent",
            description: "Fetch a single Stripe payment intent by id",
            inputSchema: { type: "object",
                           properties: { payment_intent_id: { type: "string" } },
                           required: ["payment_intent_id"] } },
          { name: "get_customer",
            description: "Fetch a Stripe customer by id",
            inputSchema: { type: "object",
                           properties: { customer_id: { type: "string" } },
                           required: ["customer_id"] } }
        ].freeze

        def self.tools = TOOLS

        def initialize(http: nil)
          @conn = http || Faraday.new(url: BASE_URL) do |f|
            f.options.timeout = 30
            f.options.open_timeout = 5
          end
        end

        def call(tool_name, arguments, credential:)
          path, params = route(tool_name, arguments || {})
          resp = @conn.get(path, params) do |req|
            req.headers["Authorization"] = "Bearer #{credential}"
          end
          raise UpstreamError, "stripe returned HTTP #{resp.status}" if resp.status >= 400

          { "content" => [{ "type" => "text", "text" => resp.body.to_s }], "isError" => false }
        rescue Faraday::TimeoutError
          raise UpstreamTimeout, "stripe timed out"
        rescue Faraday::ConnectionFailed => e
          raise UpstreamTimeout, "stripe timed out" if e.wrapped_exception.is_a?(Timeout::Error)

          raise UpstreamError, "stripe connection failed: #{e.message}"
        end

        private

        def route(tool_name, args)
          args = args.transform_keys(&:to_s)
          case tool_name
          when "get_payment_intents"
            ["/v1/payment_intents", args.slice("limit", "customer")]
          when "get_payment_intent"
            ["/v1/payment_intents/#{CGI.escape(args.fetch('payment_intent_id'))}", {}]
          when "get_customer"
            ["/v1/customers/#{CGI.escape(args.fetch('customer_id'))}", {}]
          else
            raise UpstreamError, "unknown stripe tool: #{tool_name}" # fail closed
          end
        end
      end
    end
  end
end
