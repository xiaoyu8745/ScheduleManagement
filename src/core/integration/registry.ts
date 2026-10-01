/**
 * 云端消息整合 —— 平台适配器注册表
 *
 * 统一管理所有消息来源适配器，提供「按 source 查找」能力。
 * 新增平台：实现 MessageSourceAdapter → 在 registerBuiltinAdapters() 里 push 即可。
 */

import type { IntegrationSource } from '../../shared/types';
import type { MessageSourceAdapter } from './types';
import { feishuAdapter } from './adapters/feishu';

const adapters: MessageSourceAdapter[] = [];

function registerBuiltinAdapters(): void {
  if (adapters.length === 0) {
    adapters.push(feishuAdapter);
    // 未来在此追加：dingtalkAdapter、wecomAdapter ...
  }
}

/** 列出所有已注册的平台（用于前端展示可用来源） */
export function listAdapters(): MessageSourceAdapter[] {
  registerBuiltinAdapters();
  return [...adapters];
}

/** 按 source 查找适配器 */
export function getAdapter(source: IntegrationSource): MessageSourceAdapter | undefined {
  registerBuiltinAdapters();
  return adapters.find((a) => a.source === source);
}
