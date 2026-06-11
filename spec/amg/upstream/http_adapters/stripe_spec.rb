# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Upstream::HttpAdapters::Stripe do
  subject(:adapter) { described_class.new }

  it "declares its tools as MCP definitions" do
    names = described_class.tools.map { |t| t[:name] }
    expect(names).to contain_exactly("get_payment_intents", "get_payment_intent", "get_customer")
  end

  it "lists payment intents with the brokered key" do
    stub = stub_request(:get, "https://api.stripe.com/v1/payment_intents")
           .with(query: { "limit" => "10" },
                 headers: { "Authorization" => "Bearer sk_test_brokered" })
           .to_return(status: 200, body: '{"data":[]}')

    result = adapter.call("get_payment_intents", { "limit" => 10 }, credential: "sk_test_brokered")
    expect(stub).to have_been_requested
    expect(result["content"].first["text"]).to eq('{"data":[]}')
    expect(result["isError"]).to be false
  end

  it "fetches a single payment intent with the id escaped" do
    stub_request(:get, "https://api.stripe.com/v1/payment_intents/pi_123")
      .to_return(status: 200, body: "{}")
    adapter.call("get_payment_intent", { "payment_intent_id" => "pi_123" }, credential: "sk")

    stub = stub_request(:get, "https://api.stripe.com/v1/payment_intents/pi_..%2Fcustomers")
           .to_return(status: 200, body: "{}")
    adapter.call("get_payment_intent", { "payment_intent_id" => "pi_../customers" }, credential: "sk")
    expect(stub).to have_been_requested
  end

  it "drops arguments that are not part of the tool's contract" do
    stub = stub_request(:get, "https://api.stripe.com/v1/payment_intents")
           .with(query: { "limit" => "5" })
           .to_return(status: 200, body: "{}")
    adapter.call("get_payment_intents", { "limit" => 5, "expand" => "everything" }, credential: "sk")
    expect(stub).to have_been_requested
  end

  it "raises UpstreamError on HTTP errors and unknown tools" do
    stub_request(:get, "https://api.stripe.com/v1/customers/cus_1")
      .to_return(status: 401, body: "{}")
    expect { adapter.call("get_customer", { "customer_id" => "cus_1" }, credential: "bad") }
      .to raise_error(AMG::UpstreamError, /401/)

    expect { adapter.call("delete_customer", { "customer_id" => "cus_1" }, credential: "sk") }
      .to raise_error(AMG::UpstreamError, /unknown stripe tool/)
  end

  it "maps timeouts to UpstreamTimeout" do
    stub_request(:get, "https://api.stripe.com/v1/payment_intents").to_timeout
    expect { adapter.call("get_payment_intents", {}, credential: "sk") }
      .to raise_error(AMG::UpstreamTimeout)
  end
end
