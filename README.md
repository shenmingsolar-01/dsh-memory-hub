# dsh-memory-hub

版本：`be-0.2.13`

多端 DSH 角色的本机记忆中枢：按来源隔离记忆、自动快照与恢复，支持分端收件箱/发件箱、离线来源并回，以及可选的支付意图配置。

**这个包是白板包，不含任何作者的个人数据、账号、路径或聊天记录。** 安装后只会保存你自己客户端写进来的数据。

<!-- FEATURES:START -->
## 它做什么

- 按 character（角色）和 source（来源，如 qq / pc / mobile）分开存记忆；
- 每个来源独立，删除一个来源不影响其他来源；
- 每次写入前自动快照，默认保留 100 份；
- 支持删除指定来源的一条记录，或恢复到最近/指定快照；
- Inbox 收件箱，支持 target 分端投递，离线时先存本地、上线再取；
- Outbox 发件箱，把消息投递到安装者自己配置的本机通道；
- /cross 一次写入并投递到指定通道；
- /memory/flush 把离线来源并回正常来源，自动去重并清空离线来源；
- 可选 payment 配置：校验金额档位、生成本地支付意图和带金额的支付地址，不处理支付凭证；
- 默认只监听 127.0.0.1，数据落在本机 ~/.dsh/memory-hub.json；
- 模型工具：安装者自己的模型可调用 memory_hub_* 自动读写本机记忆；
<!-- FEATURES:END -->

## 它不做什么

- 不自带 QQ 机器人、桌宠或聊天客户端；
- 不包含模型、不调用任何外部 AI 服务；
- 不会上传数据到云端；
- 不会自动读取你的其他插件数据。

## 安装

```bash
dsh plugin --profile <你的 profile> add <这个包的路径或 npm 包名>
```

重启该 profile 后生效。

## 配置

在 profile 的 `cordis.patch.yml` 加一条同名覆盖：

```yaml
- id: memory-hub
  config:
    host: 127.0.0.1
    port: 3177
    snapshotLimit: 100
    file: ""   # 默认 ~/.dsh/memory-hub.json
```

## HTTP API

所有请求/响应均为 JSON，已开启 CORS。

### 健康检查

```http
GET /health
```

### 一键跨端（Inbox + Outbox）

```http
POST /cross
{
  "character": "assistant",
  "from": "qq",
  "to": "qq-channel",
  "text": "我到家了"
}
```

先写入收件箱，再按 `to` 投递到已配置通道；适合「一端说一句，另一端也收到」。
### 读取

```http
GET /memory
GET /memory?character=shenshen
GET /memory/backups?character=shenshen
```

### 写入

```http
POST /memory
{
  "character": "shenshen",
  "source": "mobile",
  "history": [
    { "role": "user", "text": "在吗" },
    { "role": "assistant", "text": "在的，老爹" }
  ]
}
```

重复消息会自动去重，不会重复写入。

### 删除（只删指定来源）

```http
POST /memory/delete
{ "character": "shenshen", "source": "mobile", "text": "要删掉的那句" }
```

也可以用 `"at": 时间戳` 精确定位。

### 恢复

```http
POST /memory/restore
{ "character": "shenshen", "source": "mobile" }
```

不带 `snapshotAt` 时恢复最近一份快照；带 `snapshotAt` 可恢复指定快照。

## 跨端收件箱（Inbox）

任意一端把消息写进收件箱，其他端轮询取走。适合「QQ 让角色在鲸聊里回复」这类跨端投递。

### 写入

```http
POST /inbox
{
  "character": "assistant",
  "from": "qq",
  "text": "我到家了"
}
```

可选 `deliverTo`：写入后同时投递到已配置的通道。

### 一键跨端（Inbox + Outbox）

```http
POST /cross
{
  "character": "assistant",
  "from": "qq",
  "to": "qq-channel",
  "text": "我到家了"
}
```

先写入收件箱，再按 `to` 投递到已配置通道；适合「一端说一句，另一端也收到」。
### 读取

```http
GET /inbox?character=assistant&since=0
```

只返回 `since` 之后的新消息，避免重复显示。

客户端可以轮询这个接口做本地通知；插件本身不直接发系统通知。

**收件箱与 Outbox 默认都不含任何作者/安装者的地址、账号或数据。**
## 跨通道发送（Outbox）

插件本身不内置任何聊天通道。你可以在配置里声明自己的本机 HTTP 通道，然后调用 `/outbox` 把消息投递过去。

### 配置示例（你自己的 profile，不在本包内）

```yaml
- id: memory-hub
  config:
    channels:
      qq:
        url: http://127.0.0.1:3100/act
        body:
          who: your-character
          action: message
          text: '{{text}}'
```

`{{text}}`、`{{character}}`、`{{channel}}` 会被替换。

### 发送

```http
POST /outbox
{
  "channel": "qq",
  "character": "assistant",
  "text": "晚上好，记得吃饭"
}
```

插件会用配置里的 `url`、`method`、`headers`、`body` 发起请求，并返回目标的状态码和响应片段。

### 查看最近投递

```http
GET /outbox
```

返回最近 50 条投递记录（成功/失败都会记录）。

**默认 `channels: {}`，不带任何作者或安装者的地址、账号、ID。**
## 离线来源并回

断线时可以先写入独立来源（例如 `offline`），恢复后合并回正常来源：

```http
POST /memory/flush
{
  "character": "assistant",
  "from": "offline",
  "to": "default"
}
```

返回 `{ "ok": true, "added": N }`；合并会去重，成功后清空 `from` 来源，并保留快照。

也可以在配置里声明启动时自动并回：

```yaml
- id: memory-hub
  config:
    flush:
      - character: assistant
        from: offline
        to: default
```

**默认 `flush: []`，不会自动处理任何来源，也不含作者数据。**
## 支付配置（可选）

插件只保存支付入口配置，不处理支付凭证。

```yaml
- id: memory-hub
  config:
    payment:
      enabled: true
      provider: alipay
      checkoutUrl: https://your-provider.example/top_up
      currency: CNY
      presets: [10, 20, 50, 100, 300, 500]
```

默认 `enabled: false`、`checkoutUrl: ''`，不含任何商户号或账号。

### 读取配置

```http
GET /payment
```

### 创建支付意图

```http
POST /payment/intent
{ "amount": 50, "target": "mobile" }
```

返回金额、币种、支付方式和带金额参数的支付地址；只记录本地意图，不发起扣款。

### 查看意图

```http
GET /payment/intents
```
## 模型自动写入（Tools）

安装者自己的模型可以直接调用这些工具，把数据写进**安装者本机**的记忆中枢：

- `memory_hub_write`：写入一条或一批消息；
- `memory_hub_read`：读取指定角色/来源的最近记忆；
- `memory_hub_delete`：删除某来源的一条记录；
- `memory_hub_flush`：把离线来源并回正常来源；
- `memory_hub_payment_intent`：按配置生成支付意图。

配置：

```yaml
- id: memory-hub
  config:
    tools: true
    defaultCharacter: default
    defaultSource: model
```

默认 `tools: true`，但角色和来源都是通用名，不含任何人的数据；模型写入的内容只存在安装者自己的 `~/.dsh/memory-hub.json`。
## 数据格式

```json
{
  "version": 2,
  "characters": {
    "shenshen": {
      "sources": {
        "qq": { "history": [], "updatedAt": 0 },
        "pc": { "history": [], "updatedAt": 0 },
        "mobile": { "history": [], "updatedAt": 0 }
      },
      "snapshots": []
    }
  }
}
```

## 接入建议

- QQ 桥：每轮消息写入 `source: "qq"`；
- 电脑客户端：写入 `source: "pc"`；
- 手机网页/APP：写入 `source: "mobile"`；
- 模型回复前读取最近 N 条，作为跨端共同记忆。

## 已知限制

- 只做本机 HTTP 存储，多设备同步需要你自己加隧道或中转；
- 快照是整份来源的副本，不做逐条版本树；
- 没有鉴权，默认只监听本机；如果要监听局域网，请自行加防火墙/反代和鉴权。

## License

MIT
