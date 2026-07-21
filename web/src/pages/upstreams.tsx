import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { api } from "@/lib/api"
import { useAuth, isReadOnly } from "@/lib/auth"
import type { Upstream, UpstreamKind } from "@/lib/types"

export function UpstreamsPage() {
  const { admin } = useAuth()
  const readOnly = isReadOnly(admin)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [kind, setKind] = useState<UpstreamKind>("mcp_stdio")
  const [configText, setConfigText] = useState('{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-github"]\n}')
  const [secretsText, setSecretsText] = useState("{}")
  const [createdUpstream, setCreatedUpstream] = useState<Upstream | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["upstreams"],
    queryFn: () => api<{ upstreams: Upstream[] }>("/upstreams"),
  })

  const resetCreateForm = () => {
    setSlug("")
    setDisplayName("")
    setKind("mcp_stdio")
    setConfigText('{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-github"]\n}')
    setSecretsText("{}")
    setCreatedUpstream(null)
  }

  const createUpstream = useMutation({
    mutationFn: () =>
      api<Upstream>("/upstreams", {
        method: "POST",
        body: { slug, display_name: displayName, kind, config: JSON.parse(configText), secrets: JSON.parse(secretsText) },
      }),
    onSuccess: (upstream) => {
      void queryClient.invalidateQueries({ queryKey: ["upstreams"] })
      if (upstream.kind === "mcp_http") {
        setCreatedUpstream(upstream)
      } else {
        setOpen(false)
        resetCreateForm()
      }
    },
  })

  const connectOAuth = useMutation({
    mutationFn: (upstream: Upstream) =>
      api<{ authorization_url: string }>(`/upstreams/${upstream.id}/oauth/connect`, { method: "POST" }),
    onSuccess: (result) => {
      window.open(result.authorization_url, "_blank", "noopener,noreferrer")
      setOpen(false)
      resetCreateForm()
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Upstreams</h1>
        {!readOnly && (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) resetCreateForm()
            }}
          >
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-none bg-foreground font-mono text-xs tracking-widest text-background uppercase hover:bg-foreground/80"
              >
                New upstream
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg rounded-none">
              {createdUpstream ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="font-mono text-sm tracking-widest uppercase">
                      Connect {createdUpstream.slug}
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono">{createdUpstream.slug}</span> was created. This server uses OAuth, so
                    AMG needs to complete the authorization handshake with it before agents can call it. This opens a
                    new tab to sign in and authorize AMG.
                  </p>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      className="rounded-none font-mono text-xs tracking-widest uppercase"
                      onClick={() => setOpen(false)}
                    >
                      Do this later
                    </Button>
                    <Button
                      className="rounded-none bg-foreground font-mono text-xs tracking-widest text-background uppercase hover:bg-foreground/80"
                      disabled={connectOAuth.isPending}
                      onClick={() => connectOAuth.mutate(createdUpstream)}
                    >
                      Connect
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="font-mono text-sm tracking-widest uppercase">New upstream</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                          Slug
                        </Label>
                        <Input
                          value={slug}
                          onChange={(e) => setSlug(e.target.value)}
                          placeholder="github"
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                          Kind
                        </Label>
                        <Select value={kind} onValueChange={(v) => setKind(v as UpstreamKind)}>
                          <SelectTrigger className="rounded-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mcp_stdio">MCP (stdio)</SelectItem>
                            <SelectItem value="mcp_http">MCP (HTTP)</SelectItem>
                            <SelectItem value="rest">REST</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                        Display name
                      </Label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="GitHub"
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                        Config (JSON)
                      </Label>
                      <textarea
                        className="h-28 w-full rounded-none border border-input bg-transparent p-2 font-mono text-xs"
                        value={configText}
                        onChange={(e) => setConfigText(e.target.value)}
                      />
                      {kind === "mcp_http" && (
                        <p className="text-xs text-muted-foreground">
                          Config just needs {"{"}"url": "..."{"}"}. If the server takes a static bearer token, add a{" "}
                          <code className="font-mono">headers</code> key and reference the secret below; if it
                          requires OAuth, leave headers out — you'll connect it in the next step.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                        Secrets (JSON, write-only)
                      </Label>
                      <textarea
                        className="h-16 w-full rounded-none border border-input bg-transparent p-2 font-mono text-xs"
                        value={secretsText}
                        onChange={(e) => setSecretsText(e.target.value)}
                        placeholder='{"github_token": "ghp_..."}'
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      className="rounded-none bg-foreground font-mono text-xs tracking-widest text-background uppercase hover:bg-foreground/80"
                      disabled={!slug || !displayName || createUpstream.isPending}
                      onClick={() => createUpstream.mutate()}
                    >
                      Create
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.upstreams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upstreams yet. Register an MCP server or REST API to start authoring policies against it.
        </p>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                  Slug
                </TableHead>
                <TableHead className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                  Kind
                </TableHead>
                <TableHead className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.upstreams.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/upstreams/$upstreamId", params: { upstreamId: u.id } })}
                >
                  <TableCell className="font-mono text-sm">{u.slug}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{u.kind}</TableCell>
                  <TableCell>
                    <StatusDot
                      status={u.status === "active" ? "healthy" : "degraded"}
                      label={u.status}
                      className="font-mono text-xs tracking-wide uppercase"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
