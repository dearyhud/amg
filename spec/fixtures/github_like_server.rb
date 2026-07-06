#!/usr/bin/env ruby
# frozen_string_literal: true

# Fixture stdio MCP upstream for tests: a tiny "github-like" server exposing
# three tools, mirroring SPEC §8.3's worked example.
require "mcp"
require "mcp/server/transports/stdio_transport"

create_issue = MCP::Tool.define(name: "create_issue",
                                description: "Create an issue") do |owner:, repo:, title: nil, server_context: nil|
  MCP::Tool::Response.new([{ type: "text", text: "created:#{owner}/#{repo}:#{title}" }])
end

get_issue = MCP::Tool.define(name: "get_issue",
                             description: "Get an issue") do |owner: nil, repo: nil, number: nil, server_context: nil|
  MCP::Tool::Response.new([{ type: "text", text: "issue:#{owner}/#{repo}##{number}" }])
end

delete_repository = MCP::Tool.define(name: "delete_repository",
                                     description: "Delete a repository") do |owner:, repo:, server_context: nil|
  MCP::Tool::Response.new([{ type: "text", text: "deleted:#{owner}/#{repo}" }])
end

server = MCP::Server.new(name: "fixture-github", tools: [create_issue, get_issue, delete_repository])
MCP::Server::Transports::StdioTransport.new(server).open
