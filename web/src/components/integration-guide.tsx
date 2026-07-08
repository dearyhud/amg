import { useState } from "react"
import { AppWindow, Bot, Check, Code2, Copy, Link2, Terminal, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Upstream } from "@/lib/types"

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-muted p-3 pr-10 font-mono text-xs whitespace-pre-wrap">{code}</pre>
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute top-1.5 right-1.5"
        onClick={() => {
          void navigator.clipboard.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

interface ProductCard {
  key: string
  label: string
  icon: LucideIcon
  code: string
}

export function IntegrationGuide({ upstreams, apiKey }: { upstreams: Upstream[]; apiKey: string }) {
  const origin = window.location.origin
  const mcpUpstreams = upstreams.filter((u) => u.kind === "mcp_stdio" || u.kind === "mcp_http")
  const restUpstreams = upstreams.filter((u) => u.kind === "rest")

  const [selected, setSelected] = useState<string | null>(null)

  if (upstreams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This agent's policy doesn't grant access to any upstream yet — bind rules to an upstream to see integration
        snippets.
      </p>
    )
  }

  const mcpServersJson = JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        mcpUpstreams.map((u) => [
          u.slug,
          { url: `${origin}/mcp/${u.slug}`, headers: { Authorization: `Bearer ${apiKey}` } },
        ]),
      ),
    },
    null,
    2,
  )

  const claudeCodeCli = mcpUpstreams
    .map(
      (u) =>
        `claude mcp add --transport http ${u.slug} ${origin}/mcp/${u.slug} --header "Authorization: Bearer ${apiKey}"`,
    )
    .join("\n")

  const langchainSnippet = `from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
${mcpUpstreams
  .map(
    (u) =>
      `    "${u.slug}": {\n        "url": "${origin}/mcp/${u.slug}",\n        "transport": "streamable_http",\n        "headers": {"Authorization": "Bearer ${apiKey}"},\n    },`,
  )
  .join("\n")}
})
tools = await client.get_tools()`

  const codexToml = `# ~/.codex/config.toml — check \`codex mcp --help\` for the exact HTTP field
# names on your installed version; remote/streamable-HTTP MCP support is newer
# than the original stdio-only config and has evolved across releases.
${mcpUpstreams
  .map(
    (u) =>
      `[mcp_servers.${u.slug}]\nurl = "${origin}/mcp/${u.slug}"\nbearer_token = "${apiKey}"`,
  )
  .join("\n\n")}`

  const smokeTest = `curl -s ${origin}/mcp/${mcpUpstreams[0]?.slug ?? restUpstreams[0]?.slug ?? "<slug>"} \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`

  const cards: ProductCard[] = [{ key: "cli", label: "CLI", icon: Terminal, code: smokeTest }]

  if (mcpUpstreams.length > 0) {
    cards.push(
      { key: "claude-code", label: "Claude Code", icon: Bot, code: claudeCodeCli },
      { key: "claude-desktop", label: "Claude Desktop", icon: AppWindow, code: mcpServersJson },
      { key: "codex", label: "Codex", icon: Code2, code: codexToml },
      { key: "langchain", label: "LangChain", icon: Link2, code: langchainSnippet },
    )
  }

  const activeKey = selected && cards.some((c) => c.key === selected) ? selected : cards[0].key
  const activeCard = cards.find((c) => c.key === activeKey)!

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSelected(c.key)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-2 border p-2 transition-colors",
              activeKey === c.key
                ? "border-foreground bg-muted"
                : "border-border hover:border-muted-foreground hover:bg-muted/50",
            )}
          >
            <c.icon className="size-6" />
            <span className="text-center font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
              {c.label}
            </span>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">{activeCard.label}</p>
        <CopyBlock code={activeCard.code} />
      </div>

      {restUpstreams.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">REST upstream(s)</p>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Call these directly with the same bearer key — not an MCP tool surface.
          </p>
          <CopyBlock
            code={restUpstreams.map((u) => `${origin}/proxy/${u.slug}/...  (Authorization: Bearer ${apiKey})`).join("\n")}
          />
        </div>
      )}
    </div>
  )
}
