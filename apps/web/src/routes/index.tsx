import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Key, Layers, ScrollText, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, type AppApi, type OverviewResponse } from "../lib/api-client";

type IndexRouteApi = Pick<AppApi, "getOverview">;

const emptyOverview: OverviewResponse = {
  totalRequests: 0,
  successfulRequests: 0,
  reviewRequiredRequests: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  settlementPriceUsd: "0.0000",
};

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatUsd(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "$0.0000";
  return `$${numeric.toFixed(4)}`;
}

export function IndexRouteComponent({ api = apiClient }: { api?: IndexRouteApi }) {
  const overviewQuery = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.getOverview(),
  });
  const overview = overviewQuery.data ?? emptyOverview;

  const metrics = [
    {
      label: "总 token",
      value: formatInteger(overview.totalTokens),
      detail: `输入 ${formatInteger(overview.inputTokens)} / 输出 ${formatInteger(overview.outputTokens)}`,
      icon: BarChart3,
    },
    {
      label: "总费用",
      value: formatUsd(overview.settlementPriceUsd),
      detail: "按本地价格表完成结算",
      icon: WalletCards,
    },
    {
      label: "输入 / 输出",
      value: `${formatInteger(overview.inputTokens)} / ${formatInteger(overview.outputTokens)}`,
      detail: "用于判断上下文和响应成本结构",
      icon: ScrollText,
    },
    {
      label: "成功 / 复核",
      value: `${formatInteger(overview.successfulRequests)} / ${formatInteger(overview.reviewRequiredRequests)}`,
      detail: `总请求 ${formatInteger(overview.totalRequests)} 次`,
      icon: Key,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-accent-blue to-accent-cyan px-6 py-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
              Operator Overview
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Token 使用总览</h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-white/80">
              直接读取请求账本里的 token、费用和复核状态，作为团队模型出口的第一视图。
            </p>
          </div>
          <Badge variant="secondary" className="w-fit bg-white text-accent-blue hover:bg-white">
            {overviewQuery.isFetching ? "正在更新" : "实时账本"}
          </Badge>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg bg-white/10 p-4">
              <div className="flex items-center gap-2">
                <metric.icon className="h-4 w-4 text-white/65" />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/65">
                  {metric.label}
                </p>
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{metric.value}</p>
              <p className="mt-2 text-sm leading-6 text-white/75">{metric.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>真实消耗摘要</CardTitle>
            <CardDescription>
              这里不再使用示例数据，只展示当前账号请求日志累计出的 token 和费用。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">总 token</p>
                <p className="mt-2 text-3xl font-semibold">{formatInteger(overview.totalTokens)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">结算费用</p>
                <p className="mt-2 text-3xl font-semibold">{formatUsd(overview.settlementPriceUsd)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">成功 / 复核</p>
                <p className="mt-2 text-3xl font-semibold">
                  {formatInteger(overview.successfulRequests)} / {formatInteger(overview.reviewRequiredRequests)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>快捷操作</CardTitle>
            <CardDescription>从账本摘要进入最常见的运维动作。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "查看 Key 与权限", to: "/tokens" as const, icon: Key },
              { label: "巡检渠道与路由", to: "/channels" as const, icon: Layers },
              { label: "排查请求日志", to: "/logs" as const, icon: ScrollText },
            ].map((item) => (
              <Button key={item.label} variant="outline" className="w-full justify-start" asChild>
                <Link to={item.to}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
