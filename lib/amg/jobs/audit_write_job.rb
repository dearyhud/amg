# frozen_string_literal: true

require "sidekiq"

module AMG
  module Jobs
    class AuditWriteJob
      include Sidekiq::Job
      sidekiq_options queue: "amg_audit", retry: 5

      def perform(attrs_json)
        attrs = Util.deep_symbolize(JSON.parse(attrs_json))
        attrs[:created_at] = Time.parse(attrs[:created_at]) if attrs[:created_at].is_a?(String)
        AMG.db[:audit_events].insert(attrs)
      end
    end
  end
end
