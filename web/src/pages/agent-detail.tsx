import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Copy, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { IntegrationGuide } from "@/components/integration-guide"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import type { Agent, AgentKey, AgentKeySummary, EffectivePermissions, Policy, Upstream } from "@/lib/types"

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "never"
}

export function AgentDetailPage() {
  const { agentId } = useParams({ strict: false }) as { agentId: string }
  const { admin } = useAuth()
  const readOnly = isReadOnly(admin)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [newKey, setNewKey] = useState<AgentKey | null>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [policyToBind, setPolicyToBind] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const agentQuery = useQuery({
    queryKey: ["agents", agentId],
    queryFn: () => api<Agent>(`/agents/${agentId}`),
  })

  const permissionsQuery = useQuery({
    queryKey: ["agents", agentId, "permissions"],
    queryFn: () => api<EffectivePermissions>(`/agents/${agentId}/permissions`),
  })

  const policiesQuery = useQuery({
    queryKey: ["policies"],
    queryFn: () => api<{ policies: Policy[] }>("/policies"),
  })

  const upstreamsQuery = useQuery({
    queryKey: ["upstreams"],
    queryFn: () => api<{ upstreams: Upstream[] }>("/upstreams"),
  })

  const keysQuery = useQuery({
    queryKey: ["agents", agentId, "keys"],
    queryFn: () => api<{ keys: AgentKeySummary[] }>(`/agents/${agentId}/keys`),
  })

  const hydratedFor = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!agentQuery.data || hydratedFor.current === agentId) return
    setDisplayName(agentQuery.data.display_name)
    hydratedFor.current = agentId
  }, [agentId, agentQuery.data])

  useEffect(() => {
    setNewKey(null)
    setLastKey(null)
    setPolicyToBind("")
  }, [agentId])

  const createKey = useMutation({
    mutationFn: () => api<AgentKey>(`/agents/${agentId}/keys`, { method: "POST", body: {} }),
    onSuccess: (key) => {
      setNewKey(key)
      setLastKey(key.key ?? null)
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "keys"] })
    },
  })

  const revokeKey = useMutation({
    mutationFn: (keyId: string) => api(`/keys/${keyId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "keys"] }),
  })

  const bindPolicy = useMutation({
    mutationFn: () => api(`/agents/${agentId}/policies/${policyToBind}`, { method: "PUT" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "permissions"] })
      setPolicyToBind("")
    },
  })

  const renameAgent = useMutation({
    mutationFn: () => api<Agent>(`/agents/${agentId}`, { method: "PATCH", body: { display_name: displayName } }),
    onSuccess: (updated) => queryClient.setQueryData(["agents", agentId], updated),
  })

  const toggleStatus = useMutation({
    mutationFn: () =>
      api<Agent>(`/agents/${agentId}`, {
        method: "PATCH",
        body: { status: agentQuery.data?.status === "active" ? "disabled" : "active" },
      }),
    onSuccess: (updated) => queryClient.setQueryData(["agents", agentId], updated),
  })

  const deleteAgent = useMutation({
    mutationFn: () => api(`/agents/${agentId}`, { method: "DELETE" }),
    onSuccess: () => void navigate({ to: "/agents" }),
  })

  if (agentQuery.isLoading) return <Skeleton className="h-40 w-full" />
  const agent = agentQuery.data
  if (!agent) return <p className="text-sm text-muted-foreground">Agent not found.</p>

  const upstreamById = new Map((upstreamsQuery.data?.upstreams ?? []).map((u) => [u.id, u]))
  const grantedUpstreamIds = [...new Set((permissionsQuery.data?.rules ?? []).map((r) => r.upstream_id))]
  const grantedUpstreams = grantedUpstreamIds.map((id) => upstreamById.get(id)).filter((u): u is Upstream => !!u)
  const keys = keysQuery.data?.keys ?? []
  const liveKeyCount = keys.filter((k) => !k.revoked_at).length
  const boundPolicyCount = permissionsQuery.data?.rules.length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-1.5">
          <p className="font-mono text-sm text-muted-foreground">{agent.slug}</p>
          <Label>Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => !readOnly && displayName && displayName !== agent.display_name && renameAgent.mutate()}
            disabled={readOnly}
            className="max-w-sm text-base font-medium"
          />
        </div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate()}>
              <StatusDot status={agent.status === "active" ? "healthy" : "degraded"} label={agent.status} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (liveKeyCount > 0 || boundPolicyCount > 0) {
                  setConfirmDeleteOpen(true)
                } else {
                  deleteAgent.mutate()
                }
              }}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => deleteAgent.mutate()}
        confirmText={agent.slug}
        pending={deleteAgent.isPending}
        description={`This agent has ${liveKeyCount} live key(s) and ${boundPolicyCount} granted rule(s). Deleting it revokes access immediately.`}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">API keys</CardTitle>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => createKey.mutate()} disabled={createKey.isPending}>
              Create key
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {keysQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet. Create one to authenticate this agent.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-mono">{k.prefix}…</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      created {formatDate(k.created_at)} · last used {formatDate(k.last_used_at)}
                    </span>
                  </div>
                  {k.revoked_at ? (
                    <span className="text-xs text-muted-foreground">revoked {formatDate(k.revoked_at)}</span>
                  ) : (
                    !readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => revokeKey.mutate(k.id)}>
                        Revoke
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Effective permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Select value={policyToBind} onValueChange={setPolicyToBind}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Bind a policy…" />
                </SelectTrigger>
                <SelectContent>
                  {policiesQuery.data?.policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!policyToBind || bindPolicy.isPending} onClick={() => bindPolicy.mutate()}>
                Bind
              </Button>
            </div>
          )}

          {permissionsQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !permissionsQuery.data || permissionsQuery.data.rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bound policies. This agent&apos;s tools/list will be empty until a policy is bound.
            </p>
          ) : (
            <ul className="divide-y divide-border font-mono text-sm">
              {permissionsQuery.data.rules.map((rule) => (
                <li key={rule.id} className="py-2">
                  {rule.target}
                  {rule.constraints.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {rule.constraints.length} constraint(s)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Connect this agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add AMG as an MCP server to Claude, Claude Code, or a LangChain agent using this agent's key.{" "}
            {lastKey
              ? "Using the key you created this session."
              : 'Showing a placeholder — click "Create key" above to fill in a real one.'}
          </p>
          <IntegrationGuide upstreams={grantedUpstreams} apiKey={lastKey ?? "<YOUR_AGENT_API_KEY>"} />
        </CardContent>
      </Card>

      <Dialog open={!!newKey} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Key created</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy this key now — it will never be shown again.
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2 font-mono text-sm">
            <span className="flex-1 truncate">{newKey?.key}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                if (newKey?.key) void navigator.clipboard.writeText(newKey.key)
                setCopied(true)
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
