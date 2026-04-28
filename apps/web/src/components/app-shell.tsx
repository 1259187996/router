import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { BarChart3, Key, Layers, LogOut, Menu, ScrollText, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "总览", to: "/" as const, activeOnly: true, summary: "用量与异常", icon: BarChart3 },
  { label: "渠道与路由", to: "/channels" as const, summary: "接入与策略", icon: Layers },
  { label: "Key 与权限", to: "/tokens" as const, summary: "发放与预算", icon: Key },
  { label: "请求日志", to: "/logs" as const, summary: "账本与排查", icon: ScrollText },
];

type AppShellUser = {
  email: string;
  displayName?: string;
  role?: "admin" | "user";
};

export function AppShell({
  children,
  user,
  onLogout,
}: {
  children: ReactNode;
  user: AppShellUser;
  onLogout: () => Promise<void> | void;
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const displayName = user.displayName || user.email;
  const roleLabel = user.role === "admin" ? "Admin" : "User";

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/80 bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-6 pt-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            Router Console
          </p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">LLM 分发与消耗账本</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            统一接入外部模型渠道，为团队分发 Key，追踪 token 消耗。
          </p>
        </div>

        <nav className="mt-8 flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              activeProps={{ className: "bg-primary/10 text-primary shadow-sm shadow-primary/5" }}
              activeOptions={{ exact: item.activeOnly }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              <div>
                <span>{item.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{item.summary}</span>
              </div>
            </Link>
          ))}
        </nav>

        <div className="mx-3 mb-6 rounded-lg border border-border/80 bg-background/75 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">控制台会话</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{roleLabel}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            先看总览，再进入渠道、Key 与日志页，把路由策略与消耗账本放进同一条运营视角。
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 lg:px-6">
            {/* Mobile nav trigger */}
            <MobileNav />
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Router Control Plane
                </p>
                <h2 className="text-lg font-semibold tracking-tight">企业模型出口控制台</h2>
              </div>
              <div className="flex min-w-0 items-center gap-3 self-stretch sm:self-auto">
                <div className="hidden min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-2 sm:flex">
                  <UserRound className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-4">{displayName}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={isLoggingOut}
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function MobileNav() {
  return (
    <div className="lg:hidden">
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md p-2 hover:bg-muted">
          <Menu className="h-5 w-5" />
          <span className="text-sm font-medium">导航</span>
        </summary>
        <nav className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border bg-background p-1 shadow-lg">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              activeProps={{ className: "bg-muted" }}
              activeOptions={{ exact: item.activeOnly }}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
              )}
            >
              <item.icon className="h-4 w-4" />
              <div>
                <span className="font-medium">{item.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{item.summary}</span>
              </div>
            </Link>
          ))}
        </nav>
      </details>
    </div>
  );
}
