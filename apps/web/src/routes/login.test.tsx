import userEvent from "@testing-library/user-event";
import { within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../test-utils";
import { LoginRouteComponent } from "./login";

describe("LoginRouteComponent", () => {
  it("renders a centered login window with a version note", () => {
    render(<LoginRouteComponent api={{ login: vi.fn() }} />);

    expect(screen.getByRole("heading", { level: 1, name: "控制台登录" })).toBeInTheDocument();

    const loginWindow = screen.getByRole("main", { name: "登录窗口" });
    expect(within(loginWindow).getByLabelText("账号")).toBeInTheDocument();
    expect(within(loginWindow).getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByText("Router Console v0.1.0 · 内部测试版")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "登录品牌封面" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "移动端登录提示" })).not.toBeInTheDocument();
  });

  it("submits account and password through the api client and enters the console", async () => {
    const login = vi.fn().mockResolvedValue({ user: { email: "admin" } });
    const onAuthenticated = vi.fn();

    render(<LoginRouteComponent api={{ login }} onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText(/账号/i), "admin");
    await userEvent.type(screen.getByLabelText(/密码/i), "admin123");
    await userEvent.click(screen.getByRole("button", { name: /登录/i }));

    expect(login).toHaveBeenCalledWith({
      email: "admin",
      password: "admin123",
    });
    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });
});
