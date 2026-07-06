import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { toolsQueryKey } from "@/lib/tools"
import type { Tool } from "@/lib/types"

interface TestResult {
  ok: boolean
  tools?: Tool[]
  error?: string
}

export function ToolDetailPage() {
  const { upstreamId, toolName } = useParams({ strict: false }) as { upstreamId: string; toolName: string }

  const toolsQuery = useQuery({
    queryKey: toolsQueryKey(upstreamId),
    queryFn: async () => {
      const result = await api<TestResult>(`/upstreams/${upstreamId}/test`, { method: "POST" })
      if (!result.tools) throw new Error(result.error ?? "Could not load tools from this upstream.")
      return result.tools
    },
  })

  const tool = toolsQuery.data?.find((t) => t.name === toolName)

  return (
    <div className="space-y-6">
      <Link
        to="/upstreams"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to upstreams
      </Link>

      {toolsQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : toolsQuery.isError ? (
        <p className="text-sm text-destructive">{(toolsQuery.error as Error).message}</p>
      ) : !tool ? (
        <p className="text-sm text-muted-foreground">Tool "{toolName}" was not found on this upstream.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <h1 className="font-mono text-lg font-medium">{tool.name}</h1>
            {tool.description && <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Input schema</CardTitle>
            </CardHeader>
            <CardContent>
              {tool.input_schema ? (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(tool.input_schema, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No input schema provided.</p>
              )}
            </CardContent>
          </Card>

          {tool.output_schema && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Output schema</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(tool.output_schema, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
