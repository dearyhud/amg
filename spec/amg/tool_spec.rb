# frozen_string_literal: true

require "spec_helper"

RSpec.describe AMG::Tool do
  describe ".valid?" do
    it "accepts namespaced lowercase names" do
      expect(described_class.valid?("notion__get_pages")).to be true
      expect(described_class.valid?("stripe__get_payment_intents")).to be true
      expect(described_class.valid?("my_server__tool_2")).to be true
    end

    it "rejects path traversal and namespace confusion" do
      expect(described_class.valid?("notion__../stripe__x")).to be false
      expect(described_class.valid?("notion__get pages")).to be false
      expect(described_class.valid?("Notion__get_pages")).to be false
      expect(described_class.valid?("notion__")).to be false
      expect(described_class.valid?("__get_pages")).to be false
      expect(described_class.valid?("get_pages")).to be false
      expect(described_class.valid?(nil)).to be false
      expect(described_class.valid?(42)).to be false
    end
  end

  describe ".split" do
    it "splits on the first double underscore" do
      expect(described_class.split("notion__get_pages")).to eq(%w[notion get_pages])
      expect(described_class.split("my_server__some__tool")).to eq(%w[my_server some__tool])
    end

    it "raises on malformed names" do
      expect { described_class.split("nope") }.to raise_error(AMG::Error, /malformed/)
    end
  end
end
