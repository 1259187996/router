import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test-utils";
import { Toaster } from "./sonner";

vi.mock("sonner", () => ({
  Toaster: vi.fn((props: { closeButton?: boolean; position?: string; richColors?: boolean }) => (
    <div
      data-close-button={String(props.closeButton)}
      data-position={props.position}
      data-rich-colors={String(props.richColors)}
      role="status"
    >
      toast-root
    </div>
  )),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("Toaster", () => {
  it("renders app toast notifications away from the lower-right notification stack", () => {
    render(<Toaster />);

    const toaster = screen.getByRole("status");
    expect(toaster).toHaveAttribute("data-position", "top-center");
    expect(toaster).toHaveAttribute("data-rich-colors", "true");
    expect(toaster).toHaveAttribute("data-close-button", "true");
  });
});
