import { createMemoryHistory } from "@tanstack/history";
import { describe, expect, it, vi } from "vitest";
import { renderRouter, screen } from "../test-utils";
import { createAppRouter } from "../router";

describe("IndexRouteComponent", () => {
  it("renders a token-led operations homepage for operators", async () => {
    const api = {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn().mockResolvedValue({
        user: { email: "admin@example.com", role: "admin" },
      }),
      getOverview: vi.fn().mockResolvedValue({
        totalRequests: 4,
        successfulRequests: 3,
        reviewRequiredRequests: 1,
        totalTokens: 750,
        inputTokens: 600,
        cachedInputTokens: 250,
        outputTokens: 150,
        settlementPriceUsd: "6.7500",
      }),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: "Token 使用总览" })).toBeInTheDocument();
    expect((await screen.findAllByText("750")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$6.7500").length).toBeGreaterThan(0);
    expect(screen.getByText("600 / 250 / 150")).toBeInTheDocument();
    expect(screen.getAllByText(/缓存 250/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 / 1").length).toBeGreaterThan(0);
    expect(api.getOverview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("快捷操作")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看 Key 与权限" })).toHaveAttribute("href", "/tokens");
    expect(screen.getByRole("link", { name: "巡检渠道与路由" })).toHaveAttribute("href", "/channels");
    expect(screen.getByRole("link", { name: "排查请求日志" })).toHaveAttribute("href", "/logs");
  });
});
