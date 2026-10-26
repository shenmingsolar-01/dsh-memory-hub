# dsh-memory-hub

版本：`0.1.7.0`

多端 DSH 角色的本机记忆中枢：按来源隔离记忆、自动快照与恢复，支持分端收件箱/发件箱、离线来源并回，以及可选的支付意图配置。

**这个包不含任何个人数据、账号、路径或聊天记录。** 安装后只会保存安装者自己客户端写进来的数据。

<!-- FEATURES:START -->
## 它做什么

- 记忆：按角色和客户端分开存，互不覆盖；写入前自动备份，删错一条也能恢复。；
- 收发：电脑、手机、QQ 等端可以按端发消息，离线先存本地、上线再收；离线记忆能并回并去重。；
- 模型接入：安装者的 AI 可直接读写记忆；会自动识别本机服务和主流厂商模型；绑定后才联网访问该模型；可用日常说话添加 API、绑定模型，同一项再改会覆盖。；
- 支付：自动识别安装者所在国家/地区，显示当地货币和支付方式；只生成付款入口，不接触支付密码或银行卡。；
- 本机运行：自动选择可用端口，数据只存在安装者自己的目录；能接多少端、存多少条由本机资源决定。；
- 边界：不统计、不收集安装者或用户数据，任何收集都要先明确同意；语言跟随系统，提示和付款界面自动本地化，切换语言不影响已有数据和功能；可随时停用，停用后不启动服务、不写数据，也不影响 AI 使用。；
<!-- FEATURES:END -->

## 它不做什么

- 不自带 QQ 机器人、桌宠或聊天客户端；
- 不包含模型、不调用任何外部 AI 服务；
- 不会上传数据到云端；
- 不会自动读取你的其他插件数据。

## 端数与容量不设固定上下限

- 角色名、来源名支持任意 Unicode，插件不限制角色/来源数量；
- 客户端能接多少端，取决于安装者自己的模型和软件端口，插件不设白名单；
- 同一个插件实例可以被任意多个本地客户端调用；
- 容量默认有软上限，但都可配置，`0` 表示不限制：

```yaml
config:
  historyLimit: 1000   # 每个来源保留条数，0 = 不限
  snapshotLimit: 100   # 快照份数，0 = 不限
  inboxLimit: 200      # 收件箱条数，0 = 不限
  outboxLimit: 200     # 发件箱条数，0 = 不限
```

实际能存多少只受安装者本机磁盘限制。
## 隐私与同意

这个插件默认：

- **没有遥测**，不统计安装量、不发送使用数据；
- **联网跟模型绑定**：没绑定模型前只探测本机服务，不查云端、不更新目录；绑定后才访问该模型和公开目录；
- 数据只写安装者本机的 `~/.dsh/memory-hub.json` 及其派生文件；
- 不读取安装者的其他插件、聊天或账号，除非模型通过工具显式写入；
- Outbox 只会在安装者配置了通道、并且主动调用时，才把消息发到该通道。

任何未来的数据收集都必须：

1. 在代码和文档中明确说明收集什么；
2. 由安装者显式开启；
3. 涉及终端用户的数据时，还要取得用户本人同意；
4. 默认保持关闭。

查看当前状态：

```http
GET /privacy
```

返回 `telemetry: false`、`collectsData: false`、`consentRequired: true`，以及是否已同意。

## 安装即用，停用无感

装好后无需额外配置：

- 本机服务自动选择可用端口，端口写入 `<DSH_HOME>/memory-hub.port`；
- `memory_hub_*` 工具默认注册，安装者自己的模型可直接调用；
- 默认角色 `default`、来源 `model`，不写任何人的真实身份；
- 不主动读取聊天，只有模型调用工具时才写入。

不想用时，二选一：

```yaml
# 1. 总开关
- id: memory-hub
  config:
    enabled: false
```

```yaml
# 2. 直接停用插件行
- id: memory-hub
  disabled: true
```

停用后：

- 不启动 HTTP 服务；
- 不注册任何工具；
- 不读写记忆文件；
- 不影响安装者自己的模型运行。

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
    port: 0   # 0 = 自动选端口
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

**收件箱与 Outbox 默认都不含任何地址、账号或数据。**
## 跨通道发送（Outbox）

插件本身不内置任何聊天通道。你可以在配置里声明自己的本机 HTTP 通道，然后调用 `/outbox` 把消息投递过去。

### 配置示例（你自己的 profile，不在本包内）

```yaml
- id: memory-hub
  config:
    channels:
      qq:
        url: https://channel.example.invalid/hook
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

**默认 `channels: {}`，不带任何地址、账号或 ID。**
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

**默认 `flush: []`，不会自动处理任何来源，也不含任何外部数据。**
## 支付配置（可选）

插件只保存支付入口配置，不处理支付凭证。

支付方式、货币和付款界面跟随安装者所在国家/地区自动切换，`GET /payment` 会返回：

- `region.country`：识别到的地区；
- `region.currency`：当地货币；
- `region.methods`：当地常用支付方式；
- `region.locale`：付款界面语言。

支持 CN、HK、TW、US、CA、GB、EU、JP、KR、SG、AU、IN、AE、BR；也可以用 `payment.region` 强制指定，或用 `payment.regions` 覆盖货币和方式。

创建支付意图时会把 `amount`、`currency`、`method`、`region` 带进支付地址，付款界面可按地区渲染。

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
## 模型适配（通用）

记忆工具本身不依赖某一家模型。联网只发生在绑定模型之后：没绑定时只探测本机服务，不查云端、不更新目录；绑定后才访问该模型和公开目录。`r`n`r`n插件会探测本机常见的 AI 服务：

- Ollama：`127.0.0.1:11434`
- LM Studio：`127.0.0.1:1234`
- vLLM / 其他 OpenAI 兼容服务：`127.0.0.1:8000`、`8080`、`5000`

同时识别主流云端厂商，只有安装者自己配置了对应 Key 时才查询，否则只返回模型目录：

- OpenAI、Anthropic Claude、Google Gemini、DeepSeek
- OpenRouter、Groq、Mistral、xAI Grok
- 通义千问、智谱 GLM、月之暗面 Kimi、硅基流动、MiniMax

`GET /models` 会返回厂商、协议、地址和可用模型列表。厂商目录每天最多刷新一次，新增软件和模型会写入本机缓存，不用等插件升级；`POST /models/refresh` 可手动刷新。

也可以手动登记：

```yaml
models:
  - name: local-ollama
    baseUrl: http://127.0.0.1:11434
    protocol: ollama
  - name: my-openai-compatible
    baseUrl: http://127.0.0.1:9000
    apiKeyEnv: MY_MODEL_KEY
    protocol: openai
```

接口：

```http
GET /models
POST /models/probe
{ "baseUrl": "http://127.0.0.1:11434" }
```

只探测模型列表，不发送记忆内容、不上传数据。

没有开放 API 的桌面 AI 软件无法直接适配，需要它的客户端主动调用本插件的 HTTP 接口或模型工具。
## 对话配置（无设置按键）

没有设置页面，也没有按钮。安装者直接和自己的 AI 说话：

```text
把默认角色改成 role-a
默认来源用 client-x
模型地址是 https://model.example.invalid/v1
支付地址换成 https://pay.example.invalid/checkout，档位 10,20,50
```

也可以添加自己的 API：

```text
接口名称=my-api
接口地址=https://api.example.invalid/v1
接口密钥环境变量=MY_API_KEY
接口模型=my-model
绑定接口=是
```

`接口密钥环境变量` 只保存变量名，不保存密钥本身；密钥放在安装者自己的环境变量里。

模型调用 `memory_hub_configure`，从原话里识别键值并写入：

```text
<DSH_HOME>/memory-hub-settings.json
```

规则：

- 支持任意语言；
- 同一个键再次配置会覆盖旧值，不追加；
- 没识别到的内容不会写；
- 不读取聊天，不自动弹窗，不影响 AI 软件主界面。


## 绑定模型与转发

安装者选定自己的 AI 软件或模型后，插件提供本地 OpenAI 兼容地址：

```http
POST /bind
{ "providerId": "auto", "model": "可选模型名" }
```

也可以指定厂商或自定义地址：

```json
{ "providerId": "ollama", "model": "qwen3" }
{ "baseUrl": "http://127.0.0.1:9000/v1", "model": "local-model", "force": true }
```

绑定后：

```http
GET /bind
GET /v1/models
POST /v1/chat/completions
```

`/v1/chat/completions` 会把请求转发到绑定端点，只支持 OpenAI 兼容或 Ollama 协议；Anthropic、Gemini 原生协议需要各自客户端。

模型工具 `memory_hub_bind` 也能让 AI 用对话完成绑定。
## 语言适配

插件文字跟随安装者系统语言或请求的 `Accept-Language`，支持：

```text
zh en es fr de ja ko pt ru ar
```

- 提示、错误、付款界面元数据会本地化；
- 对话配置支持这些语言的常见说法，例如 `rol`、`source`、`paiement`、`支払い`；
- 内部字段名和已有数据不改，切换语言不会让配置失效；
- 想固定语言可设 `language: zh`，默认 `auto`。

```http
GET /locale
```
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
