import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import { toolsQueryKey } from "@/lib/tools"
import type { Tool, Upstream } from "@/lib/types"

interface TestResult {
  ok: boolean
  tools?: Tool[]
  error?: string
}

export function UpstreamDetailPage() {
  const { upstreamId } = useParams({ strict: false }) as { upstreamId: string }
  const { admin } = useAuth()
  const readOnly = isReadOnly(admin)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const upstreamQuery = useQuery({
    queryKey: ["upstreams", upstreamId],
    queryFn: () => api<Upstream>(`/upstreams/${upstreamId}`),
  })

  const testUpstream = useMutation({
    mutationFn: () => api<TestResult>(`/upstreams/${upstreamId}/test`, { method: "POST" }),
    onSuccess: (result) => {
      if (result.tools) queryClient.setQueryData(toolsQueryKey(upstreamId), result.tools)
    },
  })

  const connectOAuth = useMutation({
    mutationFn: () => api<{ authorization_url: string }>(`/upstreams/${upstreamId}/oauth/connect`, { method: "POST" }),
    onSuccess: (result) => {
      window.open(result.authorization_url, "_blank", "noopener,noreferrer")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["upstreams", upstreamId] })
      void queryClient.invalidateQueries({ queryKey: ["upstreams"] })
    },
  })

  if (upstreamQuery.isLoading) return <Skeleton className="h-40 w-full" />
  const upstream = upstreamQuery.data
  if (!upstream) return <p className="text-sm text-muted-foreground">Upstream not found.</p>

  const testResult = testUpstream.data

  return (
    <div className="space-y-6">
      <Link
        to="/upstreams"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to upstreams
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-medium">{upstream.slug}</h1>
          <p className="text-sm text-muted-foreground">{upstream.display_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && upstream.kind === "mcp_http" && (
            <Button variant="outline" disabled={connectOAuth.isPending} onClick={() => connectOAuth.mutate()}>
              {upstream.oauth_connected ? "Reconnect" : "Connect"}
            </Button>
          )}
          <Button disabled={testUpstream.isPending} onClick={() => testUpstream.mutate()}>
            Load tools
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Kind</span>
            <span className="font-mono">{upstream.kind}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusDot status={upstream.status === "active" ? "healthy" : "degraded"} label={upstream.status} />
          </div>
          {upstream.kind === "mcp_http" && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">OAuth connection</span>
              <StatusDot
                status={upstream.oauth_connected ? "healthy" : "degraded"}
                label={upstream.oauth_connected ? "connected" : "not connected"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Tools</CardTitle>
        </CardHeader>
        <CardContent>
          {!testResult ? (
            <p className="text-sm text-muted-foreground">Run "Load tools" to discover this upstream's tools.</p>
          ) : testResult.ok === false ? (
            <p className="text-sm text-destructive">{testResult.error ?? "Connection failed."}</p>
          ) : testResult.tools && testResult.tools.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {testResult.tools.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-2 py-2 text-left hover:text-primary"
                    onClick={() =>
                      navigate({
                        to: "/upstreams/$upstreamId/tools/$toolName",
                        params: { upstreamId, toolName: t.name },
                      })
                    }
                  >
                    <span className="font-mono">{t.name}</span>
                    {t.description && (
                      <span className="truncate text-xs text-muted-foreground">{t.description}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Connection OK. No tools reported.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
