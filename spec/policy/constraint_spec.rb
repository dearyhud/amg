require "spec_helper"

RSpec.describe AMG::Policy::Constraint do
  def c(path, operator, value = nil)
    h = { "path" => path, "op" => operator }
    h["value"] = value unless value.nil?
    h
  end

  describe "eq" do
    it { expect(described_class.match?(c("/repo", "eq", "x"), { "repo" => "x" })).to be true }
    it { expect(described_class.match?(c("/repo", "eq", "x"), { "repo" => "y" })).to be false }

    it "fails closed on type mismatch" do
      expect(described_class.match?(c("/n", "eq", 1), { "n" => "1" })).to be false
    end
  end

  describe "neq" do
    it { expect(described_class.match?(c("/repo", "neq", "x"), { "repo" => "y" })).to be true }
    it { expect(described_class.match?(c("/repo", "neq", "x"), { "repo" => "x" })).to be false }
  end

  describe "in" do
    it { expect(described_class.match?(c("/repo", "in", %w[a b]), { "repo" => "a" })).to be true }
    it { expect(described_class.match?(c("/repo", "in", %w[a b]), { "repo" => "c" })).to be false }

    it "fails closed when value is not an array" do
      expect(described_class.match?(c("/repo", "in", "a"), { "repo" => "a" })).to be false
    end
  end

  describe "not_in" do
    it { expect(described_class.match?(c("/repo", "not_in", %w[a b]), { "repo" => "c" })).to be true }
    it { expect(described_class.match?(c("/repo", "not_in", %w[a b]), { "repo" => "a" })).to be false }
  end

  describe "matches" do
    it "matches an RE2 pattern" do
      expect(described_class.match?(c("/repo", "matches", "^backpack/"), { "repo" => "backpack/api" })).to be true
    end

    it "does not match" do
      expect(described_class.match?(c("/repo", "matches", "^backpack/"), { "repo" => "other/api" })).to be false
    end

    it "fails closed on a non-string value" do
      expect(described_class.match?(c("/n", "matches", "^\\d+$"), { "n" => 123 })).to be false
    end

    it "fails closed on an invalid RE2 pattern instead of raising" do
      expect(described_class.match?(c("/repo", "matches", "(unterminated"), { "repo" => "x" })).to be false
    end
  end

  describe "numeric ops" do
    it "lt" do
      expect(described_class.match?(c("/amount", "lt", 100), { "amount" => 50 })).to be true
      expect(described_class.match?(c("/amount", "lt", 100), { "amount" => 100 })).to be false
    end

    it "lte" do
      expect(described_class.match?(c("/amount", "lte", 100), { "amount" => 100 })).to be true
      expect(described_class.match?(c("/amount", "lte", 100), { "amount" => 101 })).to be false
    end

    it "gt" do
      expect(described_class.match?(c("/amount", "gt", 100), { "amount" => 101 })).to be true
      expect(described_class.match?(c("/amount", "gt", 100), { "amount" => 100 })).to be false
    end

    it "gte" do
      expect(described_class.match?(c("/amount", "gte", 100), { "amount" => 100 })).to be true
      expect(described_class.match?(c("/amount", "gte", 100), { "amount" => 99 })).to be false
    end

    it "fails closed when value is not numeric" do
      expect(described_class.match?(c("/amount", "lt", 100), { "amount" => "50" })).to be false
    end

    it "fails closed when the constraint value is not numeric" do
      expect(described_class.match?(c("/amount", "lt", "100"), { "amount" => 50 })).to be false
    end
  end

  describe "prefix" do
    it { expect(described_class.match?(c("/repo", "prefix", "backpack/"), { "repo" => "backpack/api" })).to be true }
    it { expect(described_class.match?(c("/repo", "prefix", "backpack/"), { "repo" => "other/api" })).to be false }

    it "fails closed on a non-string value" do
      expect(described_class.match?(c("/repo", "prefix", "backpack/"), { "repo" => 1 })).to be false
    end
  end

  describe "exists" do
    it { expect(described_class.match?(c("/repo", "exists"), { "repo" => "x" })).to be true }
    it { expect(described_class.match?(c("/repo", "exists"), {})).to be false }
  end

  describe "absent" do
    it { expect(described_class.match?(c("/repo", "absent"), {})).to be true }
    it { expect(described_class.match?(c("/repo", "absent"), { "repo" => "x" })).to be false }
  end

  describe "missing path" do
    %w[eq neq in not_in matches lt lte gt gte prefix].each do |op|
      it "fails #{op} when the path is missing" do
        expect(described_class.match?(c("/missing", op, "x"), {})).to be false
      end
    end
  end

  it "returns false for an unknown op" do
    expect(described_class.match?(c("/repo", "bogus_op", "x"), { "repo" => "x" })).to be false
  end
end
