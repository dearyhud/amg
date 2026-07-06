require "spec_helper"
require "rack/test"
require_relative "../../lib/amg/server/app"

RSpec.describe AMG::Server::App do
  include Rack::Test::Methods

  def app
    described_class.app
  end

  before do
    AMG.db = AMG::Store::DB.connect(AMG::Spec::Database.url)
    AMG.logger = Logger.new(File::NULL)
  end

  it "returns 200 ok when the database is reachable" do
    get "/healthz"

    expect(last_response.status).to eq(200)
    expect(JSON.parse(last_response.body)).to eq("status" => "ok")
  end

  it "returns 503 unavailable when the database is unreachable" do
    allow(AMG.db).to receive(:test_connection).and_raise(Sequel::DatabaseConnectionError)

    get "/healthz"

    expect(last_response.status).to eq(503)
    expect(JSON.parse(last_response.body)).to eq("status" => "unavailable")
  end
end
