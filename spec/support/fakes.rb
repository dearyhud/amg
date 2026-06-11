# frozen_string_literal: true

module Fakes
  # Stands in for Upstream::Registry on the data plane.
  class Registry
    attr_reader :tools

    def initialize(tools: [])
      @tools = tools
    end

    def all_tools = @tools

    def tool_exists?(server, tool_name)
      @tools.any? { |t| t[:name] == AMG::Tool.join(server, tool_name) }
    end
  end

  # Stands in for Upstream::Router; records every forward.
  class Router
    Call = Struct.new(:tool, :arguments)

    attr_reader :calls
    attr_accessor :result, :error

    def initialize(result: { "content" => [{ "type" => "text", "text" => "ok" }] })
      @calls = []
      @result = result
      @error = nil
    end

    def forward(tool:, arguments:)
      @calls << Call.new(tool, arguments)
      raise @error if @error

      @result
    end
  end

  class Notifier
    attr_reader :notifications

    def initialize = @notifications = []

    def call(**kwargs) = @notifications << kwargs
  end
end
