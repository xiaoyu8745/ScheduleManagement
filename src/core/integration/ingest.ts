/**
 * 云端消息整合 —— 编排入口（双端通用）
 *
 * 对外暴露 integrateMessages()，职责：
 *   1. 根据 source 找到适配器，拉取消息（或 manual 直接拼接）
 *   2. 交给 synthesize.ts 做整合分析
 *   3. 返回完整的 IntegrateMessagesRes
 *
 * 降级策略：
 *   - MOCK_MODE=true  → 返回样例消息（演示用，无需凭证）
 *   - source='manual' → 不拉取，直接用调用方传入的文本（本文件不支持文本直传，
 *     由上层或 UI 拼成 IngestMessage 再走 synthesize；这里预留 manual 分支）
 *   - 真实平台（如 feishu）但未配置凭证 → 抛出明确错误，UI 引导配置
 */

import type {
  IntegrateMessagesReq,
  IntegrateMessagesRes,
  IngestMessage,
  Result,
} from '../../shared/types';
import { MOCK_MODE } from '../../shared/config';
import { getAdapter } from './registry';
import { synthesize } from './synthesize';

// ==================== Mock 样例消息 ====================

const MOCK_MESSAGES: IngestMessage[] = [
  { id: 'm1', senderName: '王经理', content: '明天上午 10 点在 3F 会议室评审 Q4 产品路线图，大家都来', timestamp: '2026-10-02T09:10:00+08:00', groupName: '产品研发群' },
  { id: 'm2', senderName: '小李', content: '收到，我会把 AI 搜索模块的排期带上', timestamp: '2026-10-02T09:12:00+08:00', groupName: '产品研发群' },
  { id: 'm3', senderName: '张姐', content: '提醒一下，10 月 8 号前务必把 Q3 述职报告交了', timestamp: '2026-10-02T09:20:00+08:00', groupName: '产品研发群' },
  { id: 'm4', senderName: '陈总', content: '10 月 10 号下午产品发布会彩排，务必全员到场', timestamp: '2026-10-02T09:30:00+08:00', groupName: '产品研发群' },
  { id: 'm5', senderName: '小林', content: '下周三上午去盒马采购聚餐食材，谁有空一起去', timestamp: '2026-10-02T10:00:00+08:00', groupName: '产品研发群' },
  { id: 'm6', senderName: '王经理', content: '对了，新来的产品助理电话 138xxxx，之后对接找她', timestamp: '2026-10-02T10:05:00+08:00', groupName: '产品研发群' },
];

// ==================== 主入口 ====================

export async function integrateMessages(
  req: IntegrateMessagesReq,
): Promise<Result<IntegrateMessagesRes>> {
  try {
    // ---- Mock 分支 ----
    if (MOCK_MODE) {
      const synthesis = synthesize(req.source, MOCK_MESSAGES, '产品研发群');
      return {
        success: true,
        data: {
          ingested: {
            messages: MOCK_MESSAGES,
            source: req.source,
            chatName: '产品研发群',
          },
          synthesis,
        },
      };
    }

    // ---- manual：调用方应已把文本转成消息（此处给出明确错误提示） ----
    if (req.source === 'manual') {
      return {
        success: false,
        error: { code: 'E_MANUAL_UNSUPPORTED', message: 'manual 模式需要传入消息文本，请使用云端平台或粘贴导入' },
      };
    }

    // ---- 真实平台拉取 ----
    const adapter = getAdapter(req.source);
    if (!adapter) {
      return {
        success: false,
        error: { code: 'E_UNKNOWN_SOURCE', message: `不支持的平台：${req.source}` },
      };
    }
    if (!adapter.isConfigured()) {
      return {
        success: false,
        error: {
          code: 'E_NOT_CONFIGURED',
          message: `「${adapter.label}」尚未配置凭证，请在 .env 中配置对应 App ID / Secret 后重试`,
        },
      };
    }

    const messages = await adapter.fetchMessages(req);
    const chatName = req.chatId
      ? await adapter.resolveChatName?.(req.chatId)
      : undefined;

    const synthesis = synthesize(req.source, messages, chatName);

    return {
      success: true,
      data: {
        ingested: { messages, source: req.source, chatName },
        synthesis,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'E_INTEGRATE_FAILED',
        message: e instanceof Error ? e.message : '云端消息整合失败',
      },
    };
  }
}
