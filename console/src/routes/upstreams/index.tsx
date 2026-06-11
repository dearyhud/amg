import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useCreateUpstream, useUpstreams } from "@/api/queries/upstreams";
import { ApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UpstreamStatusDot({ status }: { status: "ok" | "error" | "unknown" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          status === "ok" && "bg-success",
          status === "error" && "bg-destructive",
          status === "unknown" && "bg-muted-foreground",
        )}
      />
      <span className="text-muted-foreground">{status}</span>
    </span>
  );
}

const newUpstreamSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "lowercase snake_case only"),
  kind: z.enum(["mcp", "http"]),
  endpoint: z.string().url("must be a URL"),
  vault_path: z.string().min(1, "vault path is required"),
});
type NewUpstream = z.infer<typeof newUpstreamSchema>;

function NewUpstreamDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateUpstream();
  const form = useForm<NewUpstream>({
    resolver: zodResolver(newUpstreamSchema),
    defaultValues: { name: "", kind: "mcp", endpoint: "", vault_path: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (upstream) => {
        toast.success(`Registered upstream ${upstream.name}`);
        setOpen(false);
        form.reset();
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "registration failed"),
    }),
  );

  const field = (name: keyof NewUpstream, label: string, placeholder: string, mono = true) => (
    <div className="space-y-1.5">
      <Label htmlFor={`up-${name}`}>{label}</Label>
      <Input
        id={`up-${name}`}
        placeholder={placeholder}
        className={mono ? "font-mono" : undefined}
        {...form.register(name)}
      />
      {form.formState.errors[name] && (
        <p className="text-xs text-destructive">{form.formState.errors[name]?.message}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Register upstream
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register upstream</DialogTitle>
          <DialogDescription>
            Credentials stay in Vault; AMG reads them at connection time. The console never sees
            them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {field("name", "Name", "notion")}
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select
              defaultValue="mcp"
              onValueChange={(v) => form.setValue("kind", v as "mcp" | "http")}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mcp">mcp</SelectItem>
                <SelectItem value="http">http</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("endpoint", "Endpoint", "https://mcp.notion.com/mcp")}
          {field("vault_path", "Vault path", "notion/api_key")}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Registering…" : "Register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UpstreamsPage() {
  const upstreams = useUpstreams();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Upstreams"
        description="The MCP servers and HTTP APIs the gateway brokers."
        actions={<NewUpstreamDialog />}
      />

      {upstreams.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Upstream</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Last tools/list</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upstreams.data?.map((upstream) => (
                <TableRow
                  key={upstream.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({ to: "/upstreams/$upstreamId", params: { upstreamId: upstream.id } })
                  }
                >
                  <TableCell className="font-mono">{upstream.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {upstream.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                    {upstream.endpoint}
                  </TableCell>
                  <TableCell>
                    <UpstreamStatusDot status={upstream.status} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {upstream.tool_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelative(upstream.last_tools_list_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
