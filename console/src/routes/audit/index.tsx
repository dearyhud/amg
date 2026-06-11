import { useNavigate, useSearch } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { FiltersBar } from "@/components/audit/filters-bar";
import { AuditTable } from "@/components/audit/audit-table";

export function AuditPage() {
  const filters = useSearch({ from: "/audit" });
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Audit"
        description="Every decision the gateway has made. The audit log is the product."
      />
      <FiltersBar
        filters={filters}
        onChange={(next) => void navigate({ to: "/audit", search: next, replace: true })}
      />
      <AuditTable filters={filters} />
    </>
  );
}
