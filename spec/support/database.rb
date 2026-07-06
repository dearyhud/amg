require_relative "../../lib/amg/store/db"

module AMG
  module Spec
    module Database
      def self.url
        ENV.fetch("AMG_TEST_DATABASE_URL", "postgres://postgres:amg@127.0.0.1:55432/amg_test")
      end

      def self.setup
        AMG::Store::DB.migrate(url)
        AMG::Store::DB.ensure_audit_partitions(connect)
      end

      def self.connect
        AMG::Store::DB.connect(url)
      end

      def self.truncate_all
        db = AMG::Store::DB.connect(url)
        tables = db.tables.reject { |t| t == :schema_info }
        return if tables.empty?

        db.run("TRUNCATE TABLE #{tables.join(", ")} CASCADE")
      end
    end
  end
end

RSpec.configure do |config|
  config.before(:suite) { AMG::Spec::Database.setup }
  config.after { AMG::Spec::Database.truncate_all }
end
