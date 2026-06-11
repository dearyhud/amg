import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignIn } from "@/routes/__root";
import { meKeys } from "@/api/keys";
import type { Me } from "@/api/schemas";

function renderSignIn() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SignIn />
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe("SignIn", () => {
  it("shows the server's error on a wrong password", async () => {
    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText("Admin password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid password");
  });

  it("populates the me cache on success, unlocking the shell", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderSignIn();

    await user.type(screen.getByLabelText("Admin password"), "amg-dev-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await expect
      .poll(() => queryClient.getQueryData<Me>(meKeys.me)?.user.email)
      .toBe("hudson.deary@gmail.com");
  });

  it("disables submit until a password is typed", () => {
    renderSignIn();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
