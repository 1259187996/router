import { createMemoryHistory } from "@tanstack/history";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { screen, renderRouter } from "./test-utils";
import { createAppRouter } from "./router";

describe("app router auth flow", () => {
  it("redirects anonymous visitors from the console shell to /login", async () => {
    const api = {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: /控制台登录/i })).toBeInTheDocument();
    expect(api.getCurrentUser).toHaveBeenCalled();
  });

  it("redirects authenticated visitors away from /login into the console shell", async () => {
    const api = {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn().mockResolvedValue({
        user: { email: "admin@example.com", role: "admin" },
      }),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({ initialEntries: ["/login"] }),
    });
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: /Token 使用总览/i })).toBeInTheDocument();
    expect(screen.getAllByText("总览").length).toBeGreaterThan(0);
    expect(screen.getAllByText("渠道与路由").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Key 与权限").length).toBeGreaterThan(0);
    expect(screen.getAllByText("请求日志").length).toBeGreaterThan(0);
  });

  it("lets authenticated users log out from the console shell", async () => {
    let loggedIn = true;
    const api = {
      login: vi.fn(),
      logout: vi.fn().mockImplementation(async () => {
        loggedIn = false;
      }),
      getCurrentUser: vi.fn().mockImplementation(async () => ({
        user: loggedIn ? { email: "admin@example.com", role: "admin" as const } : null,
      })),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: /Token 使用总览/i })).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: /控制台登录/i })).toBeInTheDocument();
  });
});
