# AMG Admin Console

Control-plane UI for the Agentic MCP Gateway: author role policies with live
server-side compilation, issue and revoke agent tokens, register upstreams,
work the approvals queue, and live in the audit log.

Vite · React 18 · TypeScript (strict) · Tailwind v4 · shadcn-style components ·
TanStack Router/Query/Table/Virtual · CodeMirror 6 · Recharts · MSW.

## Running

```sh
npm install
npm run dev        # http://localhost:5173/admin/ — MSW mocks the whole API
npm test           # Vitest + RTL against the MSW node server
npm run build      # tsc --noEmit && vite build → dist/ (serve at /admin)
npm run e2e        # Playwright (needs `npx playwright install` once)
```

Dev mode is fully self-contained: MSW intercepts `/admin/api/*` with a
deterministic seeded world (3 roles — one in shadow with real deny traffic —
3 agents, 3 upstreams, ~800 audit events, a live approvals queue). The same
handlers power Vitest.

## How it hangs together

- **Same-origin**: built assets are served by the admin plane at `/admin`,
  API at `/admin/api`. Vite `base` and the router `basepath` are both
  `/admin`. No CORS; CSP is `default-src 'self'`; fonts self-hosted.
- **Auth**: `/admin/api/me` gates the router. 401 renders the sign-in form —
  v1 is simple password auth (`POST /auth/login` against `AMG_ADMIN_PASSWORD`,
  httpOnly session cookie set server-side; Google SSO is the eventual target
  per the TDD). The CSRF token from `/me` rides every mutation.
- **Every response crosses a zod boundary** (`src/api/schemas.ts`, snake_case
  mirroring the Ruby serializers). Parse failure = typed error, loud in dev.
- **Query keys are factory-built** (`src/api/keys.ts`); enforcement-changing
  mutations (promote, revoke, approve, deny) are never optimistic.
- **Token plaintext** exists only in `IssueTokenDialog` component state — it
  deliberately bypasses `useMutation` so the token never enters any cache.
  There's a test pinning that.
- **Audit explorer**: filters are URL search params (shareable links),
  TanStack Table + Virtual over keyset-paginated infinite query.
- **Approvals liveness**: SSE (`/admin/api/approvals/stream`) invalidates the
  queue + sidebar badge; 30s polling is the fallback when the stream drops.
- **Heavy deps are route-lazy**: CodeMirror and Recharts load via
  `React.lazy` and ship as separate chunks; the initial bundle is ~168KB gz
  (budget 200KB).

## Deviations from the design doc

- **Code-based TanStack Router routes** (`src/router.tsx`) instead of
  file-based codegen — same type-safety incl. validated search params,
  no generated `routeTree.gen.ts` to keep in sync. Route components still
  live under `src/routes/` mirroring the doc's layout.
- **Hand-rolled sidebar** rather than shadcn's `Sidebar` block (no collapse
  rail in v1); the rest of `components/ui/` follows shadcn conventions and
  is owned in-repo as the doc intends.
- **Charts use Recharts directly** with the token palette rather than the
  shadcn chart wrapper layer.
- The promote-dialog sparkline is a 20-line inline SVG instead of a Recharts
  instance, so the roles route doesn't pay the chart-chunk cost.

## Backend gaps the mocks paper over

The Ruby admin plane (`../admin.ru`) currently speaks bearer-token CRUD. To
take this console live it needs to grow, roughly in v1 order:

1. ~~`/admin/api` namespace~~ (done: nginx proxies `/admin/api/*` → admin plane)
2. ~~Session auth, `/me` (user + CSRF)~~ (done: password auth via
   `AMG_ADMIN_PASSWORD`; Google SSO + allow-list still future)
3. `POST /policies/compile` returning `{ok, errors:[{message, line, column}]}`
   from the real `AMG::Policy::Compiler`
4. Policy **version history** storage (versions table) + role serializer
   fields (`agent_count`, `policy_yaml`, `versions`)
5. `GET /roles/:id/shadow_stats`, promote/demote endpoints with the
   confirm-name guard
6. Audit keyset pagination (`cursor`, `next_cursor`), `/audit_events/:id/replay`
7. Approval `reason` column + resolution audit events + SSE stream
8. `GET /dashboard` aggregates and `/settings`

The zod schemas in `src/api/schemas.ts` are the contract — pair them with
serializer specs on the Ruby side to catch drift.
