import { lazy, Suspense, useState } from "react";
import { GitCompare } from "lucide-react";
import type { PolicyVersion } from "@/api/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

const DiffView = lazy(() => import("./diff-view"));

export function VersionHistory({
  versions,
  currentVersion,
}: {
  versions: PolicyVersion[];
  currentVersion: number;
}) {
  const [diffAgainst, setDiffAgainst] = useState<PolicyVersion | null>(null);
  const current = versions.find((v) => v.version === currentVersion);
  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Saved</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((version) => (
            <TableRow key={version.version}>
              <TableCell className="font-mono">
                v{version.version}
                {version.version === currentVersion && (
                  <Badge variant="default" className="ml-2">
                    current
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{version.author ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(version.created_at)}
              </TableCell>
              <TableCell className="text-right">
                {version.version !== currentVersion && current && (
                  <Button variant="ghost" size="sm" onClick={() => setDiffAgainst(version)}>
                    <GitCompare />
                    Diff v{version.version} ↔ v{currentVersion}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={diffAgainst !== null} onOpenChange={(open) => !open && setDiffAgainst(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-mono">
              v{diffAgainst?.version} → v{currentVersion}
            </DialogTitle>
            <DialogDescription>Older version left, current version right.</DialogDescription>
          </DialogHeader>
          {diffAgainst && current && (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <DiffView before={diffAgainst.yaml} after={current.yaml} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
