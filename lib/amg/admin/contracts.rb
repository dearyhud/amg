require "dry/validation"

module AMG
  module Admin
    # dry-validation contracts at the admin API boundary (SPEC §11).
    module Contracts
      class Login < Dry::Validation::Contract
        params do
          required(:email).filled(:string)
          required(:password).filled(:string)
        end
      end

      class AgentCreate < Dry::Validation::Contract
        params do
          required(:slug).filled(:string)
          required(:display_name).filled(:string)
        end
      end

      class AgentUpdate < Dry::Validation::Contract
        params do
          optional(:display_name).filled(:string)
          optional(:status).filled(:string)
        end
        rule(:status) do
          key.failure("must be active or disabled") if key? && !%w[active disabled].include?(value)
        end
      end

      class UpstreamCreate < Dry::Validation::Contract
        params do
          required(:slug).filled(:string)
          required(:display_name).filled(:string)
          required(:kind).filled(:string)
          required(:config).filled(:hash)
          optional(:secrets).hash
        end
        rule(:kind) do
          key.failure("must be one of mcp_stdio, mcp_http, rest") unless %w[mcp_stdio mcp_http rest].include?(value)
        end
      end

      class UpstreamUpdate < Dry::Validation::Contract
        params do
          optional(:display_name).filled(:string)
          optional(:config).hash
          optional(:secrets).hash
          optional(:status).filled(:string)
        end
        rule(:status) do
          key.failure("must be active or disabled") if key? && !%w[active disabled].include?(value)
        end
      end

      class PolicyCreate < Dry::Validation::Contract
        params do
          required(:name).filled(:string)
          optional(:rules).array(:hash) do
            required(:upstream_id).filled(:string)
            required(:target).filled(:string)
            optional(:constraints).array(:hash)
            optional(:strict_args).filled(:bool)
          end
        end
      end

      class PolicyUpdate < Dry::Validation::Contract
        params do
          optional(:name).filled(:string)
          optional(:status).filled(:string)
          optional(:rules).array(:hash) do
            required(:upstream_id).filled(:string)
            required(:target).filled(:string)
            optional(:constraints).array(:hash)
            optional(:strict_args).filled(:bool)
          end
        end
        rule(:status) do
          key.failure("must be active or disabled") if key? && !%w[active disabled].include?(value)
        end
      end

      class Simulate < Dry::Validation::Contract
        params do
          required(:upstream_id).filled(:string)
          required(:target).filled(:string)
          optional(:args).hash
        end
      end

      # Simulates against rules passed directly in the request, not a
      # persisted policy — lets the console show live allow/deny feedback
      # against in-progress edits before the admin saves anything.
      class SimulateDraft < Dry::Validation::Contract
        params do
          required(:upstream_id).filled(:string)
          required(:target).filled(:string)
          optional(:args).hash
          required(:rules).array(:hash) do
            required(:target).filled(:string)
            optional(:constraints).array(:hash)
            optional(:strict_args).filled(:bool)
          end
        end
      end
    end
  end
end
