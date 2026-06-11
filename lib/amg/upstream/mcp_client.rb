# frozen_string_literal: true

require "faraday"

module AMG
  module Upstream
    # Minimal MCP client over streamable HTTP: JSON-RPC POSTs, lazy
    # initialize handshake, Mcp-Session-Id tracking, JSON or SSE responses.
    class McpClient
      PROTOCOL_VERSION = "2025-06-18"

      def initialize(endpoint:, credential: nil, timeout: 30, http: nil)
        @conn = http || Faraday.new(url: endpoint) do |f|
          f.options.timeout = timeout
          f.options.open_timeout = 5
        end
        @credential = credential
        @session_id = nil
        @initialized = false
        @id = 0
        @mutex = Mutex.new
      end

      def list_tools
        ensure_initialized
        Array(request("tools/list", {})["tools"])
      end

      def call_tool(name, arguments)
        ensure_initialized
        request("tools/call", { "name" => name, "arguments" => arguments || {} })
      end

      private

      def ensure_initialized
        @mutex.synchronize do
          next if @initialized

          request("initialize", {
                    "protocolVersion" => PROTOCOL_VERSION,
                    "capabilities" => {},
                    "clientInfo" => { "name" => "amg", "version" => AMG::VERSION }
                  })
          @initialized = true
          post_body({ jsonrpc: "2.0", method: "notifications/initialized" })
        end
      end

      def request(method, params)
        id = (@id += 1)
        resp = post_body({ jsonrpc: "2.0", id: id, method: method, params: params })
        message = parse_response(resp, id)
        if (err = message["error"])
          raise UpstreamError, "upstream #{method} failed: #{err['code']} #{err['message']}"
        end

        message["result"] || {}
      end

      def post_body(body)
        resp = @conn.post(nil) do |req|
          req.headers["Content-Type"] = "application/json"
          req.headers["Accept"] = "application/json, text/event-stream"
          req.headers["MCP-Protocol-Version"] = PROTOCOL_VERSION
          req.headers["Authorization"] = "Bearer #{@credential}" if @credential
          req.headers["Mcp-Session-Id"] = @session_id if @session_id
          req.body = JSON.generate(body)
        end
        @session_id = resp.headers["mcp-session-id"] if resp.headers["mcp-session-id"]
        raise UpstreamError, "upstream returned HTTP #{resp.status}" if resp.status >= 400

        resp
      rescue Faraday::TimeoutError
        raise UpstreamTimeout, "upstream timed out"
      rescue Faraday::ConnectionFailed => e
        raise UpstreamTimeout, "upstream timed out" if e.wrapped_exception.is_a?(Timeout::Error)

        raise UpstreamError, "upstream connection failed: #{e.message}"
      end

      def parse_response(resp, id)
        if resp.headers["content-type"].to_s.include?("text/event-stream")
          parse_sse(resp.body, id)
        else
          JSON.parse(resp.body.to_s)
        end
      rescue JSON::ParserError
        raise UpstreamError, "upstream returned unparseable response"
      end

      def parse_sse(body, id)
        body.to_s.split(/\n\n/).each do |event|
          data = event.lines.grep(/\Adata:/).map { |l| l.sub(/\Adata:\s?/, "").chomp }.join("\n")
          next if data.empty?

          message = JSON.parse(data)
          return message if message["id"] == id && (message.key?("result") || message.key?("error"))
        end
        raise UpstreamError, "no response for request #{id} in SSE stream"
      end
    end
  end
end
