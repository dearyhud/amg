# frozen_string_literal: true

module AMG
  module JsonRpc
    JSONRPC_VERSION = "2.0"

    PARSE_ERROR = -32_700
    INVALID_REQUEST = -32_600
    METHOD_NOT_FOUND = -32_601
    INVALID_PARAMS = -32_602
    INTERNAL_ERROR = -32_603
    UNAUTHORIZED = -32_001

    InvalidRequest = Class.new(Error)

    Request = Data.define(:id, :method, :params) do
      def notification? = id.nil?
    end

    module_function

    def parse(payload)
      unless payload.is_a?(Hash) &&
             payload["jsonrpc"] == JSONRPC_VERSION &&
             payload["method"].is_a?(String)
        raise InvalidRequest, "not a JSON-RPC 2.0 request"
      end

      params = payload["params"]
      raise InvalidRequest, "params must be an object" if params && !params.is_a?(Hash)

      Request.new(id: payload["id"], method: payload["method"], params: params || {})
    end

    def result(rpc, payload)
      { jsonrpc: JSONRPC_VERSION, id: rpc.id, result: payload }
    end

    def error(id, code:, message:, data: nil)
      err = { code: code, message: message }
      err[:data] = data if data
      { jsonrpc: JSONRPC_VERSION, id: id, error: err }
    end

    def method_not_found(rpc)
      error(rpc.id, code: METHOD_NOT_FOUND, message: "method not found: #{rpc.method}")
    end

    def unauthorized(message, id: nil)
      error(id, code: UNAUTHORIZED, message: message)
    end

    # AMG verdicts ride inside MCP tool results so agents see them in-band
    # rather than as protocol failures.
    def tool_error(rpc, code:, message:, data: nil)
      result(rpc, tool_payload(code, message, data).merge(isError: true))
    end

    def tool_info(rpc, code:, message:, data: nil)
      result(rpc, tool_payload(code, message, data).merge(isError: false))
    end

    def tool_payload(code, message, data)
      body = { code: code, message: message }
      body[:data] = data if data
      { content: [{ type: "text", text: JSON.generate(body) }] }
    end
  end
end
