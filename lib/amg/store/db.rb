require "sequel"

module AMG
  module Store
    # Lazily-memoized Sequel connection, one per process.
    module DB
      def self.connect(database_url)
        @connect ||= Sequel.connect(database_url, logger: nil).tap { |db| db.extension(:pg_json) }
      end

      def self.migrations_dir
        File.join(__dir__, "migrations")
      end

      def self.migrate(database_url)
        db = connect(database_url)
        Sequel.extension(:migration)
        Sequel::Migrator.run(db, migrations_dir)
        db
      end

      # Ensures the current and next month's audit_events partitions exist.
      # Safe to call on every boot (system-design §3.3); idempotent via
      # CREATE TABLE IF NOT EXISTS inside the amg_create_audit_partition function.
      def self.ensure_audit_partitions(db)
        db.run("SELECT amg_create_audit_partition(date_trunc('month', now())::date)")
        db.run("SELECT amg_create_audit_partition((date_trunc('month', now()) + interval '1 month')::date)")
      end
    end
  end
end
