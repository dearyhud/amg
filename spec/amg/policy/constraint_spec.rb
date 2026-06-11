# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Policy::Constraint do
  def check(...) = described_class.check(...)

  it "eq compares exactly" do
    expect(check(:eq, "usd", "usd")).to be true
    expect(check(:eq, "USD", "usd")).to be false
    expect(check(:eq, nil, "usd")).to be false
  end

  it "in requires membership" do
    expect(check(:in, "ws_abc", %w[ws_abc ws_def])).to be true
    expect(check(:in, "ws_evil", %w[ws_abc])).to be false
  end

  it "lte/gte only pass for numerics on both sides" do
    expect(check(:lte, 99, 100)).to be true
    expect(check(:lte, 101, 100)).to be false
    expect(check(:lte, "99", 100)).to be false
    expect(check(:lte, 99, "100")).to be false
    expect(check(:gte, 5, 1)).to be true
    expect(check(:gte, 0, 1)).to be false
    expect(check(:gte, nil, 1)).to be false
  end

  it "matches anchors the regex" do
    expect(check(:matches, "ws_abc", "ws_[a-z]+")).to be true
    expect(check(:matches, "evil ws_abc", "ws_[a-z]+")).to be false
    expect(check(:matches, "ws_abc evil", "ws_[a-z]+")).to be false
    # \A...\z anchoring, not ^...$ — newline injection cannot sneak past
    expect(check(:matches, "ws_abc\nevil", "ws_.*")).to be false
    expect(check(:matches, 42, ".*")).to be false
  end

  it "matches fails closed on invalid patterns" do
    expect(check(:matches, "anything", "([")).to be false
  end

  it "absent passes only for nil" do
    expect(check(:absent, nil, true)).to be true
    expect(check(:absent, false, true)).to be false
    expect(check(:absent, "", true)).to be false
  end

  it "unknown operators never pass" do
    expect(check(:contains, "abc", "a")).to be false
    expect(check(:"; DROP TABLE", "x", "y")).to be false
  end

  it "survives fuzzing with arbitrary values without raising" do
    values = [nil, true, false, 0, -1, 1.5, "", "x", [], {}, ["x"], { "k" => "v" }, :sym]
    ops = described_class::OPERATORS + %i[bogus]
    ops.each do |op|
      values.each do |value|
        values.each do |expected|
          expect { check(op, value, expected) }.not_to raise_error
        end
      end
    end
  end
end
