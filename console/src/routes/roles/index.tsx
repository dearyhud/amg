import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useRoles } from "@/api/queries/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/format";
import type { Enforcement } from "@/api/schemas";

export function EnforcementBadge({ enforcement }: { enforcement: Enforcement }) {
  return enforcement === "enforce" ? (
    <Badge variant="success">enforce</Badge>
  ) : (
    <Badge variant="warning">shadow</Badge>
  );
}

export function RolesPage() {
  const roles = useRoles();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Roles"
        description="Policy containers. A role is exactly what its YAML says — nothing else."
        actions={
          <Button asChild>
            <Link to="/roles/new">
              <Plus />
              New role
            </Link>
          </Button>
        }
      />

      {roles.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Enforcement</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.data?.map((role) => (
                <TableRow
                  key={role.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/roles/$roleId", params: { roleId: role.id } })}
                >
                  <TableCell className="font-mono">{role.name}</TableCell>
                  <TableCell>
                    <EnforcementBadge enforcement={role.enforcement} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    v{role.policy_version}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {role.agent_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelative(role.updated_at)}
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-muted-foreground">
                    {role.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
