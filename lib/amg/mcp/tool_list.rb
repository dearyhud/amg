# frozen_string_literal: true

module AMG
  module MCP
    # The visibility filter: agents only ever see tools their role permits,
    # plus AMG's native tools.
    class ToolList
      NATIVE_TOOLS = [
        { name: "amg__check_approval",
          description: "Check the status of a tool call parked for human approval. " \
                       "Returns the upstream result once approved.",
          inputSchema: { type: "object",
                         properties: { approval_id: { type: "string" } },
                         required: ["approval_id"] } }
      ].freeze

      def initialize(identity:, registry:)
        @identity = identity
        @registry = registry
      end

      def call(rpc)
        visible = Policy::Engine.new(@identity.policy).visible_tools.to_set
        tools = @registry.all_tools.select { |t| visible.include?(t[:name]) }
        JsonRpc.result(rpc, { tools: tools + NATIVE_TOOLS })
      end
    end
  end
end
