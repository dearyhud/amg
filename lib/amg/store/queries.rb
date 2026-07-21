require "json"
require_relative "../crypto/api_key"

module AMG
  module Store
    # Read-path queries backing enforcement. Deliberately thin: shapes rows
    # into the plain-Hash form AMG::Policy.decide expects, but does no
    # decision-making itself (that stays in the pure policy library).
    module Queries
      AgentKey = Struct.new(:agent_id, :workspace_id, :api_key_id, keyword_init: true)

      # Looks up the active agent + non-revoked key for a raw bearer key.
      # Returns nil on any mismatch (unknown key, revoked, disabled agent) —
      # callers must treat nil as SPEC §9.4 `invalid_key`.
      def self.agent_for_key(db, raw_key)
        return nil unless raw_key&.start_with?(Crypto::ApiKey::PREFIX)

        row = active_key_row(db, raw_key)
        return nil unless row

        db[:agent_api_keys].where(id: row[:api_key_id]).update(last_used_at: Time.now)
        AgentKey.new(**row)
      end

      def self.active_key_row(db, raw_key)
        hash = Crypto::ApiKey.hash_for(raw_key)
        db[:agent_api_keys]
          .join(:agents, id: :agent_id)
          .where(Sequel[:agent_api_keys][:key_hash] => Sequel.blob(hash))
          .where(Sequel[:agent_api_keys][:revoked_at] => nil)
          .where(Sequel[:agents][:status] => "active")
          .select(
            Sequel[:agents][:id].as(:agent_id),
            Sequel[:agents][:workspace_id],
            Sequel[:agent_api_keys][:id].as(:api_key_id)
          )
          .first
      end
      private_class_method :active_key_row

      def self.default_workspace_id(db)
        db[:workspaces].get(:id)
      end

      def self.has_bound_policies?(db, agent_id)
        db[:agent_policy_bindings]
          .join(:policies, id: :policy_id)
          .where(Sequel[:agent_policy_bindings][:agent_id] => agent_id)
          .where(Sequel[:policies][:status] => "active")
          .any?
      end

      def self.upstream_by_slug(db, workspace_id, slug)
        row = db[:upstreams].where(workspace_id: workspace_id, slug: slug, status: "active").first
        return nil unless row

        row.merge(config: parse_json(row[:config]))
      end

      def self.upstream_by_id(db, id)
        row = db[:upstreams].where(id: id).first
        return nil unless row

        row.merge(config: parse_json(row[:config]))
      end

      def self.with_oauth_connected(db, row)
        return row unless row[:kind] == "mcp_http"

        connected = db[:upstream_oauth_state].where(upstream_id: row[:id]).exclude(tokens_ciphertext: nil).any?
        row.merge(oauth_connected: connected)
      end

      # Agent display names and their bound active policy names, keyed by
      # agent id — used to annotate audit events with "agent" / "role"
      # without joining (and thus row-multiplying) the audit query itself.
      def self.agent_identities(db, agent_ids)
        return {} if agent_ids.empty?

        names = db[:agents].where(id: agent_ids).select_hash(:id, :display_name)
        policies = db[:agent_policy_bindings]
          .join(:policies, id: :policy_id)
          .where(Sequel[:agent_policy_bindings][:agent_id] => agent_ids)
          .where(Sequel[:policies][:status] => "active")
          .select(Sequel[:agent_policy_bindings][:agent_id], Sequel[:policies][:name])
          .all
          .group_by { |row| row[:agent_id] }
          .transform_values { |rows| rows.map { |row| row[:name] } }

        names.each_with_object({}) do |(id, display_name), out|
          out[id] = { display_name: display_name, policies: policies[id] || [] }
        end
      end

      # Upstream slugs, keyed by upstream id — used to annotate audit events
      # with the upstream name without joining the audit query itself.
      def self.upstream_slugs(db, upstream_ids)
        return {} if upstream_ids.empty?

        db[:upstreams].where(id: upstream_ids).select_hash(:id, :slug)
      end

      def self.agents_bound_to_policy(db, policy_id)
        db[:agents]
          .join(:agent_policy_bindings, agent_id: :id)
          .where(Sequel[:agent_policy_bindings][:policy_id] => policy_id)
          .select(Sequel[:agents][:id], Sequel[:agents][:slug], Sequel[:agents][:display_name])
          .all
      end

      # Never selects key_hash — only enough to identify and manage a key, never reconstruct it.
      def self.keys_for_agent(db, agent_id)
        db[:agent_api_keys]
          .where(agent_id: agent_id)
          .select(:id, :prefix, :last_used_at, :revoked_at, :created_at)
          .order(Sequel.desc(:created_at))
          .all
      end

      # Rules across all of the agent's bound active policies, scoped to one
      # upstream (SPEC §8.1 steps 1-2's upstream half; target matching and
      # constraint evaluation happen inside AMG::Policy.decide).
      def self.rules_for_agent_upstream(db, agent_id, upstream_id)
        bound_rules(db, agent_id)
          .where(Sequel[:policy_rules][:upstream_id] => upstream_id)
          .select_all(:policy_rules)
          .map { |row| row_to_rule(row) }
      end

      # All rules across the agent's bound active policies, across every
      # upstream — the computed effective-permissions view (SPEC §11,
      # GET /agents/{id}/permissions). Each rule carries its owning policy's
      # id/name so callers can group the flat rule list back into roles.
      def self.rules_for_agent(db, agent_id)
        bound_rules(db, agent_id)
          .select_all(:policy_rules)
          .select_append(
            Sequel[:policies][:id].as(:policy_id),
            Sequel[:policies][:name].as(:policy_name)
          )
          .map do |row|
            row_to_rule(row).merge(
              "upstream_id" => row[:upstream_id],
              "policy_id" => row[:policy_id],
              "policy_name" => row[:policy_name]
            )
          end
      end

      def self.bound_rules(db, agent_id)
        db[:policy_rules]
          .join(:policies, id: :policy_id)
          .join(:agent_policy_bindings, policy_id: Sequel[:policies][:id])
          .where(Sequel[:agent_policy_bindings][:agent_id] => agent_id)
          .where(Sequel[:policies][:status] => "active")
      end
      private_class_method :bound_rules

      def self.row_to_rule(row)
        {
          "id" => row[:id],
          "target" => row[:target],
          "constraints" => parse_json(row[:constraints]),
          "strict_args" => row[:strict_args],
          "created_at" => row[:created_at]
        }
      end

      # Sequel's pg_json extension wraps top-level JSONB values in
      # Sequel::Postgres::JSONBHash/JSONBArray Delegator objects — not real
      # Hash/Array instances — so callers doing `value.is_a?(Hash)` (e.g.
      # AMG::Store::Secrets, AMG::Policy) would silently treat them as
      # opaque. Unwrap to plain Hash/Array here, once, at the query boundary.
      def self.parse_json(value)
        case value
        when String then JSON.parse(value)
        when Sequel::Postgres::JSONBHash, Sequel::Postgres::JSONHash then value.to_hash
        when Sequel::Postgres::JSONBArray, Sequel::Postgres::JSONArray then value.to_a
        else value
        end
      end
      private_class_method :parse_json
    end
  end
end
