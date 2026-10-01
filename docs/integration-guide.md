# 云端消息整合 —— 接入配置指南

ChronoFlow 支持从协作平台拉取群聊消息，自动「检查并整合」成日程/待办 + 要点摘要。

## 功能概览

| 能力 | 说明 |
|---|---|
| 云端拉取 | 通过平台开放 API 拉取群聊消息（当前支持飞书，钉钉/企业微信框架已预留） |
| 整合分析 | 提取日程/待办草稿 + 归纳要点（含发言人、置信度）+ 联系人线索 |
| 一键导入 | 把提取的日程草稿一键写入日程表 |

## 架构与安全

```
渲染层 (IntegrationPanel.vue)
   ↓ useAppApi().integrateMessages()
IPC / bridge
   ↓
主进程 core/integration/ingest.ts      ← 编排：拉取 + 整合
   ├── registry.ts                     ← 适配器注册表
   ├── adapters/feishu.ts              ← 飞书真实 API（凭证只在这里出现）
   └── synthesize.ts                   ← 整合算法（无外部依赖）
```

**凭证安全**：App ID / App Secret 只放 `.env`（主进程持有），绝不出现在前端代码或 IPC 响应中。移动端 / 纯浏览器降级为 Mock 数据。

## 飞书接入步骤（真实 API）

### 1. 创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn)，登录后进入「开发者后台」
2. 点击「创建企业自建应用」，填写名称（如 ChronoFlow）和描述
3. 创建完成后，在「凭证与基础信息」页拿到 **App ID** 和 **App Secret**

### 2. 开通权限

在应用的「权限管理」页开通：

- `im:message` — 获取与发送单聊、群组消息
- `im:chat` — 获取群组信息
- `im:message:readonly`（如只需读取）

### 3. 把机器人加进目标群

- 方式 A：在「应用发布 → 版本管理与发布」发布应用后，在飞书群设置 → 「群机器人」→ 添加你的应用
- 方式 B：调用 API 把应用拉进群（需要群管理员权限）

### 4. 配置 ChronoFlow

复制 `.env.example` 为 `.env`（项目根目录），填入凭证：

```bash
MOCK_MODE=false
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxx
```

> 注意：`MOCK_MODE=false` 会关闭全部 Mock（包括日程演示数据）。
> 如果只想在演示数据之外单独测整合，可以先用 Mock 模式验证界面流程。

### 5. 获取群 chat_id

两种方式：

- **API 方式**：调用 [获取用户或机器人所在的群列表](https://open.feishu.cn/document/server-docs/group/chat/list)，从返回的 `chat_id` 中找到目标群
- **简洁方式**：使用飞书开放平台的「API 调试台」，选择「获取群信息」接口直接查询

### 6. 使用

启动应用（`npm run dev`）→ 顶栏「☁ 云端整合」→ 平台选「飞书」→ 粘贴群 `chat_id` → 「检查并整合」。

## 新增平台适配器（开发者指南）

1. 在 `src/core/integration/adapters/` 新建 `<platform>.ts`，实现 `MessageSourceAdapter` 接口：

```ts
export const dingtalkAdapter: MessageSourceAdapter = {
  source: 'dingtalk',
  label: '钉钉',
  isConfigured(): boolean { /* 读 process.env.DINGTALK_* */ },
  async fetchMessages(req) { /* 拉取并归一化为 IngestMessage[] */ },
};
```

2. 在 `src/core/integration/registry.ts` 的 `registerBuiltinAdapters()` 里注册
3. 在 `IntegrationPanel.vue` 的 `SOURCE_OPTIONS` 里加一个选项
4. 归一化目标：`IngestMessage`（id / senderName / content / timestamp / groupName / msgType），整合算法自动复用，无需改动 synthesize.ts

## 常见问题

**Q：整合出来没有日程？**
消息里需要同时有「时间表达」（明天/周X/X点/X月X号…）或「待办动词」（完成/提交/务必/截止…）。纯闲聊不会被误提取。

**Q：飞书报「拉取消息失败」？**
检查：① 应用是否已加入该群；② 是否开通 `im:message` 权限；③ `chat_id` 是否正确；④ token 是否过期（本实现已自动缓存刷新）。

**Q：移动端能用真实拉取吗？**
不能。凭证只存在于桌面端 `.env`。移动端点「检查并整合」会看到 Mock 演示数据。如需移动端真实数据，需要自建后端代理（凭证放服务端）。
