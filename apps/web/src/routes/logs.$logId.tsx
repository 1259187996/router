import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppApi, LogDetailRouteRecord } from "../lib/api-client";
import {
  formatDateTime,
  formatDuration,
  formatJson,
  formatTokenSummary,
  formatUsd,
  getAttemptStatusLabel,
  getFailureStageLabel,
  getRequestStatusLabel,
} from "../lib/log-format";

const logDetailQueryKey = (logId: string) => ["log-detail", logId] as const;

type LogDetailRouteApi = Pick<AppApi, "getLogDetail">;

function buildPriceBreakdown(
  inputTokens: number | null,
  cachedInputTokens: number | null,
  outputTokens: number | null,
  finalRoute: LogDetailRouteRecord | null,
) {
  if (!finalRoute || inputTokens == null || outputTokens == null) return [];
  const inputPrice = Number.parseFloat(finalRoute.inputPricePer1m);
  const cachedInputPrice = Number.parseFloat(finalRoute.cachedInputPricePer1m);
  const outputPrice = Number.parseFloat(finalRoute.outputPricePer1m);
  if (Number.isNaN(inputPrice) || Number.isNaN(cachedInputPrice) || Number.isNaN(outputPrice)) return [];
  const normalizedCachedInputTokens = Math.min(Math.max(cachedInputTokens ?? 0, 0), inputTokens);
  const billableInputTokens = Math.max(inputTokens - normalizedCachedInputTokens, 0);
  const breakdown = [
    { label: "输入费用", expression: `${billableInputTokens} x ${finalRoute.inputPricePer1m} / 1M`, amount: formatUsd(((billableInputTokens * inputPrice) / 1_000_000).toFixed(4)) },
  ];

  if (normalizedCachedInputTokens > 0) {
    breakdown.push({
      label: "缓存输入费用",
      expression: `${normalizedCachedInputTokens} x ${finalRoute.cachedInputPricePer1m} / 1M`,
      amount: formatUsd(((normalizedCachedInputTokens * cachedInputPrice) / 1_000_000).toFixed(4)),
    });
  }

  breakdown.push({ label: "输出费用", expression: `${outputTokens} x ${finalRoute.outputPricePer1m} / 1M`, amount: formatUsd(((outputTokens * outputPrice) / 1_000_000).toFixed(4)) });

  return breakdown;
}

function statusVariant(status: string): "success" | "destructive" | "secondary" | "warning" {
  if (status === "success" || status === "succeeded") return "success";
  if (status === "failed" || status === "upstream_error" || status === "stream_failed") return "destructive";
  if (status === "review_required") return "warning";
  return "secondary";
}

export function LogDetailRouteComponent({
  api,
  logId,
  onClose,
}: {
  api: LogDetailRouteApi;
  logId: string;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: logDetailQueryKey(logId),
    queryFn: () => api.getLogDetail(logId),
  });

  const detail = detailQuery.data;
  const log = detail?.log;
  const finalChannel = detail?.finalChannel;
  const finalRoute = detail?.finalRoute ?? null;
  const attempts = detail?.attempts ?? [];
  const priceBreakdown = buildPriceBreakdown(log?.inputTokens ?? null, log?.cachedInputTokens ?? null, log?.outputTokens ?? null, finalRoute);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
        <SheetHeader>
          <SheetTitle>请求详情</SheetTitle>
          <SheetDescription>按单次请求拆解最终命中的渠道、价格表、usage 与失败切换过程。</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Snapshot */}
          <div className="rounded-lg border bg-muted/30 p-5">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Log Snapshot</p>
            <p className="mt-2 font-mono text-sm">{logId}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {log ? `${log.endpointType} / ${log.logicalModelAlias}` : "正在载入请求详情..."}
            </p>
            <Badge className="mt-3" variant={statusVariant(log?.requestStatus ?? "in_progress")}>
              {log ? getRequestStatusLabel(log.requestStatus) : "加载中"}
            </Badge>
          </div>

          {/* Quick metrics */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "本地结算", value: formatUsd(log?.settlementPriceUsd) },
              { label: "上游原价", value: formatUsd(log?.rawUpstreamPriceUsd) },
              { label: "耗时", value: formatDuration(log?.durationMs) },
              { label: "Token", value: formatTokenSummary(log?.inputTokens, log?.outputTokens, log?.cachedInputTokens) },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-muted/50 p-4">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">{m.label}</p>
                <p className="mt-2 text-lg font-semibold">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Price breakdown */}
          {priceBreakdown.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">价格解释</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {priceBreakdown.map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/50 p-4">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{item.expression}</p>
                    <p className="mt-2 text-xl font-semibold">{item.amount}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Settlement comparison */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium">结算对照</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between"><span>本地结算</span><span className="font-mono font-medium text-foreground">{formatUsd(log?.settlementPriceUsd)}</span></div>
                <div className="flex justify-between"><span>上游原价</span><span className="font-mono font-medium text-foreground">{formatUsd(log?.rawUpstreamPriceUsd)}</span></div>
                <div className="flex justify-between"><span>完成时间</span><span className="font-medium text-foreground">{formatDateTime(log?.finishedAt)}</span></div>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium">最终路由</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between"><span>渠道</span><span className="font-medium text-foreground">{finalChannel?.name ?? "--"}</span></div>
                <div className="flex justify-between"><span>上游模型</span><span className="font-medium text-foreground">{finalRoute?.upstreamModelId ?? "--"}</span></div>
                <div className="flex justify-between"><span>价格表</span><span className="font-mono font-medium text-foreground">{finalRoute ? `${finalRoute.inputPricePer1m} / ${finalRoute.cachedInputPricePer1m} / ${finalRoute.outputPricePer1m}` : "--"}</span></div>
              </div>
            </div>
          </div>

          {/* Attempt timeline */}
          {attempts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">路由尝试时间线</h3>
                <p className="text-xs text-muted-foreground">共 {attempts.length} 次</p>
              </div>
              {attempts.map((attempt) => (
                <div key={attempt.id} className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <p className="text-base font-semibold">Attempt {attempt.attemptIndex}</p>
                    <Badge variant={statusVariant(attempt.attemptStatus)}>
                      {getAttemptStatusLabel(attempt.attemptStatus)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium">{attempt.channel.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{attempt.route.upstreamModelId ?? "--"}</p>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <p>开始：{formatDateTime(attempt.startedAt)}</p>
                    <p>结束：{formatDateTime(attempt.finishedAt)}</p>
                    <p>失败阶段：{getFailureStageLabel(attempt.failureStage)}</p>
                    <p>错误：{attempt.errorSummary ?? "--"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* JSON panels */}
          <div className="space-y-3">
            {[
              { title: "事件摘要", body: formatJson(log?.eventSummaryJson) },
              { title: "原始 Usage", body: formatJson(log?.rawUsageJson) },
              { title: "请求摘要", body: formatJson(log?.rawRequestSummary) },
            ].map((panel) => (
              <div key={panel.title} className="rounded-lg bg-muted/50 p-4">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">{panel.title}</p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs leading-6">
                  {panel.body}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
