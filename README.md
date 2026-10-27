# dsh-memory-hub

版本：`1.1.10.3`

多端 AI 角色的本机记忆助手：记得住、能收发、能接自己的 AI、可选支付，数据只留在自己电脑上。

**English**

A local memory helper for AI characters: remembers, sends between clients, connects to your own AI, and offers optional payment. Everything stays on your own computer.

**这个包不含任何个人数据、账号、路径或聊天记录。** 安装后只会保存安装者自己客户端写进来的数据。

<!-- FEATURES:START -->
## 它做什么（中文）

- 记忆：按角色和客户端分开记；写之前自动备份，删错能恢复。
- 收发：任何可接端口的聊天软件都能接入；Slack、Discord、Telegram、飞书、企业微信、LINE、Matrix 自动适配；按地区和语言发送；离线先存、上线再收，离线记忆能并回。
- AI：你的 AI 能直接读写记忆；插件自动找本机和常用云端模型；选定后提供本地接口；也能用说话加自己的 API。
- 支付：用于 Token 余额充值；按所在国家显示货币和付款方式，也能手动换国家；只给付款入口，不碰支付密码。
- 本机：自动选端口，数据只存自己电脑；能接多少端、存多少条看本机；启动时有 2 秒科技风开场。
- 边界：不统计、不收集，收集前先问你；可随时停用，停用不影响 AI；文字跟随系统语言。

### What it does (English)

- Memory: keeps each character and client separate; backs up before writing, so a mistaken delete can be restored.
- Messaging: any chat app that can connect to a port works; Slack, Discord, Telegram, Feishu, WeCom, LINE and Matrix are auto-adapted; messages follow region and language; offline messages wait and arrive later, and offline memory is merged back.
- AI: your AI reads and writes memory directly; the plugin finds local and common cloud models, then exposes a local endpoint once you pick one; custom APIs can be added by talking.
- Payment: for topping up token balance; shows the local currency and methods by country, and you can switch country manually; it only gives a payment entry and never touches payment passwords.
- Local: picks a free port and keeps data on your computer; how many clients and records fit depends on your machine; a 2-second tech splash plays at startup.
- Boundaries: no statistics and no collection without asking you first; can be disabled anytime without affecting the AI; text follows the system language.
<!-- FEATURES:END -->

## 功能分类 / Feature Index

点分类名直接跳到对应功能说明。Click a category to jump to its section.

| 分类 / Category | 中文 | English |
|---|---|---|
| [记忆](#cat-memory) | 按角色和客户端分开记，写入前备份，删错能恢复 | Separate memory, backup and restore |
| [收发](#cat-messaging) | 任意可接端口的聊天软件互通，离线先存 | Any chat app with a port, offline queue |
| [AI 接入](#cat-ai) | 读写记忆、识别模型、绑定后提供本地接口 | Memory tools, model detection and binding |
| [支付](#cat-payment) | 按国家显示货币和方式，也能手动选 | Country-aware currency and methods |
| [本机运行](#cat-local) | 自动端口、数据目录、端数和容量 | Auto port, local data, capacity |
| [边界](#cat-boundary) | 不统计、可停用、跟随语言 | No stats, disable, language |

## 它不做什么

- 不自带聊天机器人、桌宠或聊天客户端；
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
<a id="cat-boundary"></a>
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

<a id="cat-local"></a>
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

## 安装前需要满足

| 条件 | 要求 | 不满足时 |
| --- | --- | --- |
| Node.js | **20 或更高**（DSH 自带运行时通常已满足） | 插件不启动，日志提示 Node 版本过低 |
| DSH | **0.2.0 或更高**，支持 `dsh plugin add` | 无法安装或注册插件 |
| 系统 | Windows 10/11、macOS 12+、主流 Linux，x64 或 arm64 | 未验证的平台可能可用，但不在支持范围 |
| 数据目录 | `DSH_HOME`（默认 `~/.dsh`）可写，至少 50 MB 空闲 | 启动时报 `data-dir` / `disk` 检查失败 |
| 本机端口 | 一个空闲的本地 HTTP 端口，默认 `127.0.0.1` 自动分配 | 端口被占用时自动换端口；只监听回环地址 |
| 浏览器（可选） | Edge、Chrome 或 Brave 任一 | 只影响启动画面，记忆、收发、AI、支付都不受影响 |
| AI 服务（可选） | 本机 Ollama/LM Studio/vLLM，或安装者自己的云端 Key | `/bind` 不可用；不配置也能正常记忆和收发 |
| 支付链接（可选） | 安装者自己的充值/收银台地址 | `/payment` 只返回未配置，不影响其他功能 |

不需要 `npm install`、不需要编译原生模块、不需要数据库。插件没有第三方运行时依赖，装完即可用。

## 安装

```bash
dsh plugin --profile <你的 profile> add <这个包的路径或 npm 包名>
```

例如从 npm 安装：

```bash
dsh plugin --profile default add dsh-memory-hub
```

从本地压缩包安装：

```bash
dsh plugin --profile default add ./dsh-memory-hub.tgz
```

重启该 profile 后生效。启动日志会打印实际监听地址，例如 `memory-hub 监听 http://127.0.0.1:43127`。

### 安装自检

启动后访问：

```http
GET http://127.0.0.1:<端口>/requirements
```

返回每一项条件是否满足：

```json
{
  "ok": true,
  "node": "24.21.0",
  "platform": "win32-x64",
  "dshHome": "C:\\Users\\you\\.dsh",
  "checks": [
    { "id": "node", "required": true, "ok": true, "detail": "Node 24.21.0，需要 >= 20" },
    { "id": "data-dir", "required": true, "ok": true, "detail": "可写：..." },
    { "id": "disk", "required": true, "ok": true, "detail": "剩余 12345 MB，建议 >= 50 MB" },
    { "id": "tools-api", "required": false, "ok": true, "detail": "支持注册 memory_hub_* 工具" },
    { "id": "browser", "required": false, "ok": true, "detail": "启动画面可用：..." }
  ]
}
```

`GET /health` 也会带上同样的 `requirements` 字段。`required: false` 的项不满足时，对应可选功能跳过，插件仍可正常使用。

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

<a id="cat-memory"></a>
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
  "from": "chat-app",
  "to": "chat-channel",
  "text": "我到家了"
}
```

先写入收件箱，再按 `to` 投递到已配置通道；适合「一端说一句，另一端也收到」。
### 读取

```http
GET /memory
GET /memory?character=assistant
GET /memory/backups?character=assistant
```

### 写入

```http
POST /memory
{
  "character": "assistant",
  "source": "mobile",
  "history": [
    { "role": "user", "text": "在吗" },
    { "role": "assistant", "text": "在的，你好" }
  ]
}
```

重复消息会自动去重，不会重复写入。

### 删除（只删指定来源）

```http
POST /memory/delete
{ "character": "assistant", "source": "mobile", "text": "要删掉的那句" }
```

也可以用 `"at": 时间戳` 精确定位。

### 恢复

```http
POST /memory/restore
{ "character": "assistant", "source": "mobile" }
```

不带 `snapshotAt` 时恢复最近一份快照；带 `snapshotAt` 可恢复指定快照。

<a id="cat-messaging"></a>
## 跨端收件箱（Inbox）

任意一端把消息写进收件箱，其他端轮询取走。适合「手机端收到消息，让电脑端角色回复」这类跨端投递。

### 写入

```http
POST /inbox
{
  "character": "assistant",
  "from": "chat-app",
  "text": "我到家了"
}
```

可选 `deliverTo`：写入后同时投递到已配置的通道。

### 一键跨端（Inbox + Outbox）

```http
POST /cross
{
  "character": "assistant",
  "from": "chat-app",
  "to": "chat-channel",
  "target": "mobile",
  "text": "我到家了"
}
```

先写入收件箱，再按 `to` 投递到已配置通道；`target` 可选，指定只有哪一端能取到这条消息。

### 读取

```http
GET /inbox?character=assistant&since=0&client=mobile
```

- `since` 之后的新消息才会返回，避免重复；
- `client` 只取发给该端或未指定端（广播）的消息；
- 不带 `client` 时返回全部。

客户端可以轮询这个接口做本地通知；插件本身不直接发系统通知。

**收件箱与 Outbox 默认都不含任何地址、账号或数据。**
## 跨通道发送（Outbox）

插件本身不内置任何聊天通道。你可以在配置里声明自己的本机 HTTP 通道，然后调用 `/outbox` 把消息投递过去。

任何能接 HTTP 端口的聊天软件都能接入；常见软件不用自己拼报文：

| type | 适用 |
|---|---|
| `slack` | Slack Incoming Webhook |
| `discord` | Discord Webhook |
| `telegram` | Telegram Bot API |
| `feishu` / `lark` | 飞书群机器人 |
| `wecom` | 企业微信机器人 |
| `line` | LINE Messaging API |
| `matrix` | Matrix 客户端 API |
| `generic` | 任意自定义 HTTP 接口，默认 |

```yaml
channels:
  team-slack:
    type: slack
    url: https://hooks.slack.com/services/...
  chat-telegram:
    type: telegram
    url: https://api.telegram.org/bot<TOKEN>/sendMessage
    chatId: '123456'
  local-app:
    type: generic
    url: http://127.0.0.1:9000/message
    body:
      text: '{{text}}'
```

`GET /channels` 可以查看已配置通道和可用适配器。

### 配置示例（你自己的 profile，不在本包内）

```yaml
- id: memory-hub
  config:
    channels:
      team-chat:
        url: https://channel.example.invalid/hook
        body:
          who: your-character
          action: message
          text: '{{text}}'
```

`{{text}}`、`{{character}}`、`{{channel}}`、`{{locale}}` 会被替换。

### 发送

```http
POST /outbox
{
  "channel": "team-chat",
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
<a id="cat-payment"></a>
## 支付配置（Token 余额充值，可选）

支付用于给 AI 服务的 Token 余额充值。插件只保存支付入口配置，不处理支付凭证。

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
      provider: auto
      checkoutUrl: https://your-provider.example/top_up
      currency: ''   # 留空则使用地区货币
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
### 选择地区与支付方式

```http
GET /payment/regions
POST /payment/region
{ "region": "US", "method": "card" }
```

- 不选时自动跟随系统地区；
- 选了以后写入安装者本机设置，重启仍保留；
- 传 `"region": "AUTO"` 可恢复自动；
- 支付意图也可以临时指定：

```json
{ "amount": 20, "region": "JP", "method": "paypay" }
```

如果该方法在当地不可用，会返回 400，不会生成错误入口。

<a id="cat-ai"></a>
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
## 启动画面

插件加载后显示约 2 秒科技风开场：

- 上方：简约鲸鱼绕地球；
- 中间：世界通 / WORLD LINK，中上英下；
- 下方：致力于全球 AI 通信 / Dedicated to global AI communication，中上英下。

Windows 下用 Edge 无边框窗口自动打开，2 秒后自动关闭。其他系统可以直接访问：

```http
GET /splash
```

不需要开场时设：

```yaml
splash: false
```
## 数据格式

```json
{
  "version": 2,
  "characters": {
    "assistant": {
      "sources": {
        "app": { "history": [], "updatedAt": 0 },
        "pc": { "history": [], "updatedAt": 0 },
        "mobile": { "history": [], "updatedAt": 0 }
      },
      "snapshots": []
    }
  }
}
```

## 接入建议

插件只认端口，不认品牌，也没有内置任何私有聊天软件的数据。

- 任何能发 HTTP 请求的公共聊天软件都可以接入，消息写入时用软件名作 `source`，例如 `slack`、`telegram`、`line`；
- 常见软件直接用内置适配器：Slack、Discord、Telegram、飞书、企业微信、LINE、Matrix；
- 客户端回复前读取最近 N 条，作为跨端共同记忆；
- 离线端重新上线时先拉 `/inbox`，再继续写入；
- 不同地区发送时带 `{{locale}}`，由各自软件按当地语言展示。

公共 Webhook、Bot API、Matrix 客户端 API 都只需要安装者自己的地址和 Token，不依赖任何作者的私有服务。

## 已知限制

- 只做本机 HTTP 存储，多设备同步需要你自己加隧道或中转；
- 快照是整份来源的副本，不做逐条版本树；
- 没有鉴权，默认只监听本机；如果要监听局域网，请自行加防火墙/反代和鉴权。

## License

MIT
