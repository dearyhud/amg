# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Policy::Compiler do
  subject(:compiler) { described_class.new }

  let(:yaml) { <<~YAML }
    role: notion_read
    enforcement: enforce
    servers:
      notion:
        tools:
          - name: get_pages
            constraints:
              workspace_id:
                in: ["ws_abc123"]
          - name: get_users
      stripe:
        tools:
          - name: get_payment_intents
            constraints:
              limit:
                lte: 100
    limits:
      rate: 100/min
    approvals:
      - match: "*delete*"
        require: human
        timeout: 15m
  YAML

  it "compiles the design-doc example" do
    doc = compiler.compile(yaml)
    expect(doc[:role]).to eq("notion_read")
    expect(doc[:enforcement]).to eq("enforce")
    expect(doc[:servers][:notion][:tools].map { |t| t[:name] })
      .to eq(%w[get_pages get_users])
    expect(doc[:servers][:stripe][:tools][0][:constraints]).to eq(limit: { lte: 100 })
    expect(doc[:limits]).to eq(rate: { limit: 100, period: 60 })
    expect(doc[:approvals]).to eq([{ match: "*delete*", require: "human", timeout: 900 }])
  end

  it "round-trips through the engine" do
    doc = compiler.compile(yaml)
    engine = AMG::Policy::Engine.new(doc)
    expect(engine.visible_tools).to include("notion__get_pages", "stripe__get_payment_intents")
    expect(engine.authorize(tool: "stripe__get_payment_intents",
                            arguments: { "limit" => 50 })).to be_allow
    expect(engine.authorize(tool: "stripe__get_payment_intents",
                            arguments: { "limit" => 500 }).verdict).to eq(:deny)
  end

  it "defaults enforcement to enforce and rejects unknown modes" do
    expect(compiler.compile("role: r\nservers: {s: {tools: [{name: t}]}}")[:enforcement])
      .to eq("enforce")
    expect { compiler.compile("role: r\nenforcement: log_only\nservers: {s: {tools: []}}") }
      .to raise_error(AMG::PolicyError, /enforcement/)
  end

  it "rejects unknown constraint operators" do
    bad = yaml.sub("lte: 100", "contains: 100")
    expect { compiler.compile(bad) }.to raise_error(AMG::PolicyError, /unknown constraint operator/)
  end

  it "rejects type-mismatched operands" do
    expect { compiler.compile(yaml.sub('in: ["ws_abc123"]', "in: ws_abc123")) }
      .to raise_error(AMG::PolicyError, /must be an array/)
    expect { compiler.compile(yaml.sub("lte: 100", 'lte: "100"')) }
      .to raise_error(AMG::PolicyError, /must be numeric/)
  end

  it "rejects invalid regexes at compile time" do
    bad = yaml.sub("lte: 100", 'matches: "(["')
    expect { compiler.compile(bad) }.to raise_error(AMG::PolicyError, /invalid regex/)
  end

  it "rejects bad role / server / tool names" do
    expect { compiler.compile("servers: {s: {tools: []}}") }
      .to raise_error(AMG::PolicyError, /role is required/)
    expect { compiler.compile("role: r\nservers: {\"bad server\": {tools: [{name: t}]}}") }
      .to raise_error(AMG::PolicyError, /invalid server name/)
    expect { compiler.compile("role: r\nservers: {s: {tools: [{name: \"T!\"}]}}") }
      .to raise_error(AMG::PolicyError, /invalid tool name/)
  end

  it "rejects bad rates, durations, and approval requirements" do
    expect { compiler.compile(yaml.sub("100/min", "lots")) }
      .to raise_error(AMG::PolicyError, /invalid rate/)
    expect { compiler.compile(yaml.sub("15m", "fortnight")) }
      .to raise_error(AMG::PolicyError, /invalid duration/)
    expect { compiler.compile(yaml.sub("require: human", "require: robot")) }
      .to raise_error(AMG::PolicyError, /require must be "human"/)
  end

  it "rejects non-mapping documents and YAML aliases" do
    expect { compiler.compile("- just\n- a\n- list") }
      .to raise_error(AMG::PolicyError, /mapping/)
    aliased = "role: &r notion\nenforcement: enforce\nservers: {s: {tools: [{name: *r}]}}"
    expect { compiler.compile(aliased) }.to raise_error(AMG::PolicyError)
  end

  context "with a registry" do
    subject(:compiler) do
      described_class.new(registry: Fakes::Registry.new(tools: [{ name: "notion__get_pages" }]))
    end

    it "accepts tools present upstream and rejects unknown ones at save time" do
      ok = "role: r\nservers: {notion: {tools: [{name: get_pages}]}}"
      expect { compiler.compile(ok) }.not_to raise_error

      bad = "role: r\nservers: {notion: {tools: [{name: get_pagez}]}}"
      expect { compiler.compile(bad) }
        .to raise_error(AMG::PolicyError, /unknown tool notion__get_pagez/)
    end
  end
end
