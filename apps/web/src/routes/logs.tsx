import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppApi } from "../lib/api-client";
import {
  formatDateTime,
  formatDuration,
  formatTokenSummary,
  formatUsd,
  getRequestStatusLabel,
  parseUsd,
} from "../lib/log-format";

const logsQueryKey = (apiTokenId: string, page: number, pageSize: number) =>
  ["logs", apiTokenId, page, pageSize] as const;
const tokensQueryKey = ["tokens"] as const;

type LogsRouteApi = Pick<AppApi, "listLogs" | "listTokens">;

function statusBadgeVariant(status: string): "success" | "destructive" | "warning" | "secondary" {
  if (status === "success") return "success";
  if (status === "upstream_error" || status === "stream_failed" || status === "validation_failed" || status === "quota_rejected") return "destructive";
  if (status === "review_required") return "warning";
  return "secondary";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function LogsRouteComponent({
  api,
  onInspectLog,
  detailPanel,
}: {
  api: LogsRouteApi;
  onInspectLog?: (logId: string) => void;
  detailPanel?: ReactNode;
}) {
  const [apiTokenId, setApiTokenId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const logsQuery = useQuery({
    queryKey: logsQueryKey(apiTokenId, page, pageSize),
    queryFn: () =>
      api.listLogs({
        ...(apiTokenId ? { apiTokenId } : {}),
        page,
        pageSize,
      }),
  });
  const tokensQuery = useQuery({ queryKey: tokensQueryKey, queryFn: () => api.listTokens() });
  const logs = logsQuery.data?.logs ?? [];
  const pagination = logsQuery.data?.pagination ?? {
    page,
    pageSize,
    total: logs.length,
    totalPages: Math.max(1, Math.ceil(logs.length / pageSize)),
  };
  const tokens = tokensQuery.data?.tokens ?? [];
  const fallbackInputTokens = logs.reduce((total, log) => total + (log.inputTokens ?? 0), 0);
  const fallbackCachedInputTokens = logs.reduce((total, log) => total + (log.cachedInputTokens ?? 0), 0);
  const fallbackOutputTokens = logs.reduce((total, log) => total + (log.outputTokens ?? 0), 0);
  const fallbackSummary = {
    totalRequests: pagination.total,
    successfulRequests: logs.filter((log) => log.requestStatus === "success").length,
    attentionRequests: logs.filter((log) => log.requestStatus !== "success").length,
    totalTokens: fallbackInputTokens + fallbackOutputTokens,
    inputTokens: fallbackInputTokens,
    cachedInputTokens: fallbackCachedInputTokens,
    outputTokens: fallbackOutputTokens,
    settlementPriceUsd: logs.reduce((total, log) => total + parseUsd(log.settlementPriceUsd), 0).toFixed(4),
  };
  const summary = logsQuery.data?.summary ?? fallbackSummary;

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="rounded-xl bg-gradient-to-r from-accent-blue to-accent-cyan px-6 py-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
              Request Ledger
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">请求日志</h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-white/80">
              以单次请求为粒度展示接口类型、最终路由、token 消耗、上游原价与本地结算费用。
            </p>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "请求总数",
            value: formatInteger(summary.totalRequests),
            detail: `${formatInteger(summary.successfulRequests)} 次成功`,
          },
          {
            label: "Token 总数",
            value: formatInteger(summary.totalTokens),
            detail: `输入 ${formatInteger(summary.inputTokens)} / 缓存 ${formatInteger(summary.cachedInputTokens)} / 输出 ${formatInteger(summary.outputTokens)}`,
          },
          {
            label: "待关注",
            value: formatInteger(summary.attentionRequests),
            detail: "异常、失败或待复核",
          },
          {
            label: "累计结算",
            value: formatUsd(summary.settlementPriceUsd),
            detail: "当前筛选条件下费用合计",
          },
        ].map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">{m.label}</p>
              <CardTitle className="text-3xl">{m.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{m.detail}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Request Ledger</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="log-token-filter" className="text-xs font-medium text-muted-foreground">
                  按令牌筛选
                </label>
                <select
                  id="log-token-filter"
                  className="flex h-9 min-w-48 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={apiTokenId}
                  onChange={(event) => {
                    setApiTokenId(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">全部令牌</option>
                  {tokens.map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>请求</TableHead>
                <TableHead>路由结果</TableHead>
                <TableHead>Token / 费用</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <p className="font-medium">{log.endpointType}</p>
                    <p className="text-sm font-medium text-primary">{log.logicalModelAlias}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(log.startedAt)}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{log.finalUpstreamModelId ?? "--"}</p>
                    <p className="text-xs text-muted-foreground">HTTP {log.httpStatusCode ?? "--"} / {formatDuration(log.durationMs)}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{formatUsd(log.settlementPriceUsd)}</p>
                    <p className="text-xs text-muted-foreground">上游 {formatUsd(log.rawUpstreamPriceUsd)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatTokenSummary(log.inputTokens, log.outputTokens, log.cachedInputTokens)}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(log.requestStatus)}>{getRequestStatusLabel(log.requestStatus)}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{log.errorSummary ?? "无错误摘要"}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => onInspectLog?.(log.id)}>
                      查看详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              第 {pagination.page} / {pagination.totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {detailPanel}
    </div>
  );
}
