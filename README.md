# LLM Router

面向小团队私有部署的 LLM 中转站 MVP。

项目目标不是做一个功能巨多的网关，而是把最核心的能力先做扎实：

- 控制台登录与用户会话
- 用户级渠道管理
- 逻辑模型映射与路由
- 令牌创建、预算、过期、吊销
- OpenAI 风格接口转发
- 请求日志、路由尝试、token 消耗与费用结算

当前已覆盖的对外网关接口：

- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `POST /v1/responses`

## 1. 适用场景

这套项目目前适合：

- 小团队私有部署
- 只有管理员和少量内部用户
- 需要通过统一入口接多个上游渠道
- 需要知道每次请求命中了哪个渠道、用了多少 token、按什么价格表结算

这套项目当前不追求：

- 复杂的多租户计费体系
- 大规模公网运营级高可用
- 完整覆盖 OpenAI 全部长尾特性

## 2. 技术栈

- 后端：Fastify + Drizzle ORM + PostgreSQL
- 前端：React + TanStack Router + TanStack Query + Tailwind CSS
- 包管理：pnpm workspace
- 测试：Vitest + Playwright
- 运行方式：本地开发 / Docker Compose 私有部署

## 3. 仓库结构

```text
.
├── apps/
│   ├── api/        # Fastify API、网关、认证、日志、结算
│   └── web/        # 控制台前端
├── packages/
│   └── shared/     # OpenAI 风格请求/响应 schema
├── docker-compose.yml
└── README.md
```

## 4. 环境要求

- Node.js 20+
- pnpm 10+
- Docker / Docker Compose
- PostgreSQL 16（如果不用 Compose，需要自己准备）

## 5. 快速开始

推荐两种启动方式：

- 开发调试：`pnpm + 本地 postgres`
- 私有部署：`docker compose`

如果你只是想先把系统跑起来，优先看“Docker Compose 部署”。

## 6. 部署前必须知道的事情

### 6.1 管理员账号有默认值

默认管理员账号来自环境变量：

```text
ADMIN_EMAIL=admin
```

默认管理员密码是：

```text
admin123
```

对应的 Argon2 哈希由 `ADMIN_PASSWORD_HASH` 决定；如果不设置环境变量，Compose 和 API 默认会使用 `admin123` 的哈希。

如果把 Argon2 哈希写进 `.env`，建议用单引号包起来，例如 `ADMIN_PASSWORD_HASH='$argon2id$...'`，避免 Docker Compose 把 `$` 当作环境变量插值。

### 6.2 生产部署建议改掉默认密码

如果部署到公网或多人可访问环境，建议自己生成新的 `ADMIN_PASSWORD_HASH`，避免继续使用默认密码。

### 6.3 Token 列表里的 UUID 不是原始令牌

控制台“令牌管理”页中，列表显示的是“令牌 ID”，不是可调用的 Bearer token。

真正能给 SDK、Codex、脚本使用的原始 token：

- 只在创建成功当次回显
- 通常长这样：`rt_xxx`

如果你把列表里的 UUID 当成 token 去调用网关，接口会返回 `401 Unauthorized`。

## 7. Docker Compose 部署

### 7.1 复制环境变量文件

```bash
cp .env.example .env
```

### 7.2 可选：生成管理员密码哈希

先安装依赖：

```bash
pnpm install
```

如果要覆盖默认密码，用你想作为管理员密码的原始密码生成 Argon2 哈希：

```bash
pnpm --filter @router/api exec node --input-type=module -e "import argon2 from 'argon2'; console.log(await argon2.hash('your-password'))"
```

把输出结果填进 `.env`。如果只是本地或内网测试，可以不设置这两项，直接使用默认 `admin / admin123`：

```env
ADMIN_EMAIL=admin
ADMIN_PASSWORD_HASH='$argon2id$...'
CHANNEL_KEY_ENCRYPTION_SECRET=请替换成至少32位的高强度随机字符串
```

说明：

- `ADMIN_EMAIL` 不改就是 `admin`
- `ADMIN_PASSWORD_HASH` 不改就是 `admin123` 对应的哈希
- `CHANNEL_KEY_ENCRYPTION_SECRET` 必须至少 32 位，且部署后保持稳定，不能频繁变

### 7.3 启动服务

```bash
docker compose up --build -d
```

默认会启动：

- `postgres`
- `api`
- `web`

访问地址：

- 控制台：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:3001`

### 7.4 首次登录

使用你在上一步设置的管理员信息：

- 账号：`ADMIN_EMAIL`，默认 `admin`
- 密码：生成 `ADMIN_PASSWORD_HASH` 时使用的原始密码，默认 `admin123`

### 7.5 Compose 模式的实际行为

当前 `docker-compose.yml` 的行为是：

- `api` 启动时会自动执行数据库迁移
- `api` 启动时会自动执行管理员 seed
- `web` 当前运行的是 Vite 服务，适合内网 MVP / 验收环境

这套 Compose 更接近“可部署的开发态/验收态”，不是做过公网强化的最终生产方案。

如果你要长期对外提供服务，建议后续补：

- Nginx / Caddy 反向代理
- HTTPS / TLS
- 更严格的管理员初始化流程
- 备份策略
- 日志归档与告警

## 8. 本地开发启动

### 8.1 准备环境变量

```bash
cp .env.example .env
```

最少需要设置：

- `ADMIN_PASSWORD_HASH`
- `CHANNEL_KEY_ENCRYPTION_SECRET`

如果你要测试私网或本地上游渠道，可以把：

```env
ALLOW_PRIVATE_UPSTREAM_BASE_URLS=true
```

### 8.2 启动 PostgreSQL

```bash
docker compose up -d postgres
```

### 8.3 安装依赖

```bash
pnpm install
```

### 8.4 执行迁移并初始化管理员

```bash
pnpm --filter @router/api db:migrate
pnpm --filter @router/api db:seed-admin
```

### 8.5 启动前后端

```bash
pnpm dev
```

访问：

- Web：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:3001`

## 9. 使用说明

### 9.1 登录控制台

登录页路径：

```text
/login
```

登录后可进入：

- 总览
- 渠道策略
- 令牌管理
- 请求日志

### 9.2 新增渠道

进入“渠道策略”页面，点击“新增渠道”。

需要填写：

- `name`：渠道名称，自己识别用
- `provider`：供应商类型
- `apiKey`：上游渠道密钥

如果选择的是内置供应商，只需要填写渠道名称和 API Key：

- OpenAI：自动使用 `https://api.openai.com/v1`
- Anthropic：自动使用 `https://api.anthropic.com/v1`，并调用 `/messages`
- DeepSeek：自动使用 `https://api.deepseek.com`

系统会同时创建一个默认渠道模型，后续可以在渠道详情抽屉里继续增删改模型、价格和路由。

如果选择的是 `OpenAI Compatible`，才需要手动填写：

- `baseUrl`：上游 API 根地址
- `defaultModelId`：这个渠道默认测试模型

`baseUrl` 该怎么填，取决于上游接口实际挂在哪：

- 如果上游接口是 `/v1/chat/completions`、`/v1/responses` 这种形式，填 `https://host/v1`
- 如果上游接口直接是 `/chat/completions`、`/responses`，填 `https://host`

示例：

- OpenAI 官方：`https://api.openai.com/v1`
- 你当前接的 heiyucode：`https://www.heiyucode.com`

填完后先点“测试渠道”。

当前系统会根据渠道供应商和实际入口路径自动转发到：

- `/chat/completions`
- `/embeddings`
- `/responses`
- Anthropic 渠道会转成 Messages API 调用，返回结果再标准化成 OpenAI 风格响应

### 9.3 新建逻辑模型

逻辑模型是对外暴露给客户端的“模型别名”。

进入“渠道策略”页面下半区，填写：

- `alias`：对外模型名，例如 `gpt-5.4`
- `description`：说明，可选
- `routes`：路由规则

每条路由需要填写：

- `channelId`：选用哪个渠道
- `upstreamModelId`：真正发给上游的模型名
- `inputPricePer1m`：输入价格，按每 1M token
- `outputPricePer1m`：输出价格，按每 1M token
- `currency`：币种，当前通常写 `USD`
- `priority`：优先级，数字越小越先尝试

非常重要：

- `alias` 是给客户端看到的名字
- `upstreamModelId` 是发给上游的真实模型名

例如你想让 Codex 使用：

- 对外别名：`gpt-5.4`
- 上游真实模型：`gpt-5.4`

那就配置成：

- `alias = gpt-5.4`
- `upstreamModelId = gpt-5.4`

不要把 `upstreamModelId` 写成 `openai` 这种分组名，否则上游会报模型不可用。

### 9.4 新建令牌

进入“令牌管理”，点击“新建令牌”。

填写：

- `name`：令牌名称
- `logicalModelId`：绑定的逻辑模型
- `budgetLimitUsd`：预算上限
- `expiresAt`：过期时间，可选

创建成功后：

- 弹窗会首次显示原始 token，并提供复制按钮
- 这个 token 才能给 SDK / Codex 使用
- 列表里的 token 默认脱敏显示，可以按需点击显示或快速复制

建议创建后立刻复制并保存，因为原始 token 只展示一次。

### 9.5 查看请求日志

请求日志会记录：

- 请求入口类型
- 命中的逻辑模型
- 最终命中的渠道
- 最终上游模型
- 尝试次数与失败阶段
- token 消耗
- 本地结算价
- 上游原价（如果上游有返回）

### 9.6 日志状态说明

- `成功`：请求成功，且已完成自动结算
- `需复核`：请求成功，但没有拿到可自动结算的 usage，系统不会自动推进预算
- `上游错误`：请求没有成功返回业务结果
- `流中断`：流式返回过程中发生协议或连接错误

“需复核”最常见的原因有两个：

- 上游没返回 usage
- 上游 usage 结构不完整，无法计算输入/输出 token

### 9.7 为什么日志里费用可能显示 `$0.0000`

当前费用显示保留 4 位小数。

如果你设置的价格表是按 `1 / 1M` 计费，而一次请求只用了几十个 token，那么理论费用可能是：

```text
$0.000025
```

显示到 4 位小数就会变成：

```text
$0.0000
```

这不代表没记账，而是金额太小被四舍五入了。

## 10. OpenAI 风格调用示例

### 10.1 `chat/completions`

```bash
curl http://127.0.0.1:3001/v1/chat/completions \
  -H "Authorization: Bearer rt_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [
      { "role": "user", "content": "hello" }
    ]
  }'
```

### 10.2 `responses`

```bash
curl http://127.0.0.1:3001/v1/responses \
  -H "Authorization: Bearer rt_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "input": "reply with ok"
  }'
```

### 10.3 `embeddings`

```bash
curl http://127.0.0.1:3001/v1/embeddings \
  -H "Authorization: Bearer rt_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embedding-default",
    "input": "hello"
  }'
```

## 11. 如何配置 Codex

如果你的目标链路是：

```text
Codex -> 你的 router -> 上游渠道
```

那么 Codex 配置里：

- `base_url` 必须指向 router
- 不是前端 `3000`
- 也不是上游渠道地址

### 11.1 在 router 里先准备好这三样

1. 一个可用渠道
2. 一个逻辑模型
3. 一枚绑定该逻辑模型的原始 token

建议让逻辑模型 alias 直接叫：

```text
gpt-5.4
```

这样和 Codex 侧 `model = "gpt-5.4"` 能直接对齐。

### 11.2 修改 `~/.codex/config.toml`

本地部署时：

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
model_provider = "router"
model = "gpt-5.4"
model_reasoning_effort = "xhigh"
plan_mode_reasoning_effort = "xhigh"
model_reasoning_summary = "detailed"
network_access = "enabled"
disable_response_storage = true
windows_wsl_setup_acknowledged = true
model_verbosity = "high"

[model_providers.router]
name = "router"
base_url = "http://127.0.0.1:3001/v1"
wire_api = "responses"
requires_openai_auth = true
```

如果你是域名部署，把：

```toml
base_url = "http://127.0.0.1:3001/v1"
```

改成：

```toml
base_url = "https://your-router.example.com/v1"
```

### 11.3 用 router token 登录 Codex

执行：

```bash
codex login --with-api-key
```

输入的必须是 router 控制台创建出来的原始 token，例如：

```text
rt_xxx
```

不是：

- 上游渠道的 API Key
- 令牌列表里的 UUID

### 11.4 验证登录态

```bash
codex login status
```

如果显示的是 `rt_...` 这类 token，说明 Codex 现在会先打你的 router。

## 12. 如何配置 Claude Code

Claude Code 使用 Anthropic Messages 格式，不走 OpenAI 风格的 `/v1/responses`。

本地开发时，`ANTHROPIC_BASE_URL` 要指向 API 服务：

```text
http://127.0.0.1:3001
```

不要写成前端端口，也不要写成上游 DeepSeek 地址：

- 前端 Vite 常见是 `5173`
- Docker Web 常见是 `3000`
- API 默认是 `3001`

### 12.1 在 router 里准备 DeepSeek 渠道

建议：

- 渠道供应商选择 `DeepSeek`
- 只填写 DeepSeek API Key
- 逻辑模型 alias 使用 `deepseek-v4-pro`
- 渠道模型 `upstreamModelId` 使用 `deepseek-v4-pro`
- 创建一枚绑定该逻辑模型的 router token

Claude Code 侧可以带 `[1m]` 后缀，router 会把 `deepseek-v4-pro[1m]` 匹配到逻辑模型 `deepseek-v4-pro`。

### 12.2 修改 `~/.claude/settings.json`

示例：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:3001",
    "ANTHROPIC_AUTH_TOKEN": "rt_xxx",
    "ANTHROPIC_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro[1m]",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"
  }
}
```

`ANTHROPIC_AUTH_TOKEN` 填 router 里创建出来的原始 `rt_...` token，不要填 DeepSeek API Key。

如果 Claude Code 提示同时存在 `ANTHROPIC_AUTH_TOKEN` 和 `/login` 登录态，先执行：

```bash
claude /logout
```

这样 Claude Code 会使用 settings 里的 router token。

router 同时兼容这些 Anthropic Messages 入站路径：

- `POST /v1/messages`
- `POST /v1/anthropic/messages`
- `POST /v1/anthropic/v1/messages`

## 13. 常见问题

### 13.1 登录控制台失败

常见原因：

- `ADMIN_PASSWORD_HASH` 不是有效 Argon2 哈希
- 你输入的密码和生成哈希时用的原始密码不一致
- 管理员账号已经存在，但你后来改了 `.env`，seed 不会覆盖旧账号
- 默认登录信息是 `admin / admin123`

### 13.2 调用网关返回 `401 Unauthorized`

优先检查：

- 你是不是用了“令牌 ID”而不是原始 `rt_...`
- token 是否已吊销
- token 是否已过期
- token 预算是否耗尽
- token 绑定的逻辑模型是否仍为 `active`

### 13.3 返回 `Model route not found`

说明请求里的 `model` 找不到对应逻辑模型路由。

检查：

- 客户端传入的 `model`
- 逻辑模型 alias
- 该逻辑模型下是否存在 active route

### 13.4 上游报模型不可用

说明 `upstreamModelId` 配错了。

比如：

- 客户端传入 `gpt-5.4`
- router 找到逻辑模型 `gpt-5.4`
- 但 route 里把 `upstreamModelId` 写成了 `openai`

那 router 最终转发给上游的就是错误模型名。

### 13.5 请求成功但显示“需复核”

这表示请求本身成功，但系统没拿到可自动结算的 usage。

后果是：

- 不会自动计算本地结算
- 不会自动推进 token 已用预算

### 13.6 日志中看不到“上游原价”

只有当上游在响应里明确返回类似 `cost_usd` / `total_cost_usd` 之类字段时，系统才能展示“上游原价”。

如果上游没给，只能展示本地价格表结算结果。

## 14. 测试

### 14.1 单元 / 集成测试

```bash
pnpm test
```

### 14.2 E2E

```bash
pnpm e2e
```

或单独运行：

```bash
pnpm exec playwright test apps/web/e2e/router-admin.spec.ts
```

## 14. 当前边界

- `responses` 已覆盖常用 JSON / SSE 场景，但未对 OpenAI 所有长尾字段做完整兼容
- 当前 Web 端没有复杂筛选、搜索、批量操作
- 管理用户能力目前主要在 API 侧，前端控制台还没有完整用户管理页面
- Compose 更偏内网 MVP / 验收态，不是完全生产化模板


如果后续还要补 License、仓库描述、标签或发布页，再直接在 GitHub 上完善即可。
