# LLM Router

本地部署的 LLM 中转站，适合小团队把多个上游模型统一到一个本地入口里使用。

## 目前功能

- 管理员登录、登出和会话管理
- 渠道增删改查、连通性测试
- 一个逻辑模型可路由到多个渠道模型
- 令牌增删改查、脱敏展示、复制和预算控制
- OpenAI 风格接口转发
- Anthropic Messages 接口转发，方便 Claude Code 接入
- 请求日志、日志分页、按令牌筛选、抽屉查看详情
- token 消耗和费用统计

## 支持的模型格式

控制台创建渠道时可以选择供应商类型：

- `OpenAI`：只需要填写 API Key，默认使用 `https://api.openai.com/v1`
- `Anthropic`：只需要填写 API Key，默认使用 `https://api.anthropic.com/v1`
- `DeepSeek`：只需要填写 API Key，默认使用 `https://api.deepseek.com`
- `OpenAI Compatible`：用于其他兼容 OpenAI API 的服务，需要填写 `baseUrl` 和默认测试模型

当前对外支持的接口：

- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `POST /v1/responses`
- `POST /v1/messages`
- `POST /v1/anthropic/messages`
- `POST /v1/anthropic/v1/messages`

## 默认账号密码

默认管理员账号：

```text
admin
```

默认管理员密码：

```text
admin123
```

生产环境建议通过 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD_HASH` 改掉默认值。

## Docker Compose 部署

复制环境变量文件：

```bash
cp .env.example .env
```

至少建议在 `.env` 里设置：

```env
CHANNEL_KEY_ENCRYPTION_SECRET=请替换成至少32位的高强度随机字符串
```

启动：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

访问地址：

- 控制台：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:3001`

API 容器启动时会自动执行数据库迁移和管理员初始化。

## 本地开发

安装依赖：

```bash
pnpm install
```

启动 PostgreSQL：

```bash
docker compose up -d postgres
```

执行迁移和初始化：

```bash
pnpm --filter @router/api db:migrate
pnpm --filter @router/api db:seed-admin
```

启动开发服务：

```bash
pnpm dev
```

## 客户端接入

创建令牌后，用返回的原始 token 调用网关：

```bash
curl http://127.0.0.1:3001/v1/chat/completions \
  -H "Authorization: Bearer rt_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.5",
    "messages": [
      { "role": "user", "content": "hello" }
    ]
  }'
```

注意：

- `model` 填逻辑模型别名
- `rt_xxx` 是创建令牌时弹窗里显示的原始 token
- 令牌列表里的 UUID 不是可调用 token

## Codex 示例

`~/.codex/config.toml` 示例：

```toml
model_provider = "router"
model = "gpt-5.5"

[model_providers.router]
name = "router"
base_url = "http://127.0.0.1:3001/v1"
wire_api = "responses"
requires_openai_auth = true
```

然后用 router 里创建的 `rt_xxx` 登录：

```bash
codex login --with-api-key
```

## Claude Code 示例

Claude Code 走 Anthropic Messages 格式时，把 base URL 指向 API 服务：

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:3001
export ANTHROPIC_AUTH_TOKEN=rt_xxx
```

模型名填写 router 里的逻辑模型别名即可，例如：

```text
deepseek-v4-pro
```
