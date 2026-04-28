import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { AppApi, ChannelModelRecord, LogicalModelRecord, UpdateChannelInput } from "../lib/api-client";
import { Loader2, Pencil, Plus, Route, TestTube } from "lucide-react";

const channelsQueryKey = ["channels"] as const;
const channelDetailQueryKey = (channelId: string | null) => ["channel-detail", channelId] as const;

type LogicalRouteFormState = {
  channelModelId: string;
  priority: string;
};

type LogicalModelFormState = {
  alias: string;
  description: string;
  routes: LogicalRouteFormState[];
};

function createEmptyLogicalRoute(priority = "1"): LogicalRouteFormState {
  return {
    channelModelId: "",
    priority,
  };
}

function createEmptyLogicalModelForm(): LogicalModelFormState {
  return {
    alias: "",
    description: "",
    routes: [createEmptyLogicalRoute()],
  };
}

type ChannelsRouteApi = Pick<
  AppApi,
  | "listChannels"
  | "getChannelDetail"
  | "createChannel"
  | "updateChannel"
  | "deleteChannel"
  | "createChannelModel"
  | "updateChannelModel"
  | "deleteChannelModel"
  | "testChannel"
  | "createLogicalModel"
  | "updateLogicalModel"
  | "deleteLogicalModel"
>;

function formatDateTime(value: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getTestStatusLabel(status: string | null) {
  if (status === "ok") return "最近测试通过";
  if (status === "failed") return "最近测试失败";
  return "未测试";
}

export function ChannelsRouteComponent({ api }: { api: ChannelsRouteApi }) {
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isEditChannelOpen, setIsEditChannelOpen] = useState(false);
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [isCreateLogicalModelOpen, setIsCreateLogicalModelOpen] = useState(false);
  const [editingLogicalModelId, setEditingLogicalModelId] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState({ name: "", baseUrl: "", apiKey: "", defaultModelId: "" });
  const [editChannelForm, setEditChannelForm] = useState({ name: "", baseUrl: "", apiKey: "", defaultModelId: "" });
  const [modelForm, setModelForm] = useState({
    upstreamModelId: "",
    inputPricePer1m: "0.0000",
    outputPricePer1m: "0.0000",
    currency: "USD",
  });
  const [editModelForm, setEditModelForm] = useState({
    upstreamModelId: "",
    inputPricePer1m: "0.0000",
    outputPricePer1m: "0.0000",
    currency: "USD",
  });
  const [logicalModelForm, setLogicalModelForm] = useState<LogicalModelFormState>(() => createEmptyLogicalModelForm());
  const [editLogicalModelForm, setEditLogicalModelForm] = useState<LogicalModelFormState>(() => createEmptyLogicalModelForm());

  const channelsQuery = useQuery({ queryKey: channelsQueryKey, queryFn: () => api.listChannels() });
  const channelDetailQuery = useQuery({
    queryKey: channelDetailQueryKey(selectedChannelId),
    queryFn: () => api.getChannelDetail(selectedChannelId!),
    enabled: Boolean(selectedChannelId),
  });

  const channels = channelsQuery.data?.channels ?? [];
  const selectedDetail = channelDetailQuery.data;
  const selectedChannel = selectedDetail?.channel ?? channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const channelModels = selectedDetail?.models ?? [];
  const channelLogicalModels = selectedDetail?.logicalModels ?? [];
  const activeChannels = channels.filter((channel) => channel.status === "active").length;
  const testedChannels = channels.filter((channel) => channel.lastTestStatus === "ok").length;
  const activeModelOptions = useMemo(
    () => channelModels.filter((model) => model.status === "active"),
    [channelModels],
  );

  const invalidateChannels = async () => {
    await queryClient.invalidateQueries({ queryKey: channelsQueryKey });
    if (selectedChannelId) {
      await queryClient.invalidateQueries({ queryKey: channelDetailQueryKey(selectedChannelId) });
    }
  };

  const createChannelMutation = useMutation({
    mutationFn: () => api.createChannel(channelForm),
    onSuccess: async () => {
      setChannelForm({ name: "", baseUrl: "", apiKey: "", defaultModelId: "" });
      setIsCreateChannelOpen(false);
      await invalidateChannels();
      toast.success("渠道已创建");
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: () => {
      const input: UpdateChannelInput = {
        name: editChannelForm.name,
        baseUrl: editChannelForm.baseUrl,
        defaultModelId: editChannelForm.defaultModelId,
      };

      if (editChannelForm.apiKey.trim()) {
        input.apiKey = editChannelForm.apiKey;
      }

      return api.updateChannel(selectedChannelId!, input);
    },
    onSuccess: async () => {
      setIsEditChannelOpen(false);
      setEditChannelForm({ name: "", baseUrl: "", apiKey: "", defaultModelId: "" });
      await invalidateChannels();
      toast.success("渠道已更新");
    },
  });

  const testChannelMutation = useMutation({
    mutationFn: (channelId: string) => api.testChannel(channelId),
    onSuccess: async () => {
      await invalidateChannels();
      toast.success("渠道测试通过");
    },
    onError: () => {
      toast.error("渠道测试失败");
    },
  });

  const createModelMutation = useMutation({
    mutationFn: () => api.createChannelModel(selectedChannelId!, modelForm),
    onSuccess: async () => {
      setModelForm({
        upstreamModelId: "",
        inputPricePer1m: "0.0000",
        outputPricePer1m: "0.0000",
        currency: "USD",
      });
      setIsAddModelOpen(false);
      await invalidateChannels();
      toast.success("渠道模型已添加");
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: () =>
      api.updateChannelModel(selectedChannelId!, editingModelId!, {
        upstreamModelId: editModelForm.upstreamModelId,
        inputPricePer1m: editModelForm.inputPricePer1m,
        outputPricePer1m: editModelForm.outputPricePer1m,
        currency: editModelForm.currency,
      }),
    onSuccess: async () => {
      setEditingModelId(null);
      setEditModelForm({
        upstreamModelId: "",
        inputPricePer1m: "0.0000",
        outputPricePer1m: "0.0000",
        currency: "USD",
      });
      await invalidateChannels();
      toast.success("渠道模型已更新");
    },
  });

  const createLogicalModelMutation = useMutation({
    mutationFn: () =>
      api.createLogicalModel({
        alias: logicalModelForm.alias,
        description: logicalModelForm.description,
        routes: logicalModelForm.routes.map((route) => ({
            channelId: selectedChannelId!,
            channelModelId: route.channelModelId,
            priority: Number(route.priority),
        })),
      }),
    onSuccess: async () => {
      setLogicalModelForm(createEmptyLogicalModelForm());
      setIsCreateLogicalModelOpen(false);
      await invalidateChannels();
      toast.success("逻辑模型已创建");
    },
  });

  const updateLogicalModelMutation = useMutation({
    mutationFn: () =>
      api.updateLogicalModel(editingLogicalModelId!, {
        alias: editLogicalModelForm.alias,
        description: editLogicalModelForm.description,
        routes: editLogicalModelForm.routes.map((route) => ({
            channelId: selectedChannelId!,
            channelModelId: route.channelModelId,
            priority: Number(route.priority),
        })),
      }),
    onSuccess: async () => {
      setEditingLogicalModelId(null);
      setEditLogicalModelForm(createEmptyLogicalModelForm());
      await invalidateChannels();
      toast.success("逻辑模型已更新");
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (channelId: string) => api.deleteChannel(channelId),
    onSuccess: async () => {
      setSelectedChannelId(null);
      await invalidateChannels();
      toast.success("渠道已停用");
    },
  });

  const deleteChannelModelMutation = useMutation({
    mutationFn: (input: { channelId: string; modelId: string }) =>
      api.deleteChannelModel(input.channelId, input.modelId),
    onSuccess: async () => {
      await invalidateChannels();
      toast.success("渠道模型已停用");
    },
  });

  const deleteLogicalModelMutation = useMutation({
    mutationFn: (logicalModelId: string) => api.deleteLogicalModel(logicalModelId),
    onSuccess: async () => {
      await invalidateChannels();
      toast.success("逻辑模型已停用");
    },
  });

  const openEditChannelDialog = () => {
    if (!selectedChannel) return;

    setEditChannelForm({
      name: selectedChannel.name,
      baseUrl: selectedChannel.baseUrl,
      apiKey: "",
      defaultModelId: selectedChannel.defaultModelId,
    });
    setIsEditChannelOpen(true);
  };

  const openEditModelDialog = (model: ChannelModelRecord) => {
    setEditingModelId(model.id);
    setEditModelForm({
      upstreamModelId: model.upstreamModelId,
      inputPricePer1m: model.inputPricePer1m,
      outputPricePer1m: model.outputPricePer1m,
      currency: model.currency,
    });
  };

  const openEditLogicalModelDialog = (logicalModel: LogicalModelRecord) => {
    const routes = logicalModel.routes
      .filter((item) => item.channelId === selectedChannelId)
      .map((route) => ({
        channelModelId:
          route.channelModelId ??
          channelModels.find((model) => model.upstreamModelId === route.upstreamModelId)?.id ??
          "",
        priority: String(route.priority),
      }));

    setEditingLogicalModelId(logicalModel.id);
    setEditLogicalModelForm({
      alias: logicalModel.alias,
      description: logicalModel.description,
      routes: routes.length > 0 ? routes : [createEmptyLogicalRoute()],
    });
  };

  const addLogicalRoute = () => {
    setLogicalModelForm((current) => ({
      ...current,
      routes: [...current.routes, createEmptyLogicalRoute(String(current.routes.length + 1))],
    }));
  };

  const addEditLogicalRoute = () => {
    setEditLogicalModelForm((current) => ({
      ...current,
      routes: [...current.routes, createEmptyLogicalRoute(String(current.routes.length + 1))],
    }));
  };

  const updateLogicalRoute = (
    index: number,
    field: keyof LogicalRouteFormState,
    value: string,
  ) => {
    setLogicalModelForm((current) => ({
      ...current,
      routes: current.routes.map((route, routeIndex) =>
        routeIndex === index ? { ...route, [field]: value } : route,
      ),
    }));
  };

  const updateEditLogicalRoute = (
    index: number,
    field: keyof LogicalRouteFormState,
    value: string,
  ) => {
    setEditLogicalModelForm((current) => ({
      ...current,
      routes: current.routes.map((route, routeIndex) =>
        routeIndex === index ? { ...route, [field]: value } : route,
      ),
    }));
  };

  const removeLogicalRoute = (index: number) => {
    setLogicalModelForm((current) => ({
      ...current,
      routes: current.routes.length > 1 ? current.routes.filter((_, routeIndex) => routeIndex !== index) : current.routes,
    }));
  };

  const removeEditLogicalRoute = (index: number) => {
    setEditLogicalModelForm((current) => ({
      ...current,
      routes: current.routes.length > 1 ? current.routes.filter((_, routeIndex) => routeIndex !== index) : current.routes,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-accent-blue to-accent-cyan px-6 py-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
              Channel Console
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">渠道策略</h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-white/80">
              先维护渠道，再进入渠道详情抽屉管理模型与逻辑模型映射。
            </p>
          </div>
          <Button className="bg-white text-accent-blue hover:bg-white/90" onClick={() => setIsCreateChannelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />新增渠道
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "渠道总数", value: `${channels.length}` },
            { label: "活跃渠道", value: `${activeChannels}` },
            { label: "测试通过", value: `${testedChannels}` },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-white/10 p-4">
              <p className="font-mono text-[10px] uppercase text-white/60">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>渠道列表</CardTitle>
          <CardDescription>点击详情进入抽屉，查看该渠道的模型与逻辑模型。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>渠道</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>默认模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近测试</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => {
                const isTestingAnyChannel = testChannelMutation.isPending;
                const isTestingCurrentChannel = isTestingAnyChannel && testChannelMutation.variables === channel.id;

                return (
                  <TableRow key={channel.id}>
                    <TableCell>
                      <p className="font-medium">{channel.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{channel.id}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{channel.baseUrl}</TableCell>
                    <TableCell className="font-medium">{channel.defaultModelId}</TableCell>
                    <TableCell>
                      <Badge variant={channel.status === "active" ? "success" : "secondary"}>
                        {channel.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{getTestStatusLabel(channel.lastTestStatus)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(channel.lastTestedAt)}</p>
                      {channel.lastTestError ? <p className="mt-1 text-xs text-destructive">{channel.lastTestError}</p> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedChannelId(channel.id)}>
                          查看详情
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isTestingAnyChannel}
                          onClick={() => testChannelMutation.mutate(channel.id)}
                        >
                          {isTestingCurrentChannel ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <TestTube className="mr-2 h-3 w-3" />
                          )}
                          {isTestingCurrentChannel ? "测试中..." : "测试渠道"}
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

      <Sheet open={Boolean(selectedChannelId)} onOpenChange={(open) => !open && setSelectedChannelId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
          <SheetHeader>
            <SheetTitle>渠道详情</SheetTitle>
            <SheetDescription>
              查看 {selectedChannel?.name ?? "当前渠道"} 的上游模型、逻辑模型映射和测试状态。
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {selectedChannel ? (
              <div className="rounded-lg border bg-muted/30 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">Channel</p>
                    <h3 className="mt-2 text-2xl font-semibold">{selectedChannel.name}</h3>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selectedChannel.baseUrl}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={openEditChannelDialog}>
                      <Pencil className="mr-2 h-4 w-4" />编辑渠道
                    </Button>
                    <Button
                      variant="outline"
                      className="text-destructive"
                      onClick={() => deleteChannelMutation.mutate(selectedChannel.id)}
                    >
                      停用渠道
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">渠道模型</h3>
                <Button variant="outline" size="sm" onClick={() => setIsAddModelOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />添加模型
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>上游模型</TableHead>
                    <TableHead>价格</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelModels.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell className="font-medium">{model.upstreamModelId}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {model.inputPricePer1m} / {model.outputPricePer1m} {model.currency}
                      </TableCell>
                      <TableCell>
                        <Badge variant={model.status === "active" ? "success" : "secondary"}>{model.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`编辑 ${model.upstreamModelId}`}
                            onClick={() => openEditModelDialog(model)}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteChannelModelMutation.mutate({ channelId: model.channelId, modelId: model.id })}
                          >
                            停用
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">逻辑模型</h3>
                <Button variant="outline" size="sm" onClick={() => setIsCreateLogicalModelOpen(true)}>
                  <Route className="mr-2 h-4 w-4" />新建逻辑模型
                </Button>
              </div>
              <div className="space-y-3">
                {channelLogicalModels.map((logicalModel) => (
                  <div key={logicalModel.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{logicalModel.alias}</h4>
                          <Badge variant={logicalModel.status === "active" ? "success" : "secondary"}>
                            {logicalModel.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{logicalModel.description || "未填写说明"}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`编辑 ${logicalModel.alias}`}
                          onClick={() => openEditLogicalModelDialog(logicalModel)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => deleteLogicalModelMutation.mutate(logicalModel.id)}
                        >
                          停用
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {logicalModel.routes.map((route) => (
                        <div key={route.id} className="rounded-md bg-muted/50 p-3 text-sm">
                          <p className="font-medium">{route.upstreamModelId}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            priority {route.priority} / {route.inputPricePer1m} / {route.outputPricePer1m}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={isCreateChannelOpen} onOpenChange={setIsCreateChannelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增渠道</DialogTitle>
            <DialogDescription>接入一个 OpenAI-compatible 上游。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Label htmlFor="channel-name">渠道名称</Label>
            <Input id="channel-name" value={channelForm.name} onChange={(event) => setChannelForm((c) => ({ ...c, name: event.target.value }))} />
            <Label htmlFor="channel-base-url">Base URL</Label>
            <Input id="channel-base-url" value={channelForm.baseUrl} onChange={(event) => setChannelForm((c) => ({ ...c, baseUrl: event.target.value }))} />
            <Label htmlFor="channel-api-key">API Key</Label>
            <Input id="channel-api-key" value={channelForm.apiKey} onChange={(event) => setChannelForm((c) => ({ ...c, apiKey: event.target.value }))} />
            <Label htmlFor="channel-default-model">默认测试模型</Label>
            <Input id="channel-default-model" value={channelForm.defaultModelId} onChange={(event) => setChannelForm((c) => ({ ...c, defaultModelId: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button onClick={() => createChannelMutation.mutate()}>保存渠道</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditChannelOpen} onOpenChange={setIsEditChannelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑渠道</DialogTitle>
            <DialogDescription>更新渠道名称、地址、测试模型，API Key 留空则保持不变。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Label htmlFor="edit-channel-name">渠道名称</Label>
            <Input id="edit-channel-name" value={editChannelForm.name} onChange={(event) => setEditChannelForm((c) => ({ ...c, name: event.target.value }))} />
            <Label htmlFor="edit-channel-base-url">Base URL</Label>
            <Input id="edit-channel-base-url" value={editChannelForm.baseUrl} onChange={(event) => setEditChannelForm((c) => ({ ...c, baseUrl: event.target.value }))} />
            <Label htmlFor="edit-channel-api-key">API Key</Label>
            <Input id="edit-channel-api-key" value={editChannelForm.apiKey} onChange={(event) => setEditChannelForm((c) => ({ ...c, apiKey: event.target.value }))} />
            <Label htmlFor="edit-channel-default-model">默认测试模型</Label>
            <Input id="edit-channel-default-model" value={editChannelForm.defaultModelId} onChange={(event) => setEditChannelForm((c) => ({ ...c, defaultModelId: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button onClick={() => updateChannelMutation.mutate()}>保存修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddModelOpen} onOpenChange={setIsAddModelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加渠道模型</DialogTitle>
            <DialogDescription>给当前渠道增加一个可用于路由的上游模型。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Label htmlFor="channel-model-upstream-model-id">上游模型</Label>
            <Input id="channel-model-upstream-model-id" value={modelForm.upstreamModelId} onChange={(event) => setModelForm((c) => ({ ...c, upstreamModelId: event.target.value }))} />
            <Label htmlFor="channel-model-input-price">输入价格 / 1M</Label>
            <Input id="channel-model-input-price" value={modelForm.inputPricePer1m} onChange={(event) => setModelForm((c) => ({ ...c, inputPricePer1m: event.target.value }))} />
            <Label htmlFor="channel-model-output-price">输出价格 / 1M</Label>
            <Input id="channel-model-output-price" value={modelForm.outputPricePer1m} onChange={(event) => setModelForm((c) => ({ ...c, outputPricePer1m: event.target.value }))} />
            <Label htmlFor="channel-model-currency">币种</Label>
            <Input id="channel-model-currency" value={modelForm.currency} onChange={(event) => setModelForm((c) => ({ ...c, currency: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button onClick={() => createModelMutation.mutate()}>保存模型</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingModelId)} onOpenChange={(open) => !open && setEditingModelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑渠道模型</DialogTitle>
            <DialogDescription>修改该渠道内模型标识、价格和币种。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Label htmlFor="edit-channel-model-upstream-model-id">上游模型</Label>
            <Input id="edit-channel-model-upstream-model-id" value={editModelForm.upstreamModelId} onChange={(event) => setEditModelForm((c) => ({ ...c, upstreamModelId: event.target.value }))} />
            <Label htmlFor="edit-channel-model-input-price">输入价格 / 1M</Label>
            <Input id="edit-channel-model-input-price" value={editModelForm.inputPricePer1m} onChange={(event) => setEditModelForm((c) => ({ ...c, inputPricePer1m: event.target.value }))} />
            <Label htmlFor="edit-channel-model-output-price">输出价格 / 1M</Label>
            <Input id="edit-channel-model-output-price" value={editModelForm.outputPricePer1m} onChange={(event) => setEditModelForm((c) => ({ ...c, outputPricePer1m: event.target.value }))} />
            <Label htmlFor="edit-channel-model-currency">币种</Label>
            <Input id="edit-channel-model-currency" value={editModelForm.currency} onChange={(event) => setEditModelForm((c) => ({ ...c, currency: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button onClick={() => updateModelMutation.mutate()}>保存模型修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateLogicalModelOpen} onOpenChange={setIsCreateLogicalModelOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建逻辑模型</DialogTitle>
            <DialogDescription>逻辑模型会按优先级绑定当前渠道中的一个或多个上游模型。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Label htmlFor="logical-model-alias">逻辑模型别名</Label>
            <Input id="logical-model-alias" value={logicalModelForm.alias} onChange={(event) => setLogicalModelForm((c) => ({ ...c, alias: event.target.value }))} />
            <Label htmlFor="logical-model-description">说明</Label>
            <Textarea id="logical-model-description" value={logicalModelForm.description} onChange={(event) => setLogicalModelForm((c) => ({ ...c, description: event.target.value }))} />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>路由</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLogicalRoute}>
                  <Plus className="mr-2 h-4 w-4" />添加路由
                </Button>
              </div>
              {logicalModelForm.routes.map((route, index) => (
                <div key={index} className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor={`route-channel-model-${index}`}>渠道模型 {index + 1}</Label>
                    <select
                      id={`route-channel-model-${index}`}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={route.channelModelId}
                      onChange={(event) => updateLogicalRoute(index, "channelModelId", event.target.value)}
                    >
                      <option value="">选择模型</option>
                      {activeModelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.upstreamModelId}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`route-priority-${index}`}>优先级</Label>
                    <Input
                      id={`route-priority-${index}`}
                      type="number"
                      value={route.priority}
                      onChange={(event) => updateLogicalRoute(index, "priority", event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logicalModelForm.routes.length === 1}
                    onClick={() => removeLogicalRoute(index)}
                  >
                    移除
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createLogicalModelMutation.mutate()}>保存逻辑模型</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingLogicalModelId)} onOpenChange={(open) => !open && setEditingLogicalModelId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑逻辑模型</DialogTitle>
            <DialogDescription>调整逻辑模型别名、说明和当前渠道内的路由模型。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Label htmlFor="edit-logical-model-alias">逻辑模型别名</Label>
            <Input id="edit-logical-model-alias" value={editLogicalModelForm.alias} onChange={(event) => setEditLogicalModelForm((c) => ({ ...c, alias: event.target.value }))} />
            <Label htmlFor="edit-logical-model-description">说明</Label>
            <Textarea id="edit-logical-model-description" value={editLogicalModelForm.description} onChange={(event) => setEditLogicalModelForm((c) => ({ ...c, description: event.target.value }))} />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>路由</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEditLogicalRoute}>
                  <Plus className="mr-2 h-4 w-4" />添加路由
                </Button>
              </div>
              {editLogicalModelForm.routes.map((route, index) => (
                <div key={index} className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-route-channel-model-${index}`}>渠道模型 {index + 1}</Label>
                    <select
                      id={`edit-route-channel-model-${index}`}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={route.channelModelId}
                      onChange={(event) => updateEditLogicalRoute(index, "channelModelId", event.target.value)}
                    >
                      <option value="">选择模型</option>
                      {activeModelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.upstreamModelId}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-route-priority-${index}`}>优先级</Label>
                    <Input
                      id={`edit-route-priority-${index}`}
                      type="number"
                      value={route.priority}
                      onChange={(event) => updateEditLogicalRoute(index, "priority", event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={editLogicalModelForm.routes.length === 1}
                    onClick={() => removeEditLogicalRoute(index)}
                  >
                    移除
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => updateLogicalModelMutation.mutate()}>保存逻辑模型修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
