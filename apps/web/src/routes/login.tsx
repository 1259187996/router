import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient, type LoginInput } from "../lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginApi = Pick<typeof apiClient, "login">;
const appVersionLabel = "Router Console v0.1.0 · 内部测试版";

export function LoginRouteComponent({
  api = apiClient,
  onAuthenticated,
}: {
  api?: LoginApi;
  onAuthenticated?: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loginMutation.mutateAsync(form);
    await onAuthenticated?.();
  }

  return (
    <main
      aria-label="登录窗口"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8"
    >
      <div className="w-full max-w-md">
        <Card className="rounded-xl border-border shadow-sm">
          <CardHeader className="space-y-3 px-6 pt-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Router Console</p>
            <h1 className="text-2xl font-semibold tracking-tight">控制台登录</h1>
            <CardDescription className="text-sm">
              使用管理员或已启用账户登录。
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-4">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">账号</Label>
                <Input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="admin"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="输入当前账户密码"
                />
              </div>

              {loginMutation.isError ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  登录失败，请检查账号和密码后重试。
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full"
                size="lg"
              >
                {loginMutation.isPending ? "验证中..." : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <footer className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          <p>{appVersionLabel}</p>
          <p>本地中转与用量账本管理界面</p>
        </footer>
      </div>
    </main>
  );
}
