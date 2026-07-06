Sequel.migration do
  up do
    run <<~SQL
      CREATE OR REPLACE FUNCTION amg_create_audit_partition(month_start date)
      RETURNS void AS $$
      DECLARE
        part_name text := 'audit_events_' || to_char(month_start, 'YYYY_MM');
        month_end date := (month_start + interval '1 month')::date;
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_events FOR VALUES FROM (%L) TO (%L)',
          part_name, month_start, month_end
        );
      END;
      $$ LANGUAGE plpgsql;

      SELECT amg_create_audit_partition(date_trunc('month', now())::date);
      SELECT amg_create_audit_partition((date_trunc('month', now()) + interval '1 month')::date);
    SQL
  end

  down do
    run "DROP FUNCTION IF EXISTS amg_create_audit_partition(date);"
  end
end
