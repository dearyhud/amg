require "spec_helper"

RSpec.describe AMG::Policy::JsonPointer do
  let(:missing) { AMG::Policy::JsonPointer::MISSING }

  it "resolves a top-level key" do
    expect(described_class.resolve({ "repo" => "backpack/api" }, "/repo")).to eq("backpack/api")
  end

  it "resolves a nested key" do
    doc = { "body" => { "amount" => 100 } }
    expect(described_class.resolve(doc, "/body/amount")).to eq(100)
  end

  it "resolves an array index" do
    doc = { "path" => %w[accounts 123] }
    expect(described_class.resolve(doc, "/path/1")).to eq("123")
  end

  it "returns MISSING for an absent top-level key" do
    expect(described_class.resolve({ "repo" => "x" }, "/owner")).to eq(missing)
  end

  it "returns MISSING for an absent nested key" do
    expect(described_class.resolve({ "body" => {} }, "/body/amount")).to eq(missing)
  end

  it "returns MISSING for an out-of-range array index" do
    expect(described_class.resolve({ "path" => ["a"] }, "/path/5")).to eq(missing)
  end

  it "returns MISSING for a negative array index" do
    expect(described_class.resolve({ "path" => ["a"] }, "/path/-1")).to eq(missing)
  end

  it "returns MISSING for a non-integer array index" do
    expect(described_class.resolve({ "path" => ["a"] }, "/path/first")).to eq(missing)
  end

  it "returns MISSING when indexing into a scalar" do
    expect(described_class.resolve({ "repo" => "x" }, "/repo/nested")).to eq(missing)
  end

  it "returns MISSING for a pointer without a leading slash" do
    expect(described_class.resolve({ "repo" => "x" }, "repo")).to eq(missing)
  end

  it "returns MISSING for a non-string pointer" do
    expect(described_class.resolve({ "repo" => "x" }, nil)).to eq(missing)
  end

  it "resolves the whole-document pointer" do
    expect(described_class.resolve({ "a" => 1 }, "")).to eq({ "a" => 1 })
  end

  it "unescapes ~1 as / and ~0 as ~" do
    doc = { "a/b" => 1, "c~d" => 2 }
    expect(described_class.resolve(doc, "/a~1b")).to eq(1)
    expect(described_class.resolve(doc, "/c~0d")).to eq(2)
  end
end
