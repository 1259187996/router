import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppApi, TokenRecord, UpdateTokenInput } from "../lib/api-client";
import { Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

const tokensQueryKey = ["tokens"] as const;
const logicalModelsQueryKey = ["logical-models"] as const;

type TokensRouteApi = Pick<
  AppApi,
  "listTokens" | "listLogicalModels" | "getToken" | "createToken" | "updateToken" | "deleteToken"
>;
type EditableTokenStatus = NonNullable<UpdateTokenInput["status"]>;
type EditTokenForm = {
  name: string;
  logicalModelId: string;
  budgetLimitUsd: string;
  expiresAt: string | null;
  status: EditableTokenStatus | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function getTokenStatusLabel(status: TokenRecord["status"]) {
  if (status === "active") return "运行中";
  if (status === "revoked") return "已停用";
  if (status === "expired") return "已过期";
  if (status === "exhausted") return "已耗尽";
  return status;
}

function getBudgetStatusLabel(status: TokenRecord["budgetStatus"]) {
  return status === "available" ? "可用" : status === "exhausted" ? "已耗尽" : status;
}

function statusBadgeVariant(status: TokenRecord["status"]): "success" | "destructive" | "secondary" | "warning" {
  if (status === "active") return "success";
  if (status === "revoked") return "destructive";
  if (status === "expired") return "secondary";
  if (status === "exhausted") return "warning";
  return "secondary";
}

async function writeTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back for browsers or deployments where Clipboard API is blocked.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");

    if (!copied) {
      throw new Error("COPY_FAILED");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

export function TokensRouteComponent({ api }: { api: TokensRouteApi }) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [tokenToDelete, setTokenToDelete] = useState<TokenRecord | null>(null);
  const [visibleTokenIds, setVisibleTokenIds] = useState<Set<string>>(() => new Set());
  const [tokenSecretsById, setTokenSecretsById] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", logicalModelId: "", budgetLimitUsd: "", expiresAt: "" });
  const [editForm, setEditForm] = useState<EditTokenForm>({
    name: "",
    logicalModelId: "",
    budgetLimitUsd: "",
    expiresAt: null,
    status: "active",
  });

  const tokensQuery = useQuery({ queryKey: tokensQueryKey, queryFn: () => api.listTokens() });
  const logicalModelsQuery = useQuery({ queryKey: logicalModelsQueryKey, queryFn: () => api.listLogicalModels() });

  const createTokenMutation = useMutation({
    mutationFn: () =>
      api.createToken({
        name: form.name,
        logicalModelId: form.logicalModelId,
        budgetLimitUsd: form.budgetLimitUsd,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }),
    onSuccess: async (result) => {
      setNewlyCreatedToken(result.token.rawToken ?? null);
      if (result.token.rawToken) {
        setTokenSecretsById((current) => ({
          ...current,
          [result.token.id]: result.token.rawToken!,
        }));
      }
      setForm({ name: "", logicalModelId: "", budgetLimitUsd: "", expiresAt: "" });
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
      toast.success("令牌已创建");
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.deleteToken(tokenId),
    onSuccess: async (_result, tokenId) => {
      setSelectedTokenId((c) => (c === tokenId ? null : c));
      setTokenToDelete(null);
      setVisibleTokenIds((current) => {
        const next = new Set(current);
        next.delete(tokenId);
        return next;
      });
      setTokenSecretsById((current) => {
        const { [tokenId]: _deleted, ...next } = current;
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
      toast.success("令牌已删除");
    },
  });

  const updateTokenMutation = useMutation({
    mutationFn: () =>
      api.updateToken(selectedTokenId!, {
        name: editForm.name,
        logicalModelId: editForm.logicalModelId,
        budgetLimitUsd: editForm.budgetLimitUsd,
        expiresAt: editForm.expiresAt,
        ...(editForm.status ? { status: editForm.status } : {}),
      }),
    onSuccess: async () => {
      setIsEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
      toast.success("令牌已更新");
    },
  });

  const tokens = tokensQuery.data?.tokens ?? [];
  const logicalModels = logicalModelsQuery.data?.logicalModels ?? [];
  const hasLogicalModels = logicalModels.length > 0;
  const aliasById = new Map(logicalModels.map((m) => [m.id, m.alias]));
  const selectedToken = tokens.find((t) => t.id === selectedTokenId) ?? null;
  const activeCount = tokens.filter((t) => t.status === "active").length;
  const budgetLimitedCount = tokens.filter((t) => t.budgetLimitUsd !== "0.00").length;
  const expiredCount = tokens.filter((t) => t.status === "expired").length;
  const selectedModelAlias = selectedToken ? (aliasById.get(selectedToken.logicalModelId) ?? selectedToken.logicalModelId) : null;
  const canSubmit = hasLogicalModels && form.name.trim() && form.logicalModelId.trim() && form.budgetLimitUsd.trim();
  const getKnownTokenSecret = (token: TokenRecord) => tokenSecretsById[token.id] ?? token.rawToken;
  const resolveTokenSecret = async (token: TokenRecord) => {
    const knownSecret = getKnownTokenSecret(token);

    if (knownSecret) {
      return knownSecret;
    }

    try {
      const result = await api.getToken(token.id);
      const detailSecret = result.token.rawToken;

      if (!detailSecret) {
        toast.error("当前令牌不可展示，请重新创建令牌");
        return null;
      }

      setTokenSecretsById((current) => ({
        ...current,
        [token.id]: detailSecret,
      }));
      return detailSecret;
    } catch {
      toast.error("获取令牌失败，请稍后重试");
      return null;
    }
  };
  const copyText = async (token: string | undefined) => {
    if (!token) {
      toast.error("当前令牌不可复制");
      return;
    }

    try {
      await writeTextToClipboard(token);
      toast.success("令牌已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };
  const copyToken = async (token: TokenRecord) => {
    const secret = await resolveTokenSecret(token);

    if (secret) {
      await copyText(secret);
    }
  };
  const toggleTokenVisibility = async (token: TokenRecord) => {
    if (visibleTokenIds.has(token.id)) {
      setVisibleTokenIds((current) => {
        const next = new Set(current);
        next.delete(token.id);
        return next;
      });
      return;
    }

    const secret = await resolveTokenSecret(token);

    if (!secret) {
      return;
    }

    setVisibleTokenIds((current) => {
      const next = new Set(current);
      next.add(token.id);
      return next;
    });
  };
  const openEditDialog = (token: TokenRecord) => {
    setEditForm({
      name: token.name,
      logicalModelId: token.logicalModelId,
      budgetLimitUsd: token.budgetLimitUsd,
      expiresAt: token.expiresAt ?? null,
      status: token.status === "revoked" ? null : token.status,
    });
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="rounded-xl bg-gradient-to-r from-accent-blue to-accent-purple px-6 py-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">Token Console</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">令牌管理</h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-white/80">
              页面主体保持令牌表格优先，录入动作进入标准弹窗，存量令牌的预算、状态和过期信息通过详情抽屉查看。
            </p>
          </div>
          <Button className="bg-white text-accent-blue hover:bg-white/90" onClick={() => { createTokenMutation.reset(); setIsCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />新建令牌
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "令牌总数", value: `${tokens.length}`, accent: "border-l-accent-blue" },
            { label: "活跃令牌", value: `${activeCount}`, accent: "border-l-accent-green" },
            { label: "预算受控", value: `${budgetLimitedCount}`, detail: `已过期 ${expiredCount} 个`, accent: "border-l-accent-orange" },
          ].map((m) => (
            <div key={m.label} className={`rounded-lg border-l-4 ${m.accent} bg-white/10 p-4`}>
              <p className="font-mono text-[10px] uppercase text-white/60">{m.label}</p>
              <p className="mt-2 text-2xl font-semibold">{m.value}</p>
              {m.detail ? <p className="mt-1 text-sm text-white/70">{m.detail}</p> : null}
            </div>
          ))}
        </div>
      </div>

      {/* Token table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Token Inventory</p>
              <CardTitle className="mt-1">令牌列表</CardTitle>
              <CardDescription className="mt-1">运营台优先展示表格，详情放入右侧抽屉。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>令牌</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>逻辑模型</TableHead>
                <TableHead>预算</TableHead>
                <TableHead>到期时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    还没有令牌。点击右上角"新建令牌"开始发放。
                  </TableCell>
                </TableRow>
              ) : null}
              {tokens.map((token) => {
                const isTokenVisible = visibleTokenIds.has(token.id);
                const tokenSecret = getKnownTokenSecret(token);
                const displayedToken = isTokenVisible && tokenSecret ? tokenSecret : "****";

                return (
                  <TableRow key={token.id}>
                    <TableCell>
                      <p className="font-medium">{token.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{token.id}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[220px] items-center gap-2">
                        <code className="max-w-[220px] truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
                          {displayedToken}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`${isTokenVisible ? "隐藏" : "显示"} ${token.name} token`}
                          onClick={() => void toggleTokenVisibility(token)}
                        >
                          {isTokenVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`复制 ${token.name} token`}
                          onClick={() => void copyToken(token)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{aliasById.get(token.logicalModelId) ?? token.logicalModelId}</TableCell>
                    <TableCell>
                      <p className="text-sm">${token.budgetUsedUsd} / ${token.budgetLimitUsd}</p>
                      <Badge variant={token.budgetStatus === "available" ? "success" : "warning"} className="mt-1">
                        {getBudgetStatusLabel(token.budgetStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(token.expiresAt)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(token.status)}>{getTokenStatusLabel(token.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedTokenId(token.id)}>
                          查看 {token.name} 详情
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setTokenToDelete(token)}
                        >
                          <Trash2 className="mr-2 h-3 w-3" />删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(newlyCreatedToken)} onOpenChange={(open) => !open && setNewlyCreatedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>令牌已创建</DialogTitle>
            <DialogDescription>这是新令牌的完整 token，可复制后关闭弹窗。</DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md border bg-muted/40 p-4 font-mono text-sm">{newlyCreatedToken}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void copyText(newlyCreatedToken ?? undefined)}>
              <Copy className="mr-2 h-4 w-4" />复制令牌
            </Button>
            <Button type="button" onClick={() => setNewlyCreatedToken(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tokenToDelete)} onOpenChange={(open) => !open && setTokenToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除令牌</DialogTitle>
            <DialogDescription>
              删除后该 token 将立即不可用，相关历史日志仍会保留。
            </DialogDescription>
          </DialogHeader>
          {tokenToDelete ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="font-medium">{tokenToDelete.name}</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{tokenToDelete.id}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTokenToDelete(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => tokenToDelete && deleteTokenMutation.mutate(tokenToDelete.id)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Token Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) { createTokenMutation.reset(); setIsCreateOpen(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建令牌</DialogTitle>
            <DialogDescription>补充令牌名称、绑定模型、预算和过期时间。创建完成后原始 token 仅展示一次。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSubmit) createTokenMutation.mutate(); }}>
            <div className="space-y-2">
              <Label htmlFor="token-name">令牌名称</Label>
              <Input id="token-name" required value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-model">逻辑模型</Label>
              {!hasLogicalModels ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  还没有可绑定的逻辑模型。请先到渠道页创建并保存一个逻辑模型。
                </p>
              ) : null}
              <select
                id="token-model"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.logicalModelId}
                onChange={(e) => setForm((c) => ({ ...c, logicalModelId: e.target.value }))}
                disabled={!hasLogicalModels}
                required
              >
                <option value="">选择逻辑模型</option>
                {logicalModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.alias}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="token-budget">预算上限</Label>
                <Input id="token-budget" required value={form.budgetLimitUsd} onChange={(e) => setForm((c) => ({ ...c, budgetLimitUsd: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token-expires">过期时间</Label>
                <Input id="token-expires" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((c) => ({ ...c, expiresAt: e.target.value }))} />
              </div>
            </div>
            {createTokenMutation.isError ? (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                创建失败，请检查必填项和预算设置后重试。
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
              <Button type="submit" disabled={!canSubmit || createTokenMutation.isPending}>
                {createTokenMutation.isPending ? "创建中..." : "创建令牌"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Token Detail Sheet */}
      <Sheet open={selectedToken !== null} onOpenChange={(open) => { if (!open) setSelectedTokenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>令牌详情</SheetTitle>
            <SheetDescription>
              {selectedToken ? `查看 ${selectedToken.name} 的预算、绑定模型、状态与生命周期信息。` : undefined}
            </SheetDescription>
          </SheetHeader>
          {selectedToken ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-lg border bg-muted/30 p-5">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Token Snapshot</p>
                <h3 className="mt-2 text-2xl font-semibold">{selectedToken.name}</h3>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selectedToken.id}</p>
                <Badge className="mt-3" variant={statusBadgeVariant(selectedToken.status)}>{getTokenStatusLabel(selectedToken.status)}</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["绑定模型", selectedModelAlias ?? "未设置"],
                  ["预算状态", getBudgetStatusLabel(selectedToken.budgetStatus)],
                  ["预算用量", `$${selectedToken.budgetUsedUsd} / $${selectedToken.budgetLimitUsd}`],
                  ["过期时间", formatDateTime(selectedToken.expiresAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/50 p-4">
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
                    <p className="mt-2 text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border p-5">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Lifecycle</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    ["最后使用", formatDateTime(selectedToken.lastUsedAt)],
                    ["创建时间", formatDateTime(selectedToken.createdAt)],
                    ["更新时间", formatDateTime(selectedToken.updatedAt)],
                    ["逻辑模型 ID", selectedToken.logicalModelId],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="mt-1 break-all text-sm text-muted-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full" variant="outline" onClick={() => openEditDialog(selectedToken)}>
                编辑令牌
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑令牌</DialogTitle>
            <DialogDescription>调整令牌名称、绑定模型、预算、过期时间和状态。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              updateTokenMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-token-name">令牌名称</Label>
              <Input
                id="edit-token-name"
                value={editForm.name}
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-token-model">逻辑模型</Label>
              <select
                id="edit-token-model"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editForm.logicalModelId}
                onChange={(event) => setEditForm((current) => ({ ...current, logicalModelId: event.target.value }))}
              >
                {logicalModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.alias}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-token-budget">预算上限</Label>
                <Input
                  id="edit-token-budget"
                  value={editForm.budgetLimitUsd}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, budgetLimitUsd: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-token-status">状态</Label>
                <select
                  id="edit-token-status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editForm.status ?? ""}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value ? (event.target.value as EditableTokenStatus) : null,
                    }))
                  }
                >
                  {selectedToken?.status === "revoked" ? (
                    <option value="">保持已停用</option>
                  ) : null}
                  <option value="active">active</option>
                  <option value="expired">expired</option>
                  <option value="exhausted">exhausted</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-token-expires">过期时间</Label>
              <Input
                id="edit-token-expires"
                value={editForm.expiresAt ?? ""}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, expiresAt: event.target.value || null }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                取消
              </Button>
              <Button type="submit">保存令牌</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
