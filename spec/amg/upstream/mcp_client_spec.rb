# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Upstream::McpClient do
  subject(:client) { described_class.new(endpoint: endpoint, credential: "notion-secret") }

  let(:endpoint) { "https://mcp.example.com/mcp" }

  def stub_rpc(result_for:)
    stub_request(:post, endpoint).to_return do |request|
      body = JSON.parse(request.body)
      next { status: 202, body: "" } unless body["id"] # notification

      result = result_for.fetch(body["method"])
      { status: 200,
        headers: { "Content-Type" => "application/json", "Mcp-Session-Id" => "sess-1" },
        body: JSON.generate(jsonrpc: "2.0", id: body["id"], result: result) }
    end
  end

  it "handshakes lazily, then calls tools with the brokered credential and session" do
    stub = stub_rpc(result_for: {
                      "initialize" => { "protocolVersion" => "2025-06-18" },
                      "tools/call" => { "content" => [{ "type" => "text", "text" => "hi" }] }
                    })

    result = client.call_tool("get_pages", { "workspace_id" => "ws_1" })
    expect(result["content"].first["text"]).to eq("hi")

    expect(stub).to have_been_requested.times(3) # initialize, initialized, tools/call
    expect(WebMock).to(have_requested(:post, endpoint)
      .with(headers: { "Authorization" => "Bearer notion-secret" }).times(3))
    expect(WebMock).to(have_requested(:post, endpoint)
      .with(headers: { "Mcp-Session-Id" => "sess-1" },
            body: hash_including("method" => "tools/call")))
  end

  it "lists tools" do
    stub_rpc(result_for: {
               "initialize" => {},
               "tools/list" => { "tools" => [{ "name" => "get_pages" }] }
             })
    expect(client.list_tools).to eq([{ "name" => "get_pages" }])
  end

  it "parses SSE responses" do
    stub_request(:post, endpoint).to_return do |request|
      body = JSON.parse(request.body)
      next { status: 202, body: "" } unless body["id"]

      sse = "event: message\ndata: #{JSON.generate(jsonrpc: '2.0', id: body['id'],
                                                   result: { 'ok' => true })}\n\n"
      { status: 200, headers: { "Content-Type" => "text/event-stream" }, body: sse }
    end

    expect(client.call_tool("t", {})).to eq("ok" => true)
  end

  it "raises UpstreamError for JSON-RPC errors and HTTP failures" do
    stub_request(:post, endpoint).to_return(
      status: 200, headers: { "Content-Type" => "application/json" },
      body: JSON.generate(jsonrpc: "2.0", id: 1,
                          error: { "code" => -32_000, "message" => "nope" })
    )
    expect { client.list_tools }.to raise_error(AMG::UpstreamError, /nope/)

    stub_request(:post, endpoint).to_return(status: 502, body: "bad gateway")
    expect { described_class.new(endpoint: endpoint).list_tools }
      .to raise_error(AMG::UpstreamError, /502/)
  end

  it "maps timeouts to UpstreamTimeout" do
    stub_request(:post, endpoint).to_timeout
    expect { client.list_tools }.to raise_error(AMG::UpstreamTimeout)
  end
end
