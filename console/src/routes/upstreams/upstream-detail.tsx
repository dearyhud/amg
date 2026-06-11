import { useParams } from "@tanstack/react-router";
import { useUpstream } from "@/api/queries/upstreams";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { UpstreamStatusDot } from "@/routes/upstreams";
import { formatRelative } from "@/lib/format";
import { Wrench } from "lucide-react";

export function UpstreamDetailPage() {
  const { upstreamId } = useParams({ from: "/upstreams/$upstreamId" });
  const upstream = useUpstream(upstreamId);

  if (upstream.isPending) return <Skeleton className="h-96 w-full" />;
  if (upstream.isError) return <p className="text-sm text-destructive">Upstream not found.</p>;

  const data = upstream.data;

  return (
    <>
      <PageHeader
        title={data.name}
        mono
        actions={
          <>
            <Badge variant="outline" className="font-mono">
              {data.kind}
            </Badge>
            <UpstreamStatusDot status={data.status} />
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="font-mono text-xs">{data.endpoint}</span>
        <span>·</span>
        <span>last tools/list {formatRelative(data.last_tools_list_at)}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Discovered tools ({data.tools.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.tools.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No tools discovered — the last tools/list may have failed. Tools from this upstream
              are hidden from agents until discovery succeeds (the safe direction).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Tool</TableHead>
                  <TableHead>Namespaced</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tools.map((tool) => (
                  <TableRow key={tool.name}>
                    <TableCell className="pl-4 font-mono">{tool.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {data.name}__{tool.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tool.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
