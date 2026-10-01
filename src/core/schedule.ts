/**
 * ChronoFlow 日程主模块（双端通用）
 *
 * 实现三大核心能力 + 日程 CRUD：
 *   1. genTableFromText —— 输入文字，智能生成时间表
 *   2. extractHighlights —— 文本划重点，提取候选日程
 *   3. saveClassifiedInfo / queryClassifiedItems / updateClassifiedItem / deleteClassifiedItem —— 零散信息分类存储与编辑
 *   4. createSchedule / updateSchedule / deleteSchedule / querySchedule —— 日程增删改查
 *
 * 本模块不依赖 Electron 或 Capacitor，纯 TypeScript 逻辑。
 *   - MOCK_MODE=true  → 走 mock 分支（样例数据）
 *   - MOCK_MODE=false → 走真实逻辑（本地状态数组，无外部 AI）
 */

import type {
  Result,
  GenScheduleTableReq, GenScheduleTableRes, ScheduleTableRow,
  ExtractHighlightsReq, ExtractHighlightsRes, HighlightSegment, HighlightType,
  SaveInfoReq, ClassifiedItem, ClassifiedType,
  QueryClassifiedReq, ClassifiedQueryRes,
  ScheduleInput, ScheduleItem, ScheduleQueryReq, ScheduleQueryRes,
  Priority,
} from '../shared/types';
import { MOCK_MODE } from '../shared/config';
import { mockScheduleData, NOT_IMPLEMENTED } from '../shared/mock';
import { multiPlatformQuery } from './search-agent';

// ==================== 本地状态 ====================

// 真实模式下的日程存储（模块级单例，随进程存活）
let localSchedules: ScheduleItem[] = [];
// 真实模式下的分类条目存储
let localClassified: ClassifiedItem[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix = 'sched'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toResult<T>(data: T): Result<T> {
  return { success: true, data };
}

// ==================== 时间解析工具 ====================

/**
 * 把中文/口语时间表达式解析为绝对 Date。
 * 支持的表达（示例）：
 *   - "今天" / "明天" / "后天" / "大后天"
 *   - "上午/早上/下午/晚上/中午 X 点/时/点半/X:XX"
 *   - "周X/星期X/下周三/下下周一"
 *   - "X月X日/X号"（可带 "X 点"）
 *   - 直接 ISO / "YYYY-MM-DD HH:mm"
 */
export function parseDateTime(text: string, base: Date): Date | null {
  const s = text.trim();
  if (!s) return null;

  // 1) 纯 ISO8601
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(s);
  if (iso) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2) "YYYY-MM-DD HH:mm(:ss)"
  const plain = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(s);
  if (plain) {
    const d = new Date(
      Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]),
      Number(plain[4]), Number(plain[5]),
    );
    return isNaN(d.getTime()) ? null : d;
  }

  const now = new Date(base.getTime());
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 相对日偏移
  let dayOffset = 0;
  if (/大后天/.test(s)) dayOffset = 3;
  else if (/后天/.test(s)) dayOffset = 2;
  else if (/明[天早]/.test(s) || /明天/.test(s)) dayOffset = 1;
  else if (/今天|今[天早]/.test(s)) dayOffset = 0;

  // 星期表达："下周X" / "下下周一" / "周X" / "星期X"
  const weekMap: Record<string, number> = {
    日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  };
  const weekMatch = /(下下|下|本|这)?(?:周|星期|礼拜)([一二三四五六日天])/.exec(s);
  if (weekMatch) {
    const targetDow = weekMap[weekMatch[2]];
    const todayDow = dayStart.getDay();
    let delta = targetDow - todayDow;
    if (weekMatch[1] === '下下') delta += 14;
    else if (weekMatch[1] === '下') delta += 7;
    if (delta < 0) delta += 7;
    dayOffset = delta;
  }

  // 具体月日："10月8日/号" / "8月3号"
  const mdMatch = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(s);
  if (mdMatch) {
    const month = Number(mdMatch[1]);
    const day = Number(mdMatch[2]);
    let year = now.getFullYear();
    let candidate = new Date(year, month - 1, day);
    // 若已过（且未显式说明明年），顺延到明年
    if (candidate.getTime() < dayStart.getTime() - 86400000) {
      candidate = new Date(year + 1, month - 1, day);
    }
    // 再解析具体时刻
    const hm = parseClock(s);
    if (hm) {
      candidate.setHours(hm.hour, hm.minute, 0, 0);
    }
    return candidate;
  }

  // 时刻（小时/分钟）
  const hm = parseClock(s);
  const result = new Date(dayStart.getTime() + dayOffset * 86400000);
  if (hm) {
    result.setHours(hm.hour, hm.minute, 0, 0);
  } else if (dayOffset === 0 && !/点|时|:/.test(s)) {
    // 仅"今天"而无时刻，默认 9:00
    result.setHours(9, 0, 0, 0);
  }
  return result;
}

/** 解析 "上午 10 点"/"下午 3 点"/"15:30"/"10点半" 等时刻，返回 24h 小时分钟 */
function parseClock(s: string): { hour: number; minute: number } | null {
  // 12 小时制 + 时段
  let hour: number | null = null;
  let minute = 0;
  let isPm: boolean | null = null;

  // "15:30" / "9:05"
  const hhmm = /(\d{1,2}):(\d{2})/.exec(s);
  if (hhmm) {
    hour = Number(hhmm[1]);
    minute = Number(hhmm[2]);
  } else {
    const m = /(\d{1,2})\s*(?:点|时)(半|一刻|三刻)?/.exec(s);
    if (m) {
      hour = Number(m[1]);
      if (m[2] === '半') minute = 30;
      else if (m[2] === '一刻') minute = 15;
      else if (m[2] === '三刻') minute = 45;
    }
  }
  if (hour === null) return null;

  if (/下午|晚上|傍晚|pm|PM/.test(s)) isPm = true;
  else if (/上午|早上|凌晨|清晨|中午|am|AM/.test(s)) isPm = false;

  // 中午特殊：约定为 12 点
  if (/中午/.test(s) && hour === null) hour = 12;

  if (isPm === true && hour < 12) hour += 12;
  else if (isPm === false && hour === 12) hour = 0;
  else if (isPm === null && hour >= 0 && hour < 6) hour += 12; // 无时段且小时<6 视为下午

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** 默认结束时间：开始后 1 小时 */
export function defaultEnd(start: Date): Date {
  const e = new Date(start.getTime() + 60 * 60 * 1000);
  return e;
}

// ==================== 核心能力 1：文本生成时间表 ====================

export async function genTableFromText(req: GenScheduleTableReq): Promise<Result<GenScheduleTableRes>> {
  if (MOCK_MODE) {
    // 调搜索 Agent 获取参考信息
    const searchRes = await multiPlatformQuery({ query: req.text });
    const refCount = searchRes.data?.length ?? 0;
    const mockData = mockScheduleData.genTableFromText(req);
    return {
      success: true,
      data: {
        ...mockData,
        explanation: `${mockData.explanation}（搜索 Agent 返回 ${refCount} 条参考）`,
      },
    };
  }

  // ---- 真实逻辑：从文本解析日程 ----
  const base = req.baseDate ? new Date(req.baseDate) : new Date();
  if (isNaN(base.getTime())) {
    return {
      success: false,
      error: { code: 'E_INVALID_DATE', message: 'baseDate 不是合法的日期' },
    };
  }

  // 内部搜索 Agent 参考（真实模式下 search-agent 也可能未实现，这里捕获）
  let refCount = 0;
  try {
    const searchRes = await multiPlatformQuery({ query: req.text });
    refCount = searchRes.data?.length ?? 0;
  } catch {
    refCount = 0;
  }

  // 按句切分，逐句识别时间
  const sentences = req.text
    .split(/[。；;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const scheduleItems: ScheduleItem[] = [];
  const conflicts: string[] = [];

  for (const sentence of sentences) {
    // 尝试解析开始时间
    const start = parseDateTime(sentence, base);
    if (!start) continue;

    // 结束时间：优先识别 "X-Y 点" / "到 X 点" 区间
    let end: Date | null = null;
    const rangeMatch = /(?:到|至|-)\s*(?:(\d{1,2})(?:点|时|:(\d{2}))?)/.exec(sentence);
    if (rangeMatch) {
      const endClock = parseClock(sentence.slice(sentence.lastIndexOf(rangeMatch[0]) + rangeMatch[0].length - 3));
      // 简化：尝试从后半段解析
      const tail = sentence.slice(sentence.indexOf(rangeMatch[0]) + rangeMatch[0].length);
      const tailClock = parseClock(tail);
      if (tailClock) {
        end = new Date(start.getTime());
        end.setHours(tailClock.hour, tailClock.minute, 0, 0);
      }
    }
    if (!end) end = defaultEnd(start);

    // 标题：去掉时间词后剩余部分，截断
    let title = sentence
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
    if (!title) title = '未命名日程';

    scheduleItems.push({
      id: nextId(),
      title: title.slice(0, 30),
      description: sentence,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      isAllDay: false,
      priority: inferPriority(sentence),
      tags: [],
      color: '#4f8cff',
      isCompleted: false,
      location: extractLocation(sentence),
      contact: extractContact(sentence),
      sourceText: sentence,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  // 冲突检测：按开始时间排序后，检查相邻是否重叠
  const sorted = [...scheduleItems].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const nxt = sorted[i + 1];
    if (nxt.startTime < cur.endTime) {
      conflicts.push(`「${cur.title}」与「${nxt.title}」时间段重叠`);
    }
  }

  const table: ScheduleTableRow[] = scheduleItems.map((s) => ({
    time: `${s.startTime.slice(11, 16)} - ${s.endTime.slice(11, 16)}`,
    title: s.title,
    detail: s.description.slice(0, 40),
  }));

  return toResult({
    scheduleItems,
    explanation: `从原文识别到 ${scheduleItems.length} 项日程${refCount ? `（搜索 Agent 返回 ${refCount} 条参考）` : ''}${conflicts.length ? `，发现 ${conflicts.length} 处时间冲突` : ''}。`,
    conflicts,
    table,
  });
}

// ==================== 核心能力 2：智能划重点 ====================

/** 六类实体识别规则（按优先级排列，避免重叠）—— 导出供 synthesize.ts 复用 */
export const HIGHLIGHT_RULES: Array<{
  type: HighlightType;
  pattern: RegExp;
  suggestion: string;
  confidence: number;
}> = [
  {
    type: 'deadline',
    pattern: /(截止|截止到|最后期限|到期|务必|必须|前|deadline)/i,
    suggestion: '识别为截止时间，建议创建带提醒的日程',
    confidence: 0.9,
  },
  {
    type: 'contact',
    pattern: /([\u4e00-\u9fa5]{1,4})(?:电话|联系方式|手机|微信|联系)/,
    suggestion: '识别为联系人信息，建议存入通讯录分类',
    confidence: 0.85,
  },
  {
    type: 'location',
    pattern: /(?:在|到|去|地点|地址)([\u4e00-\u9fa5A-Za-z0-9]+(?:会议室|餐厅|酒店|超市|公司|大厦|广场|中心|线上|办公室))/,
    suggestion: '识别为地点信息',
    confidence: 0.8,
  },
  {
    type: 'reminder',
    pattern: /(提醒|记得|别忘了|别忘|注意|别错过)/i,
    suggestion: '识别为提醒事项，建议设置定时提醒',
    confidence: 0.8,
  },
  {
    type: 'event',
    pattern: /(会议|评审|分享|聚餐|聚会|活动|发布会|面试|培训|团建|约)/,
    suggestion: '识别为事件，建议创建日程',
    confidence: 0.78,
  },
  {
    type: 'task',
    pattern: /(完成|提交|交|做|写|买|采购|准备|整理|联系|确认|跟进)/,
    suggestion: '识别为待办任务，建议创建日程',
    confidence: 0.72,
  },
];

export async function extractHighlights(req: ExtractHighlightsReq): Promise<Result<ExtractHighlightsRes>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.extractHighlights(req) };
  }

  const text = req.text;
  const targetTypes = req.targetTypes && req.targetTypes.length > 0 ? req.targetTypes : null;
  const highlights: HighlightSegment[] = [];

  for (const rule of HIGHLIGHT_RULES) {
    if (targetTypes && !targetTypes.includes(rule.type)) continue;
    // 逐个匹配，记录精确字符偏移
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const startOffset = m.index;
      const endOffset = m.index + m[0].length;
      // 跳过已被覆盖的区间（简单去重）
      const overlapped = highlights.some((h) => startOffset < h.endOffset && endOffset > h.startOffset);
      if (overlapped) continue;
      highlights.push({
        type: rule.type,
        text: m[0],
        startOffset,
        endOffset,
        confidence: rule.confidence,
        suggestion: rule.suggestion,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // 按出现位置排序
  highlights.sort((a, b) => a.startOffset - b.startOffset);

  // 生成 draftSchedules：从高置信度的 task/event/deadline 段构造日程草稿
  const base = new Date();
  const draftSchedules: ScheduleItem[] = [];
  for (const h of highlights) {
    if (h.type !== 'task' && h.type !== 'event' && h.type !== 'deadline') continue;
    if (h.confidence < 0.7) continue;
    const start = parseDateTime(text.slice(Math.max(0, h.startOffset - 30), h.endOffset + 30), base) ?? defaultStart();
    draftSchedules.push({
      id: `draft_${nextId('d')}`,
      title: h.text.slice(0, 30),
      description: text.slice(h.startOffset, Math.min(h.endOffset + 40, text.length)),
      startTime: start.toISOString(),
      endTime: defaultEnd(start).toISOString(),
      isAllDay: false,
      priority: h.type === 'deadline' ? 'urgent' : 'medium',
      tags: [h.type],
      color: h.type === 'deadline' ? '#e74c3c' : '#4f8cff',
      isCompleted: false,
      location: '',
      contact: '',
      sourceText: h.text,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  return toResult({ highlights, draftSchedules, fullText: text });
}

function defaultStart(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

// ==================== 核心能力 3：智能分类存储 ====================

export async function saveClassifiedInfo(req: SaveInfoReq): Promise<Result<ClassifiedItem>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.saveClassifiedInfo(req) };
  }

  const type = (req.hintType as ClassifiedType) || autoClassify(req.content);
  const tags = extractTags(req.content);
  const item: ClassifiedItem = {
    id: nextId('cls'),
    type,
    title: req.content.slice(0, 20),
    content: req.content,
    tags,
    sourceText: req.content,
    createdAt: nowIso(),
  };
  localClassified.push(item);
  return toResult(item);
}

/** 按内容自动分类 */
export function autoClassify(content: string): ClassifiedType {
  if (/(电话|手机|微信|联系方式|邮箱|@|联系人)/.test(content)) return 'contact';
  if (/(会议|日程|时间|点|号|周|月|截止|提醒|安排)/.test(content)) return 'schedule';
  if (/(链接|http|文档|报告|资料|参考|数据|论文|方案)/.test(content)) return 'reference';
  return 'note';
}

/** 提取标签：井号标签 + 高频关键词 */
function extractTags(content: string): string[] {
  const tags: string[] = [];
  const hashTags = content.match(/#([\u4e00-\u9fa5A-Za-z0-9_]+)/g);
  if (hashTags) {
    for (const t of hashTags) tags.push(t.slice(1));
  }
  return tags.slice(0, 5);
}

export async function queryClassifiedItems(req: QueryClassifiedReq): Promise<Result<ClassifiedQueryRes>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.queryClassifiedItems(req) };
  }

  let items = [...localClassified];
  if (req.keyword) {
    const kw = req.keyword.toLowerCase();
    items = items.filter(
      (i) => i.title.toLowerCase().includes(kw) || i.content.toLowerCase().includes(kw),
    );
  }
  if (req.type) {
    items = items.filter((i) => i.type === req.type);
  }

  const page = req.page && req.page > 0 ? req.page : 1;
  const pageSize = req.pageSize && req.pageSize > 0 ? req.pageSize : 20;
  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return toResult({
    items: paged,
    pageInfo: { page, pageSize, total },
  });
}

// ==================== 零散信息编辑 / 删除 ====================

/** 定位一条分类记录：优先 id，旧数据（无 id）回退用 createdAt */
function classifiedKeyOf(c: ClassifiedItem): string {
  return c.id ?? c.createdAt;
}

export async function updateClassifiedItem(item: ClassifiedItem): Promise<Result<ClassifiedItem>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.updateClassifiedItem(item) };
  }

  const key = classifiedKeyOf(item);
  const idx = localClassified.findIndex((c) => classifiedKeyOf(c) === key);
  if (idx === -1) {
    return {
      success: false,
      error: { code: 'E_CLASSIFIED_NOT_FOUND', message: '未找到对应的零散信息记录' },
    };
  }
  // createdAt / sourceText 不可变：编辑只改业务字段
  const updated: ClassifiedItem = {
    ...localClassified[idx],
    ...item,
    id: classifiedKeyOf(localClassified[idx]),
    createdAt: localClassified[idx].createdAt,
  };
  localClassified[idx] = updated;
  return toResult(updated);
}

export async function deleteClassifiedItem(id: string): Promise<Result<boolean>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.deleteClassifiedItem(id) };
  }

  const idx = localClassified.findIndex((c) => classifiedKeyOf(c) === id);
  if (idx === -1) {
    // 与 deleteSchedule 口径一致：找不到返回 success:true + data:false
    return toResult(false);
  }
  localClassified.splice(idx, 1);
  return toResult(true);
}

// ==================== 日程 CRUD ====================

export async function createSchedule(input: ScheduleInput): Promise<Result<ScheduleItem>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.create(input) };
  }

  if (!input.title || !input.startTime) {
    return {
      success: false,
      error: { code: 'E_INVALID_INPUT', message: 'title 和 startTime 不能为空' },
    };
  }

  const ts = nowIso();
  const item: ScheduleItem = {
    id: nextId(),
    title: input.title,
    description: input.description ?? '',
    startTime: input.startTime,
    endTime: input.endTime || defaultEnd(new Date(input.startTime)).toISOString(),
    isAllDay: input.isAllDay ?? false,
    priority: input.priority ?? 'medium',
    tags: input.tags ?? [],
    color: input.color ?? '#4f8cff',
    isCompleted: false,
    location: input.location ?? '',
    contact: input.contact ?? '',
    sourceText: '',
    createdAt: ts,
    updatedAt: ts,
  };
  localSchedules.unshift(item);
  return toResult(item);
}

export async function updateSchedule(item: ScheduleItem): Promise<Result<ScheduleItem>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.update(item) };
  }

  const idx = localSchedules.findIndex((s) => s.id === item.id);
  if (idx === -1) {
    return {
      success: false,
      error: { code: 'E_SCHEDULE_NOT_FOUND', message: `未找到 id 为 ${item.id} 的日程` },
    };
  }
  const updated: ScheduleItem = { ...item, updatedAt: nowIso() };
  localSchedules[idx] = updated;
  return toResult(updated);
}

export async function deleteSchedule(id: string): Promise<Result<boolean>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.delete(id) };
  }

  const idx = localSchedules.findIndex((s) => s.id === id);
  if (idx === -1) {
    // 任务卡要求：找不到时返回 success:true + data:false
    return toResult(false);
  }
  localSchedules.splice(idx, 1);
  return toResult(true);
}

export async function querySchedule(req: ScheduleQueryReq): Promise<Result<ScheduleQueryRes>> {
  if (MOCK_MODE) {
    return { success: true, data: mockScheduleData.query(req) };
  }

  let items = [...localSchedules];

  if (req.keyword) {
    const kw = req.keyword.toLowerCase();
    items = items.filter(
      (s) => s.title.toLowerCase().includes(kw) || s.description.toLowerCase().includes(kw),
    );
  }
  if (req.priority) {
    items = items.filter((s) => s.priority === req.priority);
  }
  if (req.tags && req.tags.length > 0) {
    items = items.filter((s) => req.tags!.some((t) => s.tags.includes(t)));
  }
  if (req.startFrom) {
    items = items.filter((s) => s.startTime >= req.startFrom!);
  }
  if (req.startTo) {
    items = items.filter((s) => s.startTime <= req.startTo!);
  }
  if (req.isCompleted !== undefined) {
    items = items.filter((s) => s.isCompleted === req.isCompleted);
  }

  // 按开始时间升序
  items.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return toResult({
    items,
    pageInfo: { page: 1, pageSize: items.length, total: items.length },
  });
}

// ==================== 辅助函数 ====================

export function inferPriority(text: string): Priority {
  if (/(紧急|务必|必须|马上|立刻|截止|加急)/.test(text)) return 'urgent';
  if (/(重要|重点|关键|评审|汇报|提交)/.test(text)) return 'high';
  if (/(分享|讨论|交流)/.test(text)) return 'medium';
  return 'low';
}

export function extractLocation(text: string): string {
  const m = /(?:在|到|去|地点|地址)([\u4e00-\u9fa5A-Za-z0-9]+(?:会议室|餐厅|酒店|超市|公司|大厦|广场|中心|线上|办公室|会议室))/i.exec(text);
  return m ? m[1] : '';
}

export function extractContact(text: string): string {
  const m = /([\u4e00-\u9fa5]{2,4})(?:经理|工|总|姐|哥|老师|博士)?(?:联系|负责|主讲|一起去)/.exec(text);
  return m ? m[1] : '';
}
