/**
 * 云端消息整合 —— 整合核心算法（双端通用）
 *
 * 职责：把一批归一化后的群消息，整理成：
 *   1. 整体摘要（summary）
 *   2. 归纳要点（keyPoints，含发言人）
 *   3. 日程/待办草稿（draftSchedules，复用 schedule.ts 的时间解析与优先级推断）
 *   4. 联系人线索（contactHints，复用 autoClassify）
 *
 * 本模块只做「分析」，不拉取数据（拉取由 adapters 完成）。
 * 复用 schedule.ts 已导出的 parseDateTime / defaultEnd / inferPriority /
 * extractLocation / extractContact / autoClassify，保证口径与主模块一致。
 */

import type {
  IngestMessage,
  SynthesisResult,
  KeyPoint,
  ScheduleItem,
  ClassifiedItem,
  IntegrationSource,
  Priority,
} from '../../shared/types';
import {
  parseDateTime,
  defaultEnd,
  inferPriority,
  extractLocation,
  extractContact,
  autoClassify,
} from '../schedule';

// ==================== 噪声清洗 ====================

/** 去掉 @提及、表情、多余空白，保留可分析正文 */
function cleanContent(content: string): string {
  return (content ?? '')
    .replace(/@[\u4e00-\u9fa5A-Za-z0-9_-]+/g, '')       // @某人
    .replace(/\[[^\]]*\]/g, '')                          // [表情]/[图片] 等占位
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // emoji
    .replace(/\s+/g, ' ')
    .trim();
}

/** 是否是含有效信息量的消息（过滤纯表情、纯图片、超短灌水） */
function isSignal(content: string): boolean {
  const c = cleanContent(content);
  if (c.length < 2) return false;
  // 纯链接/纯表情无价值
  if (/^https?:\/\/\S+$/.test(c)) return false;
  return true;
}

// ==================== 日程/待办提取 ====================

/** 判断一条消息是否包含「时间 + 事项」信号 */
function hasTimeSignal(content: string): boolean {
  return /(今天|明天|后天|周[一二三四五六日天]|星期|礼拜|\d{1,2}\s*[点时]|\d{1,2}:\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|截止|务必|之前|前)/.test(content);
}

/** 从单条消息提取日程草稿（无时间信号则返回 null） */
function messageToDraft(msg: IngestMessage, base: Date): ScheduleItem | null {
  const text = cleanContent(msg.content);
  if (!isSignal(text) || !hasTimeSignal(text)) return null;

  const start = parseDateTime(text, base);
  // 无明确时间，但含任务/截止语义 → 也当作待办，用「今天」兜底
  const isTaskLike = /(完成|提交|交|做|写|买|采购|准备|整理|联系|确认|跟进|截止|务必)/.test(text);
  if (!start && !isTaskLike) return null;

  const resolved = start ?? base;
  const end = defaultEnd(resolved);
  const title = text
    .replace(/大后天|后天|明天|今天/g, '')
    .replace(/(?:下下|下|本|这)?(?:周|星期|礼拜)[一二三四五六日天]/g, '')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]\s*(?:前|之前|以前|截止|截止到)?/g, '')
    .replace(/\d{1,2}\s*[日号]\s*(?:前|之前|以前|截止|截止到)?/g, '')
    .replace(/上午|下午|晚上|早上|中午|凌晨|清晨|傍晚/g, '')
    .replace(/\d{1,2}\s*(?:点|时)(?:半|一刻|三刻)?/g, '')
    .replace(/\d{1,2}:\d{2}/g, '')
    .replace(/^[在到去]/, '')
    .replace(/^(前|之前|以前|务必|必须|截止|截止到)\s*/, '')
    .replace(/[，,。；;、\s到至\-—]+/g, ' ')
    .trim();

  const priority: Priority = inferPriority(text);
  const isDeadline = /(截止|务必|必须|之前|前)\s*$/.test(text) || /截止|务必|deadline/i.test(text);

  return {
    id: `int_${msg.id}`,
    title: (title || '未命名待办').slice(0, 30),
    description: `${msg.senderName}：${text}`,
    startTime: resolved.toISOString(),
    endTime: end.toISOString(),
    isAllDay: false,
    priority: isDeadline && priority === 'low' ? 'high' : priority,
    tags: isDeadline ? ['待办', '截止'] : ['待办'],
    color: isDeadline || priority === 'urgent' ? '#e74c3c' : '#4f8cff',
    isCompleted: false,
    location: extractLocation(text),
    contact: extractContact(text) || msg.senderName,
    sourceText: `${msg.senderName}: ${text}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ==================== 要点归纳 ====================

/**
 * 归纳要点：按「发言人 + 主题」粗聚类，长消息优先作为要点候选。
 * 这里是启发式归纳（无外部 LLM 时的可运行实现），后续可替换为真实摘要模型。
 */
function synthesizeKeyPoints(messages: IngestMessage[]): KeyPoint[] {
  const bySpeaker = new Map<string, IngestMessage[]>();
  for (const m of messages) {
    if (!isSignal(m.content)) continue;
    const arr = bySpeaker.get(m.senderName) ?? [];
    arr.push(m);
    bySpeaker.set(m.senderName, arr);
  }

  const points: KeyPoint[] = [];
  for (const [speaker, msgs] of bySpeaker) {
    // 该发言人消息按长度降序，取最「有信息量」的一条作为其要点
    const sorted = [...msgs].sort((a, b) => cleanContent(b.content).length - cleanContent(a.content).length);
    const top = sorted[0];
    const text = cleanContent(top.content);
    // 太短的发言不纳入要点
    if (text.length < 6) continue;
    points.push({
      text: text.slice(0, 80),
      speakers: [speaker],
      confidence: Math.min(0.9, 0.55 + text.length / 200),
    });
  }
  // 按置信度降序
  return points.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

// ==================== 联系人线索 ====================

function extractContactHints(messages: IngestMessage[]): ClassifiedItem[] {
  const hints: ClassifiedItem[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    const text = cleanContent(m.content);
    if (!isSignal(text)) continue;
    const type = autoClassify(text);
    if (type !== 'contact') continue;
    const key = `${m.senderName}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({
      id: `inthint_${m.id}`,
      type: 'contact',
      title: m.senderName.slice(0, 20),
      content: text.slice(0, 80),
      tags: ['群消息', '联系人'],
      sourceText: `${m.senderName}: ${text}`,
      createdAt: new Date().toISOString(),
    });
  }
  return hints.slice(0, 10);
}

// ==================== 主入口 ====================

export function synthesize(
  source: IntegrationSource,
  messages: IngestMessage[],
  chatName?: string,
): SynthesisResult {
  const base = new Date();
  const drafts: ScheduleItem[] = [];
  const warnings: string[] = [];

  for (const m of messages) {
    const draft = messageToDraft(m, base);
    if (draft) drafts.push(draft);
    else if (isSignal(m.content) && hasTimeSignal(m.content)) {
      warnings.push(`无法解析「${m.senderName}」的消息时间：${cleanContent(m.content).slice(0, 30)}`);
    }
  }

  // 去重：同标题 + 同日开始时间只保留一条
  const seenDraft = new Set<string>();
  const uniqueDrafts = drafts.filter((d) => {
    const key = `${d.title}|${d.startTime.slice(0, 10)}`;
    if (seenDraft.has(key)) return false;
    seenDraft.add(key);
    return true;
  });

  const keyPoints = synthesizeKeyPoints(messages);
  const contactHints = extractContactHints(messages);

  const summary = buildSummary(source, messages.length, uniqueDrafts.length, keyPoints.length, chatName);

  return {
    source,
    messageCount: messages.length,
    summary,
    keyPoints,
    draftSchedules: uniqueDrafts,
    contactHints,
    warnings,
  };
}

function buildSummary(
  source: IntegrationSource,
  msgCount: number,
  draftCount: number,
  pointCount: number,
  chatName?: string,
): string {
  const srcLabel = source === 'manual' ? '手动导入' : '云端群聊';
  const chat = chatName ? `「${chatName}」` : '该会话';
  return `已检查 ${chat} ${msgCount} 条消息，提取到 ${draftCount} 项日程/待办、归纳 ${pointCount} 条要点。来源：${srcLabel}。`;
}
