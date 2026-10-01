// ============================================================
// ChronoFlow 全局类型定义 —— 冻结契约，禁止修改
// 如需新增字段，请在 PR 描述里提出，由集成工程师统一处理
// ============================================================

// ============ 统一返回包装体 ============
export interface Result<T> {
  success: boolean;
  data?: T;
  error?: ErrorInfo;
}

export interface ErrorInfo {
  code: string;      // 错误码，如 "E_SCHEDULE_NOT_FOUND"
  message: string;   // 人类可读描述
  detail?: string;   // 可选详情
}

// ============ 日程实体 ============
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface ScheduleItem {
  id: string;
  title: string;
  description: string;
  startTime: string;       // ISO8601
  endTime: string;         // ISO8601
  isAllDay: boolean;
  priority: Priority;
  tags: string[];
  color: string;           // 如 "#4f8cff"
  isCompleted: boolean;
  location: string;
  contact: string;
  sourceText: string;      // 来源原文片段
  createdAt: string;       // ISO8601
  updatedAt: string;       // ISO8601
}

// ============ 文本生成时间表 ============
export interface GenScheduleTableReq {
  text: string;
  preferMorning?: boolean; // 尽量安排在上午
  baseDate?: string;       // 基准日期
  timezone?: string;       // 如 "Asia/Shanghai"
}

export interface GenScheduleTableRes {
  scheduleItems: ScheduleItem[];
  explanation: string;       // 生成说明
  conflicts: string[];       // 冲突警告
  table: ScheduleTableRow[]; // 表格结构化数据
}

export interface ScheduleTableRow {
  time: string;
  title: string;
  detail: string;
}

// ============ 智能划重点 ============
export interface ExtractHighlightsReq {
  text: string;
  targetTypes?: HighlightType[]; // 可选过滤
}

export interface ExtractHighlightsRes {
  highlights: HighlightSegment[];
  draftSchedules: ScheduleItem[]; // 日程草稿
  fullText: string;
}

export type HighlightType =
  | 'task' | 'deadline' | 'event' | 'contact' | 'location' | 'reminder';

export interface HighlightSegment {
  type: HighlightType;
  text: string;
  startOffset: number;
  endOffset: number;
  confidence: number;   // 0~1
  suggestion?: string;
}

// ============ 智能分类存储 ============
export interface SaveInfoReq {
  content: string;
  hintType?: string;    // 人工指定类型，可选
}

export type ClassifiedType = 'schedule' | 'reference' | 'contact' | 'note';

export interface ClassifiedItem {
  /**
   * 稳定标识（编辑/删除定位用）。
   * 契约增量扩展：可选字段，旧数据无 id 时实现层回退用 createdAt 匹配。
   */
  id?: string;
  type: ClassifiedType;
  title: string;
  content: string;
  tags: string[];
  sourceText: string;
  relatedScheduleId?: string;
  createdAt: string;
}

export interface QueryClassifiedReq {
  keyword?: string;
  type?: ClassifiedType;
  page?: number;
  pageSize?: number;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
}

export interface ClassifiedQueryRes {
  items: ClassifiedItem[];
  pageInfo: PageInfo;
}

// ============ 日程 CRUD ============
export interface ScheduleInput {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  priority?: Priority;
  tags?: string[];
  color?: string;
  location?: string;
  contact?: string;
}

export interface ScheduleQueryReq {
  keyword?: string;
  priority?: Priority;
  tags?: string[];
  startFrom?: string;
  startTo?: string;
  isCompleted?: boolean;
}

export interface ScheduleQueryRes {
  items: ScheduleItem[];
  pageInfo: PageInfo;
}

// ============ 内嵌搜索 Agent ============
export enum SearchSource {
  Web = 'web',
  Encyclopedia = 'encyclopedia',
  News = 'news',
  Social = 'social',
}

export interface SearchRequest {
  query: string;
  sources?: SearchSource[];
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: SearchSource;
  publishedAt?: string;
}

export interface SearchSummaryRes {
  summary: string;
  keyPoints: string[];
  references: SearchResultItem[];
}

// ============ 云端消息整合（增量扩展） ============

/** 支持的消息来源平台 */
export type IntegrationSource = 'feishu' | 'dingtalk' | 'wecom' | 'manual';

/** 归一化后的单条消息（跨平台统一结构） */
export interface IngestMessage {
  id: string;            // 平台内消息唯一 ID
  senderName: string;    // 发言人
  senderId?: string;     // 发言人 ID（可选）
  content: string;       // 消息正文（纯文本，已去除 @ 提及等噪音）
  timestamp: string;     // ISO8601
  groupName?: string;    // 群名称（可选）
  msgType?: string;      // 原始消息类型：text/image/file/...
}

/** 整合请求：指定平台 + 群 + 时间范围 */
export interface IntegrationRequest {
  source: IntegrationSource;
  chatId?: string;       // 群/会话 ID（manual 模式可为空）
  from?: string;         // 拉取起点 ISO8601
  to?: string;           // 拉取终点 ISO8601
  limit?: number;        // 最大拉取条数
}

/** 归纳出的要点 */
export interface KeyPoint {
  text: string;          // 要点内容
  speakers: string[];    // 涉及发言人
  confidence: number;    // 0~1
}

/** 整合结果：日程/待办 + 要点 + 摘要 */
export interface SynthesisResult {
  source: IntegrationSource;
  messageCount: number;
  summary: string;              // 整体摘要
  keyPoints: KeyPoint[];        // 归纳要点
  draftSchedules: ScheduleItem[]; // 提取的日程/待办草稿
  contactHints: ClassifiedItem[]; // 提取的联系人线索
  warnings: string[];           // 提示/风险（如无法解析的时间）
}

/** 拉取结果：归一化消息列表 */
export interface IngestResult {
  messages: IngestMessage[];
  source: IntegrationSource;
  chatName?: string;
}

/** 整合 API 请求（renderer → 主进程） */
export interface IntegrateMessagesReq {
  source: IntegrationSource;
  chatId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** 整合 API 响应：直接返回拉取 + 整合的完整结果 */
export interface IntegrateMessagesRes {
  ingested: IngestResult;
  synthesis: SynthesisResult;
}
