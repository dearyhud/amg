import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootShell } from "@/routes/__root";
import { DashboardPage } from "@/routes/dashboard";
import { RolesPage } from "@/routes/roles";
import { NewRolePage, RoleDetailPage } from "@/routes/roles/role-detail";
import { AgentsPage } from "@/routes/agents";
import { AgentDetailPage } from "@/routes/agents/agent-detail";
import { UpstreamsPage } from "@/routes/upstreams";
import { UpstreamDetailPage } from "@/routes/upstreams/upstream-detail";
import { AuditPage } from "@/routes/audit";
import { AuditEventPage } from "@/routes/audit/audit-event";
import { ApprovalsPage } from "@/routes/approvals";
import { ApprovalDetailPage } from "@/routes/approvals/approval-detail";
import { SettingsPage } from "@/routes/settings";
import { auditFiltersSchema } from "@/api/queries/audit";

const rootRoute = createRootRoute({ component: RootShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const rolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/roles",
  component: RolesPage,
});

const newRoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/roles/new",
  component: NewRolePage,
});

const roleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/roles/$roleId",
  component: RoleDetailPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});

const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  component: AgentDetailPage,
});

const upstreamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upstreams",
  component: UpstreamsPage,
});

const upstreamDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upstreams/$upstreamId",
  component: UpstreamDetailPage,
});

// Audit filters are URL state: any filtered view is a shareable link.
const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
  component: AuditPage,
  validateSearch: (search) => auditFiltersSchema.parse(search),
});

const auditEventRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit/$eventId",
  component: AuditEventPage,
});

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approvals",
  component: ApprovalsPage,
});

const approvalDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approvals/$approvalId",
  component: ApprovalDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  rolesRoute,
  newRoleRoute,
  roleDetailRoute,
  agentsRoute,
  agentDetailRoute,
  upstreamsRoute,
  upstreamDetailRoute,
  auditRoute,
  auditEventRoute,
  approvalsRoute,
  approvalDetailRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: "/admin",
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
