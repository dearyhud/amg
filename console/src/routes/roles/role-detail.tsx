import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Save, ShieldCheck } from "lucide-react";
import {
  useCompilePolicy,
  useCreateRole,
  useDemoteRole,
  useRole,
  useSaveRoleVersion,
} from "@/api/queries/roles";
import { ApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { CompiledPreview } from "@/components/policy-editor/compiled-preview";
import { PromoteDialog } from "@/components/policy-editor/promote-dialog";
import { VersionHistory } from "@/components/policy-editor/version-history";
import { EnforcementBadge } from "@/routes/roles";
import type { CompileResult } from "@/api/schemas";

const PolicyEditor = lazy(() => import("@/components/policy-editor/editor"));

const COMPILE_DEBOUNCE_MS = 500;

/*
 * Validate-as-you-type against the server-side compiler — the same Ruby
 * compiler the gateway runs. This hook owns the debounce.
 */
function useLiveCompile(yamlText: string | null) {
  const compile = useCompilePolicy();
  const { mutate } = compile;
  useEffect(() => {
    if (yamlText === null) return;
    const timer = setTimeout(() => mutate(yamlText), COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [yamlText, mutate]);
  return compile;
}

function EditorPane({
  initialYaml,
  editorKey,
  onSave,
  saving,
  saveLabel,
}: {
  initialYaml: string;
  editorKey: string;
  onSave: (yaml: string, result: CompileResult) => void;
  saving: boolean;
  saveLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? initialYaml;
  const compile = useLiveCompile(value);
  const result = compile.data;
  const dirty = draft !== null && draft !== initialYaml;
  const errors = useMemo(() => (result && !result.ok ? result.errors : []), [result]);

  // a fresh editorKey means a fresh baseline (saved version / other role)
  useEffect(() => setDraft(null), [editorKey]);

  return (
    <>
      <div className="grid h-[calc(100vh-260px)] min-h-96 grid-cols-2 gap-3">
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <PolicyEditor key={editorKey} defaultValue={initialYaml} onChange={setDraft} errors={errors} />
        </Suspense>
        <CompiledPreview result={result} isCompiling={compile.isPending} />
      </div>
      <div className="mt-3 flex items-center justify-end gap-3 border-t pt-3">
        {dirty && <span className="text-xs text-muted-foreground">unsaved changes</span>}
        <Button
          onClick={() => result && onSave(value, result)}
          disabled={!dirty || saving || !result?.ok || compile.isPending}
        >
          <Save />
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </>
  );
}

export function RoleDetailPage() {
  const { roleId } = useParams({ from: "/roles/$roleId" });
  const role = useRole(roleId);
  const save = useSaveRoleVersion(roleId);
  const demote = useDemoteRole(roleId);

  if (role.isPending) return <Skeleton className="h-96 w-full" />;
  if (role.isError) return <p className="text-sm text-destructive">Role not found.</p>;

  const data = role.data;

  return (
    <>
      <PageHeader
        title={data.name}
        mono
        description={data.description ?? undefined}
        actions={
          <>
            <Badge variant="outline" className="font-mono">
              v{data.policy_version}
            </Badge>
            <EnforcementBadge enforcement={data.enforcement} />
            {data.enforcement === "shadow" ? (
              <PromoteDialog role={data} />
            ) : (
              <Button
                variant="outline"
                onClick={() =>
                  demote.mutate(undefined, {
                    onSuccess: () => toast.success(`${data.name} back in shadow mode`),
                  })
                }
                disabled={demote.isPending}
              >
                <ShieldCheck />
                Back to shadow
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="versions">Versions ({data.versions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="editor">
          <EditorPane
            initialYaml={data.policy_yaml}
            editorKey={`${data.id}:${data.policy_version}`}
            saving={save.isPending}
            saveLabel="Save version"
            onSave={(yaml) =>
              save.mutate(
                { policy_yaml: yaml },
                {
                  onSuccess: (updated) =>
                    toast.success(`Saved ${updated.name} v${updated.policy_version}`),
                  onError: (error) =>
                    toast.error(error instanceof ApiError ? error.message : "save failed"),
                },
              )
            }
          />
        </TabsContent>

        <TabsContent value="versions">
          <div className="rounded-lg border bg-card">
            <VersionHistory versions={data.versions} currentVersion={data.policy_version} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

const NEW_ROLE_TEMPLATE = `role: my_new_role
enforcement: shadow
servers:
  notion:
    tools:
      - name: get_pages
limits:
  rate: 100/min
`;

export function NewRolePage() {
  const navigate = useNavigate();
  const create = useCreateRole();

  return (
    <>
      <PageHeader
        title="New role"
        description="Roles start in shadow: denials are logged, never enforced, until you promote."
      />
      <EditorPane
        initialYaml={NEW_ROLE_TEMPLATE}
        editorKey="new-role"
        saving={create.isPending}
        saveLabel="Create role"
        onSave={(yaml) =>
          create.mutate(
            { policy_yaml: yaml },
            {
              onSuccess: (created) => {
                toast.success(`Created ${created.name}`);
                void navigate({ to: "/roles/$roleId", params: { roleId: created.id } });
              },
              onError: (error) =>
                toast.error(error instanceof ApiError ? error.message : "create failed"),
            },
          )
        }
      />
    </>
  );
}
