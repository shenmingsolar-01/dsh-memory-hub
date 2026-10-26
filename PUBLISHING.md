# 发布与收录清单

这个包已经按 DSH 插件规范做好，但「上架」还需要一个真实的 GitHub 仓库和一次 PR。本机没有 git/gh 登录，以下步骤需要在你的 GitHub 账号下完成。

## 1. 建仓库并推送

建议仓库名：`dsh-memory-hub`

把本目录推到仓库根目录，确认根目录有：

- `package.json`，且包含：

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

- `cordis.patch.yml`
- `index.js`
- `README.md`
- `LICENSE`
- `assets/icon-180.png`

不要只声明 `dsh.client`，必须有 `dsh.bundle`。

## 2. 加 topic

GitHub 仓库 Settings → Topics，添加：

```text
dsh-plugin
```

## 3. 等满 1 天

市场 CI 会检查仓库创建时间，必须满 1 天才能投稿。

## 4. 发 Release

- Tag：`0.1.5.2`
- 附件：根目录的 `dsh-memory-hub.tgz`（文件名不要带版本号）
- Release 地址应能访问：

```text
https://github.com/OWNER/REPO/releases/latest/download/dsh-memory-hub.tgz
```

## 5. 提交收录 PR

Fork `awesome-dsh-plugin/awesome-dsh-plugin`，只新增一个文件：

```text
data/plugins/OWNER__REPO.yml
```

内容用 `awesome-entry.yml`，把 `OWNER` / `REPO` 换成真实值。

要求：

- `description.en` 必填且属实；
- 描述里不要夸大功能或编造 API；
- 一个 PR 最多 3 条；
- 不要手改 README，README 由 CI 生成；
- `category` 用 `memory`，与插件实际功能一致。

## 6. 可选：发 npm

如果希望市场显示下载量：

- npm 包名建议 `dsh-memory-hub`；
- `package.json` 的 `repository` 必须指回被收录的 GitHub 仓库，否则不会关联；
- 发布后无需在 YAML 里手写 `npm:` 字段。

## 7. 可选：截图

如果后面加了设置页/网页面板，可在仓库根放 `screenshots.json`：

```json
["assets/screenshot-1.png"]
```

1–8 张；不写也可以，市场会从 README 抽图。
