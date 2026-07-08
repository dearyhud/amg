import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { ArrowLeft, Trash2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { PolicyRuleEditor } from "@/components/policy-rule-editor"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import { toolsQueryKey } from "@/lib/tools"
import type { Agent, Policy, PolicyRule, SimulateResult, Tool, Upstream } from "@/lib/types"

interface TestResult {
  ok: boolean
  tools?: Tool[]
  error?: string
}

function exampleArgs(tool: Tool | undefined): string {
  const props = tool?.input_schema?.properties
  if (!props || typeof props !== "object") return "{}"
  const example: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(props as Record<string, { type?: string }>)) {
    switch (schema?.type) {
      case "number":
      case "integer":
        example[key] = 0
        break
      case "boolean":
        example[key] = false
        break
      case "array":
        example[key] = []
        break
      case "object":
        example[key] = {}
        break
      default:
        example[key] = ""
    }
  }
  return JSON.stringify(example, null, 2)
}

export function PolicyBuilderPage() {
  const { policyId } = useParams({ strict: false }) as { policyId?: string }
  const isNew = !policyId
  const { admin } = useAuth()
  const readOnly = isReadOnly(admin)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [name, setName] = useState("")
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [toolsByUpstream, setToolsByUpstream] = useState<Record<string, Tool[]>>({})
  const [agentToBind, setAgentToBind] = useState("")
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [tryItOpen, setTryItOpen] = useState(false)

  const [simUpstreamId, setSimUpstreamId] = useState("")
  const [simTarget, setSimTarget] = useState("")
  const [simArgs, setSimArgs] = useState("{}")
  const [simResult, setSimResult] = useState<SimulateResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const hydratedFor = useRef<string | undefined>(undefined)

  const policyQuery = useQuery({
    queryKey: ["policies", policyId],
    queryFn: () => api<Policy>(`/policies/${policyId}`),
    enabled: !isNew,
  })
  const upstreamsQuery = useQuery({
    queryKey: ["upstreams"],
    queryFn: () => api<{ upstreams: Upstream[] }>("/upstreams"),
  })
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ agents: Agent[] }>("/agents"),
    enabled: !isNew,
  })

  useEffect(() => {
    if (isNew || !policyQuery.data || hydratedFor.current === policyId) return
    setName(policyQuery.data.name)
    setRules(policyQuery.data.rules ?? [])
    hydratedFor.current = policyId
  }, [isNew, policyId, policyQuery.data])

  useEffect(() => {
    setSimUpstreamId("")
    setSimTarget("")
    setSimArgs("{}")
    setSimResult(null)
    setSimError(null)
    setAgentToBind("")
  }, [policyId])

  async function ensureTools(upstreamId: string) {
    if (!upstreamId || toolsByUpstream[upstreamId]) return
    const upstream = upstreamsQuery.data?.upstreams.find((u) => u.id === upstreamId)
    if (!upstream || upstream.kind === "rest") return
    const result = await api<TestResult>(`/upstreams/${upstreamId}/test`, { method: "POST" })
    if (result.tools) {
      setToolsByUpstream((prev) => ({ ...prev, [upstreamId]: result.tools! }))
      queryClient.setQueryData(toolsQueryKey(upstreamId), result.tools)
    }
  }

  useEffect(() => {
    rules.forEach((rule) => {
      if (rule.upstream_id) void ensureTools(rule.upstream_id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, upstreamsQuery.data])

  const createPolicy = useMutation({
    mutationFn: () => api<Policy>("/policies", { method: "POST", body: { name, rules } }),
    onSuccess: (policy) => {
      void queryClient.invalidateQueries({ queryKey: ["policies"] })
      void navigate({ to: "/policies/$policyId", params: { policyId: policy.id } })
    },
  })

  const saveRules = useMutation({
    mutationFn: (nextRules: PolicyRule[]) => api<Policy>(`/policies/${policyId}`, { method: "PATCH", body: { rules: nextRules } }),
    onMutate: () => setSaveStatus("saving"),
    onSuccess: (policy) => {
      queryClient.setQueryData(["policies", policyId], policy)
      void queryClient.invalidateQueries({ queryKey: ["policies"] })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500)
    },
  })

  const saveName = useMutation({
    mutationFn: () => api<Policy>(`/policies/${policyId}`, { method: "PATCH", body: { name } }),
    onSuccess: (policy) => {
      queryClient.setQueryData(["policies", policyId], policy)
      void queryClient.invalidateQueries({ queryKey: ["policies"] })
    },
  })

  const toggleStatus = useMutation({
    mutationFn: () =>
      api<Policy>(`/policies/${policyId}`, {
        method: "PATCH",
        body: { status: policyQuery.data?.status === "active" ? "disabled" : "active" },
      }),
    onSuccess: (policy) => queryClient.setQueryData(["policies", policyId], policy),
  })

  const deletePolicy = useMutation({
    mutationFn: () => api(`/policies/${policyId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["policies"] })
      void navigate({ to: "/policies" })
    },
  })

  const bindAgent = useMutation({
    mutationFn: () => api(`/agents/${agentToBind}/policies/${policyId}`, { method: "PUT" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["policies", policyId] })
      setAgentToBind("")
    },
  })

  const unbindAgent = useMutation({
    mutationFn: (agentId: string) => api(`/agents/${agentId}/policies/${policyId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["policies", policyId] }),
  })

  function handleRulesChange(next: PolicyRule[]) {
    setRules(next)
    if (!isNew) {
      window.clearTimeout(rulesDebounce.current)
      rulesDebounce.current = window.setTimeout(() => saveRules.mutate(next), 700)
    }
  }
  const rulesDebounce = useRef<number | undefined>(undefined)

  const simulate = useMutation({
    mutationFn: () =>
      api<SimulateResult>("/policies/simulate", {
        method: "POST",
        body: { upstream_id: simUpstreamId, target: simTarget, args: JSON.parse(simArgs || "{}"), rules },
      }),
    onSuccess: (r) => {
      setSimResult(r)
      setSimError(null)
    },
    onError: () => setSimError("Invalid arguments JSON, or the request failed."),
  })

  const simTools = toolsByUpstream[simUpstreamId] ?? []
  const simUpstream = upstreamsQuery.data?.upstreams.find((u) => u.id === simUpstreamId)
  const simTool = simTools.find((t) => t.name === simTarget)

  if (!isNew && policyQuery.isLoading) return <Skeleton className="h-40 w-full" />
  if (!isNew && !policyQuery.data) return <p className="text-sm text-muted-foreground">Policy not found.</p>

  const policy = policyQuery.data
  const unboundAgents = (agentsQuery.data?.agents ?? []).filter(
    (a) => !policy?.bound_agent_list?.some((b) => b.id === a.id),
  )

  return (
    <div className="space-y-6">
      <Link to="/policies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to policies
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !isNew && name && name !== policy?.name && saveName.mutate()}
            placeholder="support-triage"
            disabled={readOnly}
            className="max-w-sm text-base font-medium"
          />
        </div>
        {!isNew && policy && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : " "}
            </span>
            {!readOnly && (
              <>
                <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate()}>
                  <StatusDot status={policy.status === "active" ? "healthy" : "degraded"} label={policy.status} />
                </Button>
                <Dialog open={tryItOpen} onOpenChange={setTryItOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Zap className="mr-1.5 size-3.5" />
                      Simulate
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Simulate</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Tests against the rules above as they currently stand in this editor — no need to save
                        first.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          value={simUpstreamId}
                          onValueChange={(v) => {
                            setSimUpstreamId(v)
                            setSimTarget("")
                            void ensureTools(v)
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Upstream" />
                          </SelectTrigger>
                          <SelectContent>
                            {upstreamsQuery.data?.upstreams.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.slug}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <Input
                            placeholder="target"
                            value={simTarget}
                            onChange={(e) => setSimTarget(e.target.value)}
                            className="font-mono text-sm"
                            list={simTools.length > 0 ? "sim-targets" : undefined}
                          />
                          {simTools.length > 0 && (
                            <datalist id="sim-targets">
                              {simTools.map((t) => (
                                <option key={t.name} value={t.name} />
                              ))}
                            </datalist>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label>Arguments (JSON)</Label>
                          {simUpstream && simUpstream.kind !== "rest" && (
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline"
                              onClick={() => setSimArgs(exampleArgs(simTool))}
                            >
                              Fill example
                            </button>
                          )}
                        </div>
                        <textarea
                          className="h-24 w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs"
                          value={simArgs}
                          onChange={(e) => setSimArgs(e.target.value)}
                        />
                      </div>
                      {simError && (
                        <Alert variant="destructive">
                          <AlertDescription>{simError}</AlertDescription>
                        </Alert>
                      )}
                      {simResult && (
                        <Alert variant={simResult.allowed ? "default" : "destructive"}>
                          <AlertDescription>
                            {simResult.allowed ? "Allowed" : `Denied — ${simResult.reason}`}
                          </AlertDescription>
                        </Alert>
                      )}
                      <Button
                        disabled={!simUpstreamId || !simTarget || simulate.isPending}
                        onClick={() => simulate.mutate()}
                      >
                        Run
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (policy.bound_agents > 0) {
                      setConfirmDeleteOpen(true)
                    } else {
                      deletePolicy.mutate()
                    }
                  }}
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!isNew && policy && (
        <ConfirmDeleteDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          onConfirm={() => deletePolicy.mutate()}
          confirmText={policy.name}
          pending={deletePolicy.isPending}
          description={`This policy is bound to ${policy.bound_agents} agent(s). Deleting it revokes their access to these rules immediately.`}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PolicyRuleEditor
            rules={rules}
            upstreams={upstreamsQuery.data?.upstreams ?? []}
            onChange={handleRulesChange}
            toolsByUpstream={toolsByUpstream}
            onUpstreamUsed={(id) => void ensureTools(id)}
            readOnly={readOnly}
          />
          {isNew && !readOnly && (
            <Button disabled={!name || createPolicy.isPending} onClick={() => createPolicy.mutate()}>
              Create policy
            </Button>
          )}
        </CardContent>
      </Card>

      {!isNew && policy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Bound agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Select value={agentToBind} onValueChange={setAgentToBind}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Bind an agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unboundAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!agentToBind || bindAgent.isPending} onClick={() => bindAgent.mutate()}>
                  Bind
                </Button>
              </div>
            )}
            {!policy.bound_agent_list || policy.bound_agent_list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents bound to this policy yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {policy.bound_agent_list.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <Link to="/agents/$agentId" params={{ agentId: a.id }} className="font-mono hover:text-primary">
                      {a.slug}
                    </Link>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => unbindAgent.mutate(a.id)}>
                        Unbind
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
