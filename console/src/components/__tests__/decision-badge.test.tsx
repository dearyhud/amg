import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionBadge } from "@/components/decision-badge";

describe("DecisionBadge", () => {
  it("renders each verdict with its semantic color class", () => {
    render(
      <>
        <DecisionBadge decision="allow" />
        <DecisionBadge decision="deny" />
        <DecisionBadge decision="shadow_deny" />
        <DecisionBadge decision="needs_approval" />
      </>,
    );

    expect(screen.getByText("allow")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("deny")).toHaveClass("text-destructive");
    expect(screen.getByText("shadow deny")).toHaveClass("text-warning");
    expect(screen.getByText("needs approval")).toBeInTheDocument();
  });

  it("tags the decision for e2e/a11y hooks", () => {
    render(<DecisionBadge decision="shadow_deny" />);
    expect(screen.getByText("shadow deny")).toHaveAttribute("data-decision", "shadow_deny");
  });
});
