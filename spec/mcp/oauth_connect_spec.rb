require "spec_helper"
require "net/http"
require "uri"
require_relative "../../lib/amg/server/app"
require_relative "../fixtures/fixture_oauth_mcp_server"
require_relative "../support/live_server"

# Exercises AMG::Mcp::OAuthConnector against a real (fixture) OAuth
# authorization server + protected MCP HTTP resource: dynamic client
# registration, PKCE, the redirect/callback bridge across two separate HTTP
# requests, token exchange, encrypted storage, and finally a real
# tools/list call authenticated with the token AMG obtained.
RSpec.describe "MCP OAuth connect flow" do
  let(:db) { AMG::Spec::Database.connect }
  let(:workspace_id) { AMG::Store::Bootstrap.ensure_workspace(db) }

  let!(:fixture) { AMG::Spec::FixtureOAuthMcpServer.start }
  let!(:live_server) { AMG::Spec::LiveServer.start(AMG::Server::App.app) }
  let!(:previous_config) { AMG.config }

  before do
    AMG.config = AMG::Config.new(
      "AMG_DATABASE_URL" => AMG::Spec::Database.url,
      "AMG_MASTER_KEY" => Base64.strict_encode64(AMG::Spec::TEST_MASTER_KEY),
      "AMG_PUBLIC_URL" => live_server.base_url
    )
  end

  after do
    fixture.stop
    live_server.stop
    AMG.config = previous_config
  end

  def http_request(method, url, body: nil, headers: {})
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    request = method.new(uri)
    headers.each { |k, v| request[k] = v }
    if body
      request["Content-Type"] = "application/json"
      request.body = body.to_json
    end
    http.request(request)
  end

  def cookie_header(response)
    Array(response.get_fields("set-cookie")).map { |c| c.split(";").first }.join("; ")
  end

  it "completes a full authorization-code handshake and can then call the upstream" do
    db[:admins].returning(:id).insert(
      workspace_id: workspace_id, email: "owner@example.com",
      password_hash: AMG::Crypto::Password.hash("hunter2hunter2"), role: "owner"
    ).first[:id]

    login = http_request(Net::HTTP::Post, "#{live_server.base_url}/api/v1/auth/login",
                         body: { email: "owner@example.com", password: "hunter2hunter2" })
    expect(login.code).to eq("200")
    cookies = cookie_header(login)
    csrf = cookies[/amg_csrf=([^;]+)/, 1]

    create = http_request(Net::HTTP::Post, "#{live_server.base_url}/api/v1/upstreams",
                          body: { slug: "fixture-oauth", display_name: "Fixture OAuth", kind: "mcp_http",
                                  config: { "url" => "#{fixture.base_url}/mcp" } },
                          headers: { "Cookie" => cookies, "X-AMG-CSRF" => csrf })
    expect(create.code).to eq("201")
    upstream_id = JSON.parse(create.body)["id"]

    connect = http_request(Net::HTTP::Post, "#{live_server.base_url}/api/v1/upstreams/#{upstream_id}/oauth/connect",
                           headers: { "Cookie" => cookies, "X-AMG-CSRF" => csrf })
    expect(connect.code).to eq("200")
    authorization_url = JSON.parse(connect.body)["authorization_url"]
    expect(authorization_url).to start_with("#{fixture.base_url}/authorize")

    # Stands in for "the admin logs into the third party and clicks Allow":
    # the fixture's /authorize auto-approves and 302s straight back to AMG's
    # own callback endpoint.
    authorize_response = http_request(Net::HTTP::Get, authorization_url)
    expect(authorize_response.code).to eq("302")
    callback_url = authorize_response["Location"]
    expect(callback_url).to start_with("#{live_server.base_url}/api/v1/upstreams/#{upstream_id}/oauth/callback")

    callback_response = http_request(Net::HTTP::Get, callback_url)
    expect(callback_response.code).to eq("200")
    expect(callback_response.body).to include("Connected")

    # The callback response returns as soon as it has unblocked the
    # connector's background thread — the actual code-for-token exchange
    # (another HTTP round trip, this time to /token) finishes asynchronously
    # a moment later. Poll rather than assert immediately.
    wait_for_tokens(upstream_id)

    upstream = AMG::Store::Queries.upstream_by_id(db, upstream_id)
    tools = AMG.upstream_manager.tools(upstream)
    expect(tools.map(&:name)).to eq(["whoami"])
  end

  def wait_for_tokens(upstream_id, timeout: 2)
    storage = AMG::Store::OAuthStorage.new(db: db, upstream_id: upstream_id, master_key: AMG::Spec::TEST_MASTER_KEY)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
    loop do
      return if storage.tokens
      if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
        raise "timed out waiting for OAuth tokens to be persisted"
      end

      sleep 0.01
    end
  end

  it "rejects a callback with an unknown state" do
    response = http_request(Net::HTTP::Get,
                            "#{live_server.base_url}/api/v1/upstreams/anything/oauth/callback?code=x&state=bogus")
    expect(response.code).to eq("200")
    expect(response.body).to include("invalid or has expired")
  end
end
