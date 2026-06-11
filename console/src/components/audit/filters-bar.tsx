import { Link2, X } from "lucide-react";
import { toast } from "sonner";
import { useAgents } from "@/api/queries/agents";
import { useRoles } from "@/api/queries/roles";
import type { AuditFilters } from "@/api/queries/audit";
import { decisionSchema } from "@/api/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ANY = "__any__";

/*
 * Every control writes straight into URL search params — a filtered view
 * is a shareable link that drops into a Slack thread mid-incident.
 */
export function FiltersBar({
  filters,
  onChange,
}: {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
}) {
  const agents = useAgents();
  const roles = useRoles();
  const set = (patch: Partial<AuditFilters>) => onChange({ ...filters, ...patch });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Select
        value={filters.agent ?? ANY}
        onValueChange={(v) => set({ agent: v === ANY ? undefined : v })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any agent</SelectItem>
          {agents.data?.map((agent) => (
            <SelectItem key={agent.id} value={agent.name} className="font-mono">
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.role ?? ANY}
        onValueChange={(v) => set({ role: v === ANY ? undefined : v })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any role</SelectItem>
          {roles.data?.map((role) => (
            <SelectItem key={role.id} value={role.name} className="font-mono">
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.decision ?? ANY}
        onValueChange={(v) =>
          set({ decision: v === ANY ? undefined : decisionSchema.parse(v) })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Decision" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any decision</SelectItem>
          {decisionSchema.options.map((decision) => (
            <SelectItem key={decision} value={decision} className="font-mono">
              {decision}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.range ?? "24h"} onValueChange={(v) => set({ range: v as AuditFilters["range"] })}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["1h", "24h", "7d", "30d", "all"] as const).map((range) => (
            <SelectItem key={range} value={range}>
              {range === "all" ? "All time" : `Last ${range}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        placeholder="tool contains…"
        className="w-44 font-mono"
        value={filters.tool ?? ""}
        onChange={(e) => set({ tool: e.target.value || undefined })}
      />
      <Input
        placeholder="request id"
        className="w-36 font-mono"
        value={filters.request_id ?? ""}
        onChange={(e) => set({ request_id: e.target.value || undefined })}
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          <X />
          Clear
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={async () => {
          await navigator.clipboard.writeText(window.location.href);
          toast.success("Filtered view copied to clipboard");
        }}
      >
        <Link2 />
        Copy link
      </Button>
    </div>
  );
}
