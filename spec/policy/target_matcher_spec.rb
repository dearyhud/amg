require "spec_helper"

RSpec.describe AMG::Policy::TargetMatcher do
  describe "kind: :mcp" do
    it "matches an exact tool name" do
      expect(described_class.match?("create_issue", "create_issue", kind: :mcp)).to be true
    end

    it "does not match a different tool name" do
      expect(described_class.match?("create_issue", "get_issue", kind: :mcp)).to be false
    end

    it "matches any tool via *" do
      expect(described_class.match?("*", "anything", kind: :mcp)).to be true
    end
  end

  describe "kind: :rest" do
    it "matches an exact method and path" do
      expect(described_class.match?("POST /book", "POST /book", kind: :rest)).to be true
    end

    it "does not match a different method" do
      expect(described_class.match?("POST /book", "GET /book", kind: :rest)).to be false
    end

    it "matches any method via *" do
      expect(described_class.match?("* /book", "DELETE /book", kind: :rest)).to be true
    end

    it "matches a single path segment via *" do
      expect(described_class.match?("GET /accounts/*", "GET /accounts/123", kind: :rest)).to be true
    end

    it "does not let * cross a segment boundary" do
      expect(described_class.match?("GET /accounts/*", "GET /accounts/123/transactions", kind: :rest)).to be false
    end

    it "matches any suffix via **" do
      expect(described_class.match?("GET /accounts/**", "GET /accounts/123/transactions", kind: :rest)).to be true
      expect(described_class.match?("GET /accounts/**", "GET /accounts", kind: :rest)).to be false
    end

    it "does not match a shorter request path" do
      expect(described_class.match?("GET /accounts/*/transactions", "GET /accounts/123", kind: :rest)).to be false
    end

    it "returns false when either target cannot be split into method+path" do
      expect(described_class.match?("malformed", "GET /book", kind: :rest)).to be false
      expect(described_class.match?("GET /book", "malformed", kind: :rest)).to be false
    end
  end

  it "returns false for an unknown kind" do
    expect(described_class.match?("x", "x", kind: :bogus)).to be false
  end
end
