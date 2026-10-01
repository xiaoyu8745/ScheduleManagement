/**
 * 云端消息整合 —— 飞书适配器（示例平台，真实 API）
 *
 * 通过飞书开放平台 API 拉取群聊消息并归一化。
 * 凭证来自 process.env（仅主进程可访问，由 .env 提供）：
 *   - FEISHU_APP_ID        飞书应用 App ID
 *   - FEISHU_APP_SECRET    飞书应用 App Secret
 *
 * 鉴权流程（飞书标准 tenant_access_token 模式）：
 *   1. 用 app_id + app_secret 换 tenant_access_token（有效期约 2h，本实现简单缓存）
 *   2. 带 token 调用消息/群聊相关接口拉取消息
 *
 * 说明：
 *   - 真实拉取依赖「应用已加入目标群 + 具备 im:message 读取权限」，
 *     且需要机器人在群里（或应用为群成员）。
 *   - 未配置凭证时 isConfigured() 返回 false，上层会降级到 mock/manual。
 *   - 这里使用 Node 全局 fetch（Electron 主进程 / Node 18+ 均可用）。
 */

import type { IngestMessage, IntegrationRequest } from '../../../shared/types';
import type { MessageSourceAdapter } from '../types';

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

/** 简单 token 缓存（进程内） */
let cachedToken: { token: string; expiresAt: number } | null = null;

function env(name: string): string {
  return process.env[name] ?? '';
}

/** 换取 tenant_access_token */
async function getTenantAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const appId = env('FEISHU_APP_ID');
  const appSecret = env('FEISHU_APP_SECRET');
  if (!appId || !appSecret) {
    throw new Error('缺少 FEISHU_APP_ID / FEISHU_APP_SECRET，请在 .env 配置');
  }

  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`飞书鉴权失败：${json.msg ?? json.code}`);
  }
  cachedToken = {
    token: json.tenant_access_token,
    expiresAt: Date.now() + (json.expire ?? 7200) * 1000,
  };
  return cachedToken.token;
}

/** 归一化：飞书消息 → IngestMessage */
function normalize(msg: any): IngestMessage | null {
  const body = msg?.body?.content;
  if (!body) return null;
  // 仅处理文本消息（其他类型消息降级为占位说明）
  const content =
    typeof body === 'string'
      ? JSON.parse(body).text ?? ''
      : body.text ?? '';
  if (!content) return null;

  return {
    id: String(msg.message_id ?? `${msg.create_time}-${Math.random().toString(36).slice(2, 6)}`),
    senderName: msg.sender?.id?.open_id ?? msg.sender?.name ?? '未知发言人',
    senderId: msg.sender?.id?.open_id,
    content,
    timestamp: new Date(Number(msg.create_time ?? Date.now())).toISOString(),
    msgType: msg.msg_type ?? 'text',
  };
}

export const feishuAdapter: MessageSourceAdapter = {
  source: 'feishu',
  label: '飞书',

  isConfigured(): boolean {
    return Boolean(env('FEISHU_APP_ID') && env('FEISHU_APP_SECRET'));
  },

  async fetchMessages(req: IntegrationRequest): Promise<IngestMessage[]> {
    const token = await getTenantAccessToken();
    if (!req.chatId) {
      throw new Error('飞书拉取需要指定 chatId（群 ID）');
    }

    // 飞书「获取群消息历史」接口
    // GET /im/v1/messages?container_id_type=chat&container_id={chatId}
    const url = new URL(`${FEISHU_BASE}/im/v1/messages`);
    url.searchParams.set('container_id_type', 'chat');
    url.searchParams.set('container_id', req.chatId);
    if (req.from) url.searchParams.set('start_time', String(new Date(req.from).getTime() / 1000));
    if (req.to) url.searchParams.set('end_time', String(new Date(req.to).getTime() / 1000));
    const pageSize = req.limit && req.limit > 0 ? Math.min(req.limit, 50) : 50;
    url.searchParams.set('page_size', String(pageSize));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as {
      code: number;
      msg?: string;
      data?: { items?: any[]; has_more?: boolean; page_token?: string };
    };
    if (json.code !== 0) {
      throw new Error(`飞书拉取消息失败：${json.msg ?? json.code}`);
    }

    const items = json.data?.items ?? [];
    return items
      .map(normalize)
      .filter((m): m is IngestMessage => m !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  async resolveChatName(chatId: string): Promise<string> {
    const token = await getTenantAccessToken();
    const res = await fetch(
      `${FEISHU_BASE}/im/v1/chats/${encodeURIComponent(chatId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json()) as { code: number; data?: { name?: string } };
    if (json.code === 0 && json.data?.name) return json.data.name;
    return chatId;
  },
};
