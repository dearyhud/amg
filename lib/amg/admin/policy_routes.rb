module AMG
  module Admin
    # Policy CRUD + simulate routes, mixed into Admin::Api. Split out to keep
    # Api itself from growing into a god-class as the policy surface grows
    # (see POLICIES_UX_PRD.md).
    module PolicyRoutes
      def policies_routes(r, admin)
        r.is do
          r.get { { "policies" => list_policies(admin) } }
          r.post { create_policy(r, admin) }
        end

        r.post("simulate") { simulate_draft(r) }

        r.on String do |id|
          r.is do
            r.get { show_policy(id) }
            r.patch { update_policy(r, admin, id) }
            r.delete { delete_policy(r, admin, id) }
          end

          r.post("simulate") { simulate_policy(r, id) }
        end
      end

      def delete_policy(r, admin, id)
        require_write!(r, admin)
        AMG.db[:policies].where(id: id).delete
        { "ok" => true }
      end

      def create_policy(r, admin)
        require_write!(r, admin)
        result = Contracts::PolicyCreate.new.call(r.params)
        return validation_error(result) if result.failure?

        policy = AMG.db[:policies].returning.insert(workspace_id: admin.workspace_id, name: result[:name]).first
        insert_rules(policy[:id], result[:rules])
        response.status = 201
        show_policy(policy[:id])
      end

      def update_policy(r, admin, id)
        require_write!(r, admin)
        result = Contracts::PolicyUpdate.new.call(r.params)
        return validation_error(result) if result.failure?

        changes = result.to_h.except(:rules)
        AMG.db[:policies].where(id: id).update(changes.merge(updated_at: Time.now)) unless changes.empty?
        if result.to_h.key?(:rules)
          AMG.db[:policy_rules].where(policy_id: id).delete
          insert_rules(id, result[:rules])
        end
        show_policy(id)
      end

      def insert_rules(policy_id, rules)
        Array(rules).each do |rule|
          AMG.db[:policy_rules].insert(
            policy_id: policy_id, upstream_id: rule[:upstream_id], target: rule[:target],
            constraints: Sequel.pg_jsonb(rule[:constraints] || []), strict_args: rule[:strict_args] || false
          )
        end
      end

      def show_policy(id)
        policy = AMG.db[:policies].where(id: id).first
        return json_error(404, "not_found") unless policy

        rules = AMG.db[:policy_rules].where(policy_id: id).all.map do |row|
          Store::Queries.row_to_rule(row).merge("upstream_id" => row[:upstream_id])
        end
        bound_agents = Store::Queries.agents_bound_to_policy(AMG.db, id)
        policy.merge("rules" => rules, "bound_agents" => bound_agents.length, "bound_agent_list" => bound_agents)
      end

      # Lighter than show_policy: counts only, no nested rule bodies, for the list view.
      def list_policies(admin)
        AMG.db[:policies].where(workspace_id: admin.workspace_id).all.map do |policy|
          policy.merge(
            "rule_count" => AMG.db[:policy_rules].where(policy_id: policy[:id]).count,
            "bound_agents" => AMG.db[:agent_policy_bindings].where(policy_id: policy[:id]).count
          )
        end
      end

      def simulate_policy(r, policy_id)
        result = Contracts::Simulate.new.call(r.params)
        return validation_error(result) if result.failure?

        upstream = AMG.db[:upstreams].where(id: result[:upstream_id]).first
        return json_error(404, "upstream_not_found") unless upstream

        rules = AMG.db[:policy_rules]
                   .where(policy_id: policy_id, upstream_id: result[:upstream_id])
                   .all.map { |row| Store::Queries.row_to_rule(row) }
        kind = upstream[:kind] == "rest" ? :rest : :mcp

        decision = Policy.decide(rules: rules, target: result[:target], args: result[:args] || {}, kind: kind,
                                 has_bound_policies: true)

        { "allowed" => decision.allowed?, "reason" => decision.reason&.to_s, "matched_rule" => decision.matched_rule }
      end

      def simulate_draft(r)
        result = Contracts::SimulateDraft.new.call(r.params)
        return validation_error(result) if result.failure?

        upstream = AMG.db[:upstreams].where(id: result[:upstream_id]).first
        return json_error(404, "upstream_not_found") unless upstream

        kind = upstream[:kind] == "rest" ? :rest : :mcp
        rules = result[:rules]
          .select { |rule| rule[:upstream_id] == result[:upstream_id] }
          .map { |rule| normalize_draft_rule(rule) }

        decision = Policy.decide(rules: rules, target: result[:target], args: result[:args] || {}, kind: kind,
                                 has_bound_policies: true)
        { "allowed" => decision.allowed?, "reason" => decision.reason&.to_s, "matched_rule" => decision.matched_rule }
      end

      def normalize_draft_rule(rule)
        {
          "target" => rule[:target],
          "constraints" => rule[:constraints] || [],
          "strict_args" => rule[:strict_args] || false
        }
      end
    end
  end
end
