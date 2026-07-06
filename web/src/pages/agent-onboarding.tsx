import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PolicyRuleEditor } from "@/components/policy-rule-editor"
import { IntegrationGuide } from "@/components/integration-guide"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import { cn } from "@/lib/utils"
import type { Agent, AgentKey, EffectivePermissions, Policy, PolicyRule, Upstream } from "@/lib/types"

const STEP_LABELS = ["Agent details", "Role", "API key", "Integrate"]

function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEP_LABELS.map((label, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <div key={label} className="flex items-center">
            {i > 0 && <div className={cn("mx-2 h-px w-8", done ? "bg-primary" : "bg-border")} />}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-foreground text-background",
                  !done && !active && "bg-muted-foreground/20 text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : step}
              </span>
              <span className={cn("text-sm", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AgentOnboardingPage() {
  const { admin } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [slug, setSlug] = useState("")
  const [displayName, setDisplayName] = useState("")

  const [policyMode, setPolicyMode] = useState<"existing" | "new">("existing")
  const [existingPolicyId, setExistingPolicyId] = useState("")
  const [newPolicyName, setNewPolicyName] = useState("")
  const [newPolicyRules, setNewPolicyRules] = useState<PolicyRule[]>([])
  const [boundPolicyName, setBoundPolicyName] = useState<string | null>(null)

  const [agentKey, setAgentKey] = useState<AgentKey | null>(null)

  const policiesQuery = useQuery({
    queryKey: ["policies"],
    queryFn: () => api<{ policies: Policy[] }>("/policies"),
    enabled: !!agent,
  })
  const upstreamsQuery = useQuery({
    queryKey: ["upstreams"],
    queryFn: () => api<{ upstreams: Upstream[] }>("/upstreams"),
    enabled: !!agent,
  })
  const permissionsQuery = useQuery({
    queryKey: ["agents", agent?.id, "permissions"],
    queryFn: () => api<EffectivePermissions>(`/agents/${agent?.id}/permissions`),
    enabled: !!agent && !!boundPolicyName,
  })

  const createAgent = useMutation({
    mutationFn: () => api<Agent>("/agents", { method: "POST", body: { slug, display_name: displayName } }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      setAgent(created)
    },
  })

  const bindExisting = useMutation({
    mutationFn: () => api(`/agents/${agent?.id}/policies/${existingPolicyId}`, { method: "PUT" }),
    onSuccess: () => {
      const policy = policiesQuery.data?.policies.find((p) => p.id === existingPolicyId)
      setBoundPolicyName(policy?.name ?? "policy")
    },
  })

  const createAndBindPolicy = useMutation({
    mutationFn: async () => {
      const policy = await api<Policy>("/policies", { method: "POST", body: { name: newPolicyName, rules: newPolicyRules } })
      await api(`/agents/${agent?.id}/policies/${policy.id}`, { method: "PUT" })
      return policy
    },
    onSuccess: (policy) => {
      void queryClient.invalidateQueries({ queryKey: ["policies"] })
      setBoundPolicyName(policy.name)
    },
  })

  const createKey = useMutation({
    mutationFn: () => api<AgentKey>(`/agents/${agent?.id}/keys`, { method: "POST", body: {} }),
    onSuccess: (key) => setAgentKey(key),
  })

  const upstreamById = new Map((upstreamsQuery.data?.upstreams ?? []).map((u) => [u.id, u]))
  const grantedUpstreamIds = [...new Set((permissionsQuery.data?.rules ?? []).map((r) => r.upstream_id))]
  const grantedUpstreams = grantedUpstreamIds.map((id) => upstreamById.get(id)).filter((u): u is Upstream => !!u)

  const keyPlaceholder = agentKey?.key ?? "<agent-key>"

  const step1Done = !!agent
  const step2Done = !!boundPolicyName
  const step3Done = !!agentKey
  const currentStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 4

  if (isReadOnly(admin)) {
    return (
      <div className="space-y-6">
        <Link to="/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to agents
        </Link>
        <p className="text-sm text-muted-foreground">
          Your role doesn't have permission to create agents. Ask an owner or admin.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to agents
      </Link>

      <div className="space-y-4">
        <h1 className="text-lg font-medium">New agent</h1>
        <StepProgress current={currentStep} />
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Agent details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="support-bot" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Support Bot" />
            </div>
            <Button disabled={!slug || !displayName || createAgent.isPending} onClick={() => createAgent.mutate()}>
              Create agent
            </Button>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assign a role to <span className="font-mono">{agent?.slug}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={policyMode} onValueChange={(v) => setPolicyMode(v as "existing" | "new")}>
              <TabsList>
                <TabsTrigger value="existing">Use existing</TabsTrigger>
                <TabsTrigger value="new">Create new</TabsTrigger>
              </TabsList>
              <TabsContent value="existing" className="space-y-3 pt-3">
                <Select value={existingPolicyId} onValueChange={setExistingPolicyId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a policy…" />
                  </SelectTrigger>
                  <SelectContent>
                    {policiesQuery.data?.policies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {policiesQuery.data?.policies.length === 0 && (
                  <p className="text-sm text-muted-foreground">No policies yet — switch to "Create new".</p>
                )}
                <div>
                  <Button disabled={!existingPolicyId || bindExisting.isPending} onClick={() => bindExisting.mutate()}>
                    Assign
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="new" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={newPolicyName}
                    onChange={(e) => setNewPolicyName(e.target.value)}
                    placeholder="support-triage"
                  />
                </div>
                <PolicyRuleEditor
                  rules={newPolicyRules}
                  upstreams={upstreamsQuery.data?.upstreams ?? []}
                  onChange={setNewPolicyRules}
                />
                <div>
                  <Button
                    disabled={!newPolicyName || createAndBindPolicy.isPending}
                    onClick={() => createAndBindPolicy.mutate()}
                  >
                    Create & assign
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Issue an API key</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              <span className="font-mono">{agent?.slug}</span> is assigned{" "}
              <span className="font-medium">{boundPolicyName}</span>. Now issue the key it will authenticate with.
            </p>
            <Button disabled={createKey.isPending} onClick={() => createKey.mutate()}>
              Create key
            </Button>
          </CardContent>
        </Card>
      )}

      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Integrate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2 font-mono text-sm">
              <span className="flex-1 truncate">{agentKey?.key}</span>
            </div>
            <p className="text-xs text-muted-foreground">Copy this now — it will never be shown again.</p>
            <IntegrationGuide upstreams={grantedUpstreams} apiKey={keyPlaceholder} />
            <Button onClick={() => navigate({ to: "/agents/$agentId", params: { agentId: agent!.id } })}>Done</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
