import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueTokenDialog } from "@/components/agents/issue-token-dialog";
import { db } from "@/mocks/db";

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const agent = db.agents[0]!;
  render(
    <QueryClientProvider client={queryClient}>
      <IssueTokenDialog agentId={agent.id} agentName={agent.name} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe("IssueTokenDialog", () => {
  it("reveals the plaintext exactly once and never re-reveals after close", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderDialog();

    await user.click(screen.getByRole("button", { name: /issue token/i }));
    await user.click(await screen.findByRole("button", { name: /^issue token$/i }));

    const tokenEl = await screen.findByTestId("issued-token");
    const plaintext = tokenEl.textContent!;
    expect(plaintext).toMatch(/^amg_[0-9a-f]{64}$/);
    expect(screen.getByText(/never be shown again/i)).toBeInTheDocument();

    // the plaintext must not have leaked into the query cache
    const cached = JSON.stringify(
      queryClient.getQueryCache().getAll().map((q) => q.state.data ?? null),
    );
    expect(cached).not.toContain(plaintext);

    // closing is final
    await user.click(screen.getByRole("button", { name: /stored it/i }));
    expect(screen.queryByTestId("issued-token")).not.toBeInTheDocument();

    // reopening starts a fresh issuance flow, not a re-reveal
    await user.click(screen.getByRole("button", { name: /issue token/i }));
    expect(screen.queryByTestId("issued-token")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^issue token$/i })).toBeInTheDocument();
  });
});
