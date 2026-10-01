/**
 * 云端消息整合 —— 平台适配器契约
 *
 * 设计目标：让 ChronoFlow 能够「读取」各协作平台（飞书/钉钉/企业微信等）
 * 的群聊消息，并自动整理成日程/待办 + 要点摘要。
 *
 * 每个平台实现一个 MessageSourceAdapter，注册到 registry 即可被统一调用。
 * 适配器职责单一：负责「拉取原始消息 + 归一化」，不做任何整合分析。
 * 整合分析（提取日程、归纳要点）统一由 synthesize.ts 完成。
 *
 * 安全约定：
 *   - 凭证（appId / appSecret / access token）只能由主进程持有（.env），
 *     绝不出现在渲染进程 / 前端代码 / IPC 响应里。
 *   - 适配器只在 Electron 主进程（真实模式）下被调用；
 *     移动端 / 纯浏览器降级走 mock，不触碰真实凭证。
 */

import type {
  IntegrationSource,
  IngestMessage,
  IngestResult,
  IntegrationRequest,
} from '../../shared/types';

/**
 * 平台适配器接口。
 * 新增平台时：实现本接口 → 在 registry.ts 的 registerBuiltinAdapters() 里注册。
 */
export interface MessageSourceAdapter {
  /** 平台标识 */
  readonly source: IntegrationSource;
  /** 展示名称 */
  readonly label: string;
  /** 是否已配置凭证（读 process.env，仅主进程可访问） */
  isConfigured(): boolean;
  /** 拉取消息并归一化 */
  fetchMessages(req: IntegrationRequest): Promise<IngestMessage[]>;
  /** 解析会话展示名（可选） */
  resolveChatName?(chatId: string): Promise<string>;
}

/** 拉取原始消息（内部辅助，供 adapter 实现复用） */
export interface RawFetchContext {
  req: IntegrationRequest;
}
