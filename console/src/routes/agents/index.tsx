import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAgents, useCreateAgent } from "@/api/queries/agents";
import { useRoles } from "@/api/queries/roles";
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

export function AgentStatusBadge({ status }: { status: "active" | "suspended" }) {
  return status === "active" ? (
    <Badge variant="success">active</Badge>
  ) : (
    <Badge variant="destructive">suspended</Badge>
  );
}

const newAgentSchema = z.object({
  name: z
    .string()
    .min(1, "name is required")
    .regex(/^[a-z0-9-]+$/, "lowercase letters, digits, and dashes only"),
  role: z.string().min(1, "role is required"),
});
type NewAgent = z.infer<typeof newAgentSchema>;

function NewAgentDialog() {
  const [open, setOpen] = useState(false);
  const roles = useRoles();
  const create = useCreateAgent();
  const form = useForm<NewAgent>({
    resolver: zodResolver(newAgentSchema),
    defaultValues: { name: "", role: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (agent) => {
        toast.success(`Registered ${agent.name}`);
        setOpen(false);
        form.reset();
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "registration failed"),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Register agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register agent</DialogTitle>
          <DialogDescription>
            Agents are principals. They hold an AMG token, never upstream credentials.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              placeholder="berg-enrichment-worker"
              className="font-mono"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select onValueChange={(value) => form.setValue("role", value, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.data?.map((role) => (
                  <SelectItem key={role.id} value={role.name} className="font-mono">
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.role && (
              <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>
            )}
          </div>
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

export function AgentsPage() {
  const agents = useAgents();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Agents"
        description="Registered principals and their scoped tokens."
        actions={<NewAgentDialog />}
      />

      {agents.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.data?.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })}
                >
                  <TableCell className="font-mono">{agent.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{agent.role}</TableCell>
                  <TableCell>
                    <AgentStatusBadge status={agent.status} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {agent.token_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelative(agent.last_seen_at)}
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
