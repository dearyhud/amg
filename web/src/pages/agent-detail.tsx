import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { ChevronRight, Copy, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/panel"
import { IntegrationGuide } from "@/components/integration-guide"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { cn } from "@/lib/utils"
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
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [confirmCreateKeyOpen, setConfirmCreateKeyOpen] = useState(false)
  const [keyToRevoke, setKeyToRevoke] = useState<AgentKeySummary | null>(null)
  const [roleToUnbind, setRoleToUnbind] = useState<{ policyId: string; policyName: string } | null>(null)

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
      setConfirmCreateKeyOpen(false)
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "keys"] })
    },
  })

  const revokeKey = useMutation({
    mutationFn: (keyId: string) => api(`/keys/${keyId}`, { method: "DELETE" }),
    onSuccess: () => {
      setKeyToRevoke(null)
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "keys"] })
    },
  })

  const bindPolicy = useMutation({
    mutationFn: () => api(`/agents/${agentId}/policies/${policyToBind}`, { method: "PUT" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "permissions"] })
      setPolicyToBind("")
    },
  })

  const unbindPolicy = useMutation({
    mutationFn: (policyId: string) => api(`/agents/${agentId}/policies/${policyId}`, { method: "DELETE" }),
    onSuccess: () => {
      setRoleToUnbind(null)
      void queryClient.invalidateQueries({ queryKey: ["agents", agentId, "permissions"] })
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

  const roles = new Map<string, { policyName: string; rules: NonNullable<typeof permissionsQuery.data>["rules"] }>()
  for (const rule of permissionsQuery.data?.rules ?? []) {
    if (!roles.has(rule.policy_id)) roles.set(rule.policy_id, { policyName: rule.policy_name, rules: [] })
    roles.get(rule.policy_id)!.rules.push(rule)
  }
  const boundPolicyCount = roles.size

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-6">
        <div className="flex-1 space-y-1.5">
          <p className="font-mono text-sm text-muted-foreground">{agent.slug}</p>
          <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => !readOnly && displayName && displayName !== agent.display_name && renameAgent.mutate()}
            disabled={readOnly}
            className="max-w-sm rounded-none text-base font-medium"
          />
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleStatus.mutate()}
              className="gap-1.5 rounded-none font-mono text-xs tracking-widest uppercase"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  agent.status === "active" ? "bg-status-emerald" : "bg-status-red",
                )}
                aria-hidden
              />
              {agent.status}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-none font-mono text-xs tracking-widest text-destructive uppercase hover:text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
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
        description={`This agent has ${liveKeyCount} live key(s) and ${boundPolicyCount} bound role(s). Deleting it revokes access immediately.`}
      />

      <ConfirmActionDialog
        open={confirmCreateKeyOpen}
        onOpenChange={setConfirmCreateKeyOpen}
        onConfirm={() => createKey.mutate()}
        title="Create key"
        description="Issue a new API key for this agent? The previous keys, if any, stay valid until revoked."
        confirmLabel="Create key"
        pending={createKey.isPending}
      />

      <ConfirmActionDialog
        open={!!keyToRevoke}
        onOpenChange={(open) => !open && setKeyToRevoke(null)}
        onConfirm={() => keyToRevoke && revokeKey.mutate(keyToRevoke.id)}
        title="Revoke key"
        description={`Revoke key ${keyToRevoke?.prefix ?? ""}…? Any agent still using it will immediately lose access.`}
        confirmLabel="Revoke"
        destructive
        pending={revokeKey.isPending}
      />

      <ConfirmActionDialog
        open={!!roleToUnbind}
        onOpenChange={(open) => !open && setRoleToUnbind(null)}
        onConfirm={() => roleToUnbind && unbindPolicy.mutate(roleToUnbind.policyId)}
        title="Unbind role"
        description={`Unbind ${roleToUnbind?.policyName ?? ""} from this agent? It will lose the access this role grants immediately.`}
        confirmLabel="Unbind"
        destructive
        pending={unbindPolicy.isPending}
      />

      <Panel
        title="API keys"
        action={
          !readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmCreateKeyOpen(true)}
              disabled={createKey.isPending}
              className="rounded-none font-mono text-xs tracking-widest uppercase"
            >
              Create key
            </Button>
          )
        }
      >
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setKeyToRevoke(k)}
                      className="rounded-none font-mono text-xs tracking-widest uppercase hover:text-destructive"
                    >
                      Revoke
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Roles">
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Select value={policyToBind} onValueChange={setPolicyToBind}>
              <SelectTrigger className="w-64 rounded-none">
                <SelectValue placeholder="Bind a role…" />
              </SelectTrigger>
              <SelectContent>
                {policiesQuery.data?.policies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!policyToBind || bindPolicy.isPending}
              onClick={() => bindPolicy.mutate()}
              className="rounded-none bg-foreground font-mono text-xs tracking-widest text-background uppercase hover:bg-foreground/80"
            >
              Bind
            </Button>
          </div>
        )}

        {permissionsQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : roles.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bound roles. This agent&apos;s tools/list will be empty until a role is bound.
          </p>
        ) : (
          <div className="border border-border">
            {[...roles.entries()].map(([policyId, role]) => {
              const isExpanded = expandedRoleId === policyId
              const upstreamNames = [...new Set(role.rules.map((r) => upstreamById.get(r.upstream_id)?.slug ?? "?"))]
              return (
                <div key={policyId} className="border-b border-border last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedRoleId(isExpanded ? null : policyId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setExpandedRoleId(isExpanded ? null : policyId)
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-sm">
                      <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                      <span className="font-medium">
                        ({role.policyName} · {upstreamNames.join(", ")} · {role.rules.length} rule
                        {role.rules.length === 1 ? "" : "s"})
                      </span>
                    </span>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRoleToUnbind({ policyId, policyName: role.policyName })
                        }}
                        className="rounded-none font-mono text-xs tracking-widest uppercase hover:text-destructive"
                      >
                        Unbind
                      </Button>
                    )}
                  </div>
                  {isExpanded && (
                    <ul className="divide-y divide-border border-t border-border bg-muted/20 font-mono text-sm">
                      {role.rules.map((rule) => (
                        <li key={rule.id} className="px-3 py-2 pl-8">
                          <span className="text-muted-foreground">
                            {upstreamById.get(rule.upstream_id)?.slug ?? "?"}.
                          </span>
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
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel title="Connect this agent">
        <p className="text-xs text-muted-foreground">
          Add AMG as an MCP server to Claude, Claude Code, or a LangChain agent using this agent's key.{" "}
          {lastKey
            ? "Using the key you created this session."
            : 'Showing a placeholder — click "Create key" above to fill in a real one.'}
        </p>
        <IntegrationGuide upstreams={grantedUpstreams} apiKey={lastKey ?? "<YOUR_AGENT_API_KEY>"} />
      </Panel>

      <Dialog open={!!newKey} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm tracking-widest uppercase">Key created</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy this key now — it will never be shown again.
          </p>
          <div className="flex items-center gap-2 border border-border bg-muted p-2 font-mono text-sm">
            <span className="flex-1 truncate">{newKey?.key}</span>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-none"
              onClick={() => {
                if (newKey?.key) void navigator.clipboard.writeText(newKey.key)
                setCopied(true)
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button
              className="rounded-none bg-foreground font-mono text-xs tracking-widest text-background uppercase hover:bg-foreground/80"
              onClick={() => setNewKey(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
