import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
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

export function IntegrationGuide({ upstreams, apiKey }: { upstreams: Upstream[]; apiKey: string }) {
  const origin = window.location.origin
  const mcpUpstreams = upstreams.filter((u) => u.kind === "mcp_stdio" || u.kind === "mcp_http")
  const restUpstreams = upstreams.filter((u) => u.kind === "rest")

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

  if (upstreams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This agent's policy doesn't grant access to any upstream yet — bind rules to an upstream to see integration
        snippets.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium">Smoke test</p>
        <CopyBlock
          code={`curl -s ${origin}/mcp/${mcpUpstreams[0]?.slug ?? restUpstreams[0]?.slug ?? "<slug>"} \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
        />
      </div>

      {mcpUpstreams.length > 0 && (
        <>
          <div>
            <p className="mb-1.5 text-sm font-medium">Claude Desktop / Claude Code (mcp config)</p>
            <CopyBlock code={mcpServersJson} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">LangChain (langchain-mcp-adapters)</p>
            <CopyBlock code={langchainSnippet} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Codex CLI (config.toml)</p>
            <CopyBlock code={codexToml} />
          </div>
        </>
      )}

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
