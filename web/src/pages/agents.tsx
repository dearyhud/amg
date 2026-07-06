import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import type { Agent } from "@/lib/types"

export function AgentsPage() {
  const { admin } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ agents: Agent[] }>("/agents"),
  })

  const agents = (data?.agents ?? []).filter(
    (a) =>
      a.slug.toLowerCase().includes(search.toLowerCase()) ||
      a.display_name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Agents</h1>
        {!isReadOnly(admin) && (
          <Button size="sm" asChild>
            <Link to="/agents/new">New agent</Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents yet. Create one to issue its first API key.</p>
      ) : (
        <>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="max-w-xs"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })}
                >
                  <TableCell className="font-mono text-sm">{agent.slug}</TableCell>
                  <TableCell>{agent.display_name}</TableCell>
                  <TableCell>
                    <StatusDot status={agent.status === "active" ? "healthy" : "degraded"} label={agent.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents match "{search}".</p>}
        </>
      )}
    </div>
  )
}
