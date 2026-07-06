import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router"
import { RootLayout } from "@/layout"
import { LoginPage } from "@/pages/login"
import { DashboardPage } from "@/pages/dashboard"
import { AgentsPage } from "@/pages/agents"
import { AgentDetailPage } from "@/pages/agent-detail"
import { AgentOnboardingPage } from "@/pages/agent-onboarding"
import { UpstreamsPage } from "@/pages/upstreams"
import { UpstreamDetailPage } from "@/pages/upstream-detail"
import { ToolDetailPage } from "@/pages/tool-detail"
import { PoliciesPage } from "@/pages/policies"
import { PolicyBuilderPage } from "@/pages/policy-builder"
import { AuditPage } from "@/pages/audit"
import { api } from "@/lib/api"
import type { Admin } from "@/lib/types"

async function requireAuth() {
  try {
    await api<Admin>("/auth/me")
  } catch {
    throw redirect({ to: "/login" })
  }
}

const rootRoute = createRootRoute()

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  component: RootLayout,
  beforeLoad: requireAuth,
})

const dashboardRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: "/", component: DashboardPage })
const agentsRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: "/agents", component: AgentsPage })
const agentNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/agents/new",
  component: AgentOnboardingPage,
})
const agentDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/agents/$agentId",
  component: AgentDetailPage,
})
const upstreamsRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: "/upstreams", component: UpstreamsPage })
const upstreamDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/upstreams/$upstreamId",
  component: UpstreamDetailPage,
})
const toolDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/upstreams/$upstreamId/tools/$toolName",
  component: ToolDetailPage,
})
const policiesRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: "/policies", component: PoliciesPage })
const policyNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/policies/new",
  component: PolicyBuilderPage,
})
const policyDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/policies/$policyId",
  component: PolicyBuilderPage,
})
const auditRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: "/audit", component: AuditPage })

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([
    dashboardRoute,
    agentsRoute,
    agentNewRoute,
    agentDetailRoute,
    upstreamsRoute,
    upstreamDetailRoute,
    toolDetailRoute,
    policiesRoute,
    policyNewRoute,
    policyDetailRoute,
    auditRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
