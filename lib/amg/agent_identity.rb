# frozen_string_literal: true

module AMG
  class AgentIdentity
    attr_reader :agent_id, :agent_name, :role_name, :policy, :policy_version, :enforcement

    def initialize(agent_id:, agent_name:, role_name:, policy:, policy_version:, enforcement:)
      @agent_id = agent_id
      @agent_name = agent_name
      @role_name = role_name
      @policy = normalize_policy(policy)
      @policy_version = policy_version
      @enforcement = enforcement
    end

    def shadow? = enforcement == "shadow"

    def to_json(*)
      JSON.generate(
        agent_id: agent_id, agent_name: agent_name, role_name: role_name,
        policy: policy, policy_version: policy_version, enforcement: enforcement
      )
    end

    def self.from_json(json)
      new(**Util.deep_symbolize(JSON.parse(json)))
    end

    private

    # policy arrives as JSONB (Hash) from Postgres, or a JSON string from
    # the Redis cache / non-pg adapters; either way it must come out as a
    # deep-symbolized Hash because that's what Policy::Engine consumes.
    def normalize_policy(policy)
      policy = JSON.parse(policy) if policy.is_a?(String)
      Util.deep_symbolize(policy.to_h)
    end
  end
end
