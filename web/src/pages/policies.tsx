import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import type { Policy } from "@/lib/types"

export function PoliciesPage() {
  const { admin } = useAuth()
  const readOnly = isReadOnly(admin)
  const navigate = useNavigate()
  const [search, setSearch] = useState("")

  const policiesQuery = useQuery({
    queryKey: ["policies"],
    queryFn: () => api<{ policies: Policy[] }>("/policies"),
  })

  const policies = (policiesQuery.data?.policies ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Policies</h1>
        {!readOnly && (
          <Button size="sm" asChild>
            <Link to="/policies/new">New policy</Link>
          </Button>
        )}
      </div>

      {policiesQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !policiesQuery.data || policiesQuery.data.policies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No policies yet. A policy is a named role — a set of tools/actions an agent is allowed to
          use, with optional argument constraints. Create one, bind it to any number of agents.
        </p>
      ) : (
        <>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies…"
            className="max-w-xs"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Bound agents</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/policies/$policyId", params: { policyId: p.id } })}
                >
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.rule_count ?? p.rules?.length ?? 0}</Badge>
                  </TableCell>
                  <TableCell>{p.bound_agents}</TableCell>
                  <TableCell>
                    <StatusDot status={p.status === "active" ? "healthy" : "degraded"} label={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {policies.length === 0 && (
            <p className="text-sm text-muted-foreground">No policies match "{search}".</p>
          )}
        </>
      )}
    </div>
  )
}
