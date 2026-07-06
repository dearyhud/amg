import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { api } from "@/lib/api"

interface StatusResponse {
  status: string
  upstreams: { id: string; slug: string; kind: string; status: string }[]
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["status"],
    queryFn: () => api<StatusResponse>("/status"),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-medium">Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Upstream health</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : data && data.upstreams.length > 0 ? (
            <div className="divide-y divide-border">
              {data.upstreams.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono">{u.slug}</span>
                  <span className="text-muted-foreground">{u.kind}</span>
                  <StatusDot status={u.status === "active" ? "healthy" : "degraded"} label={u.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No upstreams registered yet. Add one from the Upstreams screen to get started.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
