/**
 * ChronoFlow 统一 Mock 数据源
 *
 * 这里提供 MOCK_MODE=true 时所有函数返回的样例数据。
 * 各模块的业务代码（schedule.ts / search-agent.ts）只负责读，你在这填假数据。
 */

export const NOT_IMPLEMENTED = new Error('Not implemented');

// ---- 类型 ----
import type {
  ScheduleItem, GenScheduleTableReq, GenScheduleTableRes,
  ExtractHighlightsReq, ExtractHighlightsRes, HighlightSegment,
  SaveInfoReq, ClassifiedItem,
  QueryClassifiedReq, ClassifiedQueryRes,
  ScheduleInput, ScheduleQueryReq, ScheduleQueryRes,
  SearchRequest, SearchResultItem, SearchSummaryRes,
  SearchSource,
  IntegrateMessagesReq, IntegrateMessagesRes, IngestMessage,
} from '../shared/types';

// ========== 内置工具 ==========

let nextId = () => `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let nextClsId = () => `cls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// 内置样板日程（mock-data 基线）
const mockSchedules: ScheduleItem[] = [
  {
    id: 'sched_001',
    title: '周会：Q4 产品路线图评审',
    description: '评审 Q4 产品路线图，重点讨论 AI 搜索模块的上线节奏',
    startTime: '2026-10-03T10:00:00+08:00',
    endTime: '2026-10-03T11:30:00+08:00',
    isAllDay: false,
    priority: 'high',
    tags: ['产品', '评审'],
    color: '#e74c3c',
    isCompleted: false,
    location: '3F 会议室 A',
    contact: '王经理',
    sourceText: '下周五上午 10:00-11:30 在 3F 会议室 A 评审 Q4 产品路线图',
    createdAt: '2026-09-28T09:00:00+08:00',
    updatedAt: '2026-09-28T09:00:00+08:00',
  },
  {
    id: 'sched_002',
    title: '提交 Q3 述职报告',
    description: '完成个人 Q3 述职报告并提交 HR 系统',
    startTime: '2026-10-08T18:00:00+08:00',
    endTime: '2026-10-08T18:00:00+08:00',
    isAllDay: false,
    priority: 'urgent',
    tags: ['HR', 'deadline'],
    color: '#e74c3c',
    isCompleted: false,
    location: '',
    contact: '',
    sourceText: '10 月 8 号前务必把 Q3 述职交了',
    createdAt: '2026-09-25T14:00:00+08:00',
    updatedAt: '2026-09-25T14:00:00+08:00',
  },
  {
    id: 'sched_003',
    title: '技术分享：Electron 安全架构',
    description: '分享 contextBridge 安全实践 + preload 白名单策略',
    startTime: '2026-10-05T14:00:00+08:00',
    endTime: '2026-10-05T15:30:00+08:00',
    isAllDay: false,
    priority: 'medium',
    tags: ['技术', '分享'],
    color: '#3498db',
    isCompleted: false,
    location: '线上腾讯会议',
    contact: '李工',
    sourceText: '周三下午 2 点线上分享 Electron 安全，李工主讲',
    createdAt: '2026-09-30T10:00:00+08:00',
    updatedAt: '2026-09-30T10:00:00+08:00',
  },
  {
    id: 'sched_004',
    title: '国庆假期',
    description: '国庆节放假',
    startTime: '2026-10-01T00:00:00+08:00',
    endTime: '2026-10-07T23:59:00+08:00',
    isAllDay: true,
    priority: 'low',
    tags: ['假期'],
    color: '#2ecc71',
    isCompleted: false,
    location: '',
    contact: '',
    sourceText: '',
    createdAt: '2026-09-20T08:00:00+08:00',
    updatedAt: '2026-09-20T08:00:00+08:00',
  },
  {
    id: 'sched_005',
    title: '采购团队聚餐食材',
    description: '去超市采购下周团队聚餐用的食材和饮料',
    startTime: '2026-10-09T09:00:00+08:00',
    endTime: '2026-10-09T11:00:00+08:00',
    isAllDay: false,
    priority: 'low',
    tags: ['生活', '采购'],
    color: '#f39c12',
    isCompleted: false,
    location: '盒马鲜生',
    contact: '小张',
    sourceText: '下周三上午去盒马采购聚餐材料，叫上小张一起去',
    createdAt: '2026-10-01T10:00:00+08:00',
    updatedAt: '2026-10-01T10:00:00+08:00',
  },
  {
    id: 'sched_006',
    title: '团队季度团建（两天一夜）',
    description: '全员季度团建，真人 CS + 温泉 + 篝火晚会，统一大巴往返',
    startTime: '2026-10-24T08:00:00+08:00',
    endTime: '2026-10-25T18:00:00+08:00',
    isAllDay: true,
    priority: 'medium',
    tags: ['团建', '户外', '季度活动'],
    color: '#2ecc71',
    isCompleted: false,
    location: '莫干山度假区',
    contact: '行政·小林',
    sourceText: '10月24-25号两天一夜团建，去莫干山',
    createdAt: '2026-10-02T09:30:00+08:00',
    updatedAt: '2026-10-02T09:30:00+08:00',
  },
  {
    id: 'sched_007',
    title: '年度健康体检预约',
    description: '提前一个月预约三甲医院年度体检，记得空腹',
    startTime: '2026-11-02T08:30:00+08:00',
    endTime: '2026-11-02T11:00:00+08:00',
    isAllDay: false,
    priority: 'medium',
    tags: ['健康', '预约', '年度'],
    color: '#3498db',
    isCompleted: false,
    location: '市人民医院体检中心',
    contact: '体检科',
    sourceText: '11月初约体检，空腹',
    createdAt: '2026-10-01T15:00:00+08:00',
    updatedAt: '2026-10-01T15:00:00+08:00',
  },
  {
    id: 'sched_008',
    title: '报销 Q3 差旅费用',
    description: '整理 Q3 出差票据，走 OA 报销流程',
    startTime: '2026-10-06T10:00:00+08:00',
    endTime: '2026-10-06T11:00:00+08:00',
    isAllDay: false,
    priority: 'low',
    tags: ['财务', '报销', '行政', '待办'],
    color: '#8c98a8',
    isCompleted: true,
    location: '',
    contact: '财务·张姐',
    sourceText: '国庆后报销 Q3 差旅',
    createdAt: '2026-09-28T11:00:00+08:00',
    updatedAt: '2026-10-01T16:20:00+08:00',
  },
  {
    id: 'sched_009',
    title: '产品发布会彩排',
    description: '新品发布会全流程彩排，含设备调试、走位、串词，务必全员到场',
    startTime: '2026-10-10T14:00:00+08:00',
    endTime: '2026-10-10T18:00:00+08:00',
    isAllDay: false,
    priority: 'urgent',
    tags: ['发布会', '彩排', '关键节点', '全员'],
    color: '#e74c3c',
    isCompleted: false,
    location: '会展中心 2 号馆',
    contact: '市场·陈总',
    sourceText: '10月10号下午发布会彩排，务必全员到场',
    createdAt: '2026-10-02T08:00:00+08:00',
    updatedAt: '2026-10-02T08:00:00+08:00',
  },
];

const mockClassifiedItems: ClassifiedItem[] = [
  {
    id: 'cls_001',
    type: 'contact',
    title: '王经理',
    content: '王经理，电话 138xxxx，负责产品部',
    tags: ['联系人', '产品部'],
    sourceText: '王经理电话 138xxxx，产品部负责人',
    createdAt: '2026-09-20T10:00:00+08:00',
  },
  {
    id: 'cls_002',
    type: 'reference',
    title: 'Q4 产品路线图草案',
    content: 'AI 搜索模块预计 11 月上线，Q4 重点攻坚智能日程生成算法',
    tags: ['产品', '路线图'],
    sourceText: 'AI 搜索模块预计 11 月上线',
    createdAt: '2026-09-22T10:00:00+08:00',
  },
  {
    id: 'cls_003',
    type: 'note',
    title: '团队聚餐想法',
    content: '下下周可以考虑团队吃火锅，统计一下忌口',
    tags: ['聚餐', '团建'],
    sourceText: '下下周团队吃火锅',
    createdAt: '2026-09-28T10:00:00+08:00',
  },
];

let localSchedules = [...mockSchedules];
let localClassified = [...mockClassifiedItems];

// ==============================
// 辅助：零散信息自动分类 + 标签提取
// ==============================

/** 按内容关键词自动分类（与 src/core/schedule.ts 的 autoClassify 规则保持一致） */
function autoClassify(content: string): ClassifiedItem['type'] {
  if (/(电话|手机|微信|联系方式|邮箱|@|联系人|微信号|手机号)/.test(content)) return 'contact';
  if (/(会议|日程|时间|点|号|周|月|截止|提醒|安排|彩排|发布会)/.test(content)) return 'schedule';
  if (/(链接|http|文档|报告|资料|参考|数据|论文|方案|路线图)/.test(content)) return 'reference';
  return 'note';
}

/** 提取井号标签；无标签时按分类给一个默认标签，让演示更饱满 */
function extractTags(content: string): string[] {
  const tags: string[] = [];
  const hashTags = content.match(/#([\u4e00-\u9fa5A-Za-z0-9_]+)/g);
  if (hashTags) {
    for (const t of hashTags) tags.push(t.slice(1));
  }
  return tags.slice(0, 5);
}

// ==============================
// schedule.ts 用到的 mock 函数
// ==============================

export const mockScheduleData = {
  genTableFromText(_req: GenScheduleTableReq): GenScheduleTableRes {
    return {
      scheduleItems: localSchedules,
      explanation: `从原文中识别到 ${localSchedules.length} 项日程。已自动参考节假日信息（搜索 Agent 返回 2 条参考），确保无冲突。`,
      conflicts: [],
      table: localSchedules.map(s => ({
        time: s.startTime.slice(0, 16).replace('T', ' '),
        title: s.title,
        detail: s.description.slice(0, 30),
      })),
    };
  },

  extractHighlights(_req: ExtractHighlightsReq): ExtractHighlightsRes {
    const highlights: HighlightSegment[] = localSchedules
      .filter(s => s.sourceText)
      .map((s, i) => ({
        type: s.priority === 'urgent' ? 'deadline' as const : 'task' as const,
        text: s.sourceText,
        startOffset: i * 10,
        endOffset: i * 10 + s.sourceText.length,
        confidence: 0.75 + i * 0.05,
        suggestion: `建议创建日程「${s.title}」`,
      }));

    return {
      highlights,
      draftSchedules: localSchedules.map(s => ({ ...s, id: `draft_${s.id}` })),
      fullText: '下周五上午 10:00-11:30 在 3F 会议室 A 评审 Q4 产品路线图；10 月 8 号前务必把 Q3 述职交了...',
    };
  },

  saveClassifiedInfo(req: SaveInfoReq): ClassifiedItem {
    const type = (req.hintType as ClassifiedItem['type']) || autoClassify(req.content);
    const tags = extractTags(req.content);
    const item: ClassifiedItem = {
      id: nextClsId(),
      type,
      title: req.content.slice(0, 20),
      content: req.content,
      tags,
      sourceText: req.content,
      createdAt: new Date().toISOString(),
    };
    localClassified.push(item);
    return item;
  },

  updateClassifiedItem(item: ClassifiedItem): ClassifiedItem {
    const key = item.id ?? item.createdAt;
    const idx = localClassified.findIndex(c => (c.id ?? c.createdAt) === key);
    if (idx === -1) throw new Error('E_CLASSIFIED_NOT_FOUND');
    // createdAt / sourceText 不可变：与真实实现口径一致
    localClassified[idx] = {
      ...localClassified[idx],
      ...item,
      id: localClassified[idx].id ?? key,
      createdAt: localClassified[idx].createdAt,
    };
    return localClassified[idx];
  },

  deleteClassifiedItem(id: string): boolean {
    const idx = localClassified.findIndex(c => (c.id ?? c.createdAt) === id);
    if (idx === -1) return false;
    localClassified.splice(idx, 1);
    return true;
  },

  queryClassifiedItems(req: QueryClassifiedReq): ClassifiedQueryRes {
    let items = localClassified;
    if (req.keyword) {
      items = items.filter(i => i.content.includes(req.keyword!) || i.title.includes(req.keyword!));
    }
    if (req.type) {
      items = items.filter(i => i.type === req.type);
    }
    // 分页切片：与真实 schedule.ts 的 queryClassifiedItems 口径一致
    const page = req.page && req.page > 0 ? req.page : 1;
    const pageSize = req.pageSize && req.pageSize > 0 ? req.pageSize : 20;
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      pageInfo: { page, pageSize, total },
    };
  },

  create(input: ScheduleInput): ScheduleItem {
    const item: ScheduleItem = {
      id: nextId(),
      title: input.title,
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime,
      isAllDay: input.isAllDay ?? false,
      priority: input.priority ?? 'medium',
      tags: input.tags ?? [],
      color: input.color ?? '#4f8cff',
      isCompleted: false,
      location: input.location ?? '',
      contact: input.contact ?? '',
      sourceText: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localSchedules.unshift(item);
    return item;
  },

  update(item: ScheduleItem): ScheduleItem {
    const idx = localSchedules.findIndex(s => s.id === item.id);
    if (idx === -1) throw new Error('E_SCHEDULE_NOT_FOUND');
    localSchedules[idx] = { ...item, updatedAt: new Date().toISOString() };
    return localSchedules[idx];
  },

  delete(id: string): boolean {
    const idx = localSchedules.findIndex(s => s.id === id);
    if (idx === -1) return false;
    localSchedules.splice(idx, 1);
    return true;
  },

  query(_req: ScheduleQueryReq): ScheduleQueryRes {
    return {
      items: localSchedules,
      pageInfo: { page: 1, pageSize: 20, total: localSchedules.length },
    };
  },
};

// ==============================
// search-agent.ts 用到的 mock 函数
// ==============================

export const mockSearchData = {
  multiPlatformQuery(_req: SearchRequest): SearchResultItem[] {
    return [
      {
        id: 'search_001',
        title: '2026 年国庆节放假安排',
        url: 'https://www.gov.cn/guoqing2026',
        snippet: '2026 年国庆节放假时间为 10 月 1 日至 10 月 7 日，共 7 天。',
        source: 'web' as SearchSource,
        publishedAt: '2026-09-15T00:00:00+08:00',
      },
      {
        id: 'search_002',
        title: '3F 会议室 A 开放时间与预定规则',
        url: 'https://oa.company.com/rooms',
        snippet: '会议室 A 可容纳 12 人，开放时间 8:00-20:00，需提前 1 天预定。',
        source: 'web' as SearchSource,
        publishedAt: '2026-08-01T00:00:00+08:00',
      },
      {
        id: 'search_003',
        title: 'Q4 产品路线图最新进展',
        url: 'https://wiki.company.com/q4-roadmap',
        snippet: 'AI 搜索模块预计 11 月中旬上线，Q4 重点攻坚智能日程生成算法。',
        source: 'web' as SearchSource,
        publishedAt: '2026-09-28T00:00:00+08:00',
      },
    ];
  },

  getSummary(_req: SearchRequest): SearchSummaryRes {
    return {
      summary: '根据搜索结果，国庆节 10.1~10.7 放假，3F 会议室 A 需提前 1 天预定。Q4 产品路线图显示 AI 搜索模块预计 11 月上线。建议日程避开节假日和会议室不可用时段。',
      keyPoints: [
        '国庆假期：10 月 1-7 日',
        '3F 会议室 A：8:00-20:00，需提前预定',
        'AI 搜索模块：11 月中旬上线',
      ],
      references: this.multiPlatformQuery(_req),
    };
  },
};

// ==============================
// integration 用到的 mock 数据
// ==============================

export const mockIntegrationData = {
  integrateMessages(_req: IntegrateMessagesReq): IntegrateMessagesRes {
    const messages: IngestMessage[] = [
      { id: 'm1', senderName: '王经理', content: '明天上午 10 点在 3F 会议室评审 Q4 产品路线图，大家都来', timestamp: '2026-10-02T09:10:00+08:00', groupName: '产品研发群' },
      { id: 'm2', senderName: '小李', content: '收到，我会把 AI 搜索模块的排期带上', timestamp: '2026-10-02T09:12:00+08:00', groupName: '产品研发群' },
      { id: 'm3', senderName: '张姐', content: '提醒一下，10 月 8 号前务必把 Q3 述职报告交了', timestamp: '2026-10-02T09:20:00+08:00', groupName: '产品研发群' },
      { id: 'm4', senderName: '陈总', content: '10 月 10 号下午产品发布会彩排，务必全员到场', timestamp: '2026-10-02T09:30:00+08:00', groupName: '产品研发群' },
      { id: 'm5', senderName: '小林', content: '下周三上午去盒马采购聚餐食材，谁有空一起去', timestamp: '2026-10-02T10:00:00+08:00', groupName: '产品研发群' },
      { id: 'm6', senderName: '王经理', content: '对了，新来的产品助理电话 138xxxx，之后对接找她', timestamp: '2026-10-02T10:05:00+08:00', groupName: '产品研发群' },
    ];

    return {
      ingested: { messages, source: _req.source, chatName: '产品研发群' },
      synthesis: {
        source: _req.source,
        messageCount: messages.length,
        summary: '已检查「产品研发群」6 条消息，提取到 3 项日程/待办、归纳 4 条要点。来源：云端群聊。',
        keyPoints: [
          { text: '明天上午 10 点在 3F 会议室评审 Q4 产品路线图', speakers: ['王经理'], confidence: 0.85 },
          { text: '10 月 8 号前务必把 Q3 述职报告交了', speakers: ['张姐'], confidence: 0.8 },
          { text: '10 月 10 号下午产品发布会彩排，务必全员到场', speakers: ['陈总'], confidence: 0.82 },
          { text: '新来的产品助理电话 138xxxx，之后对接找她', speakers: ['王经理'], confidence: 0.75 },
        ],
        draftSchedules: [
          {
            id: 'int_m1', title: '3F 会议室评审 Q4 产品路线图',
            description: '王经理：明天上午 10 点在 3F 会议室评审 Q4 产品路线图',
            startTime: '2026-10-03T10:00:00+08:00', endTime: '2026-10-03T11:00:00+08:00',
            isAllDay: false, priority: 'high', tags: ['待办'], color: '#4f8cff',
            isCompleted: false, location: '3F 会议室', contact: '王经理',
            sourceText: '王经理: 明天上午 10 点在 3F 会议室评审 Q4 产品路线图，大家都来',
            createdAt: '2026-10-02T10:10:00+08:00', updatedAt: '2026-10-02T10:10:00+08:00',
          },
          {
            id: 'int_m3', title: '提交 Q3 述职报告',
            description: '张姐：10 月 8 号前务必把 Q3 述职报告交了',
            startTime: '2026-10-08T18:00:00+08:00', endTime: '2026-10-08T18:00:00+08:00',
            isAllDay: false, priority: 'urgent', tags: ['待办', '截止'], color: '#e74c3c',
            isCompleted: false, location: '', contact: '张姐',
            sourceText: '张姐: 提醒一下，10 月 8 号前务必把 Q3 述职报告交了',
            createdAt: '2026-10-02T10:10:00+08:00', updatedAt: '2026-10-02T10:10:00+08:00',
          },
          {
            id: 'int_m4', title: '产品发布会彩排',
            description: '陈总：10 月 10 号下午产品发布会彩排，务必全员到场',
            startTime: '2026-10-10T14:00:00+08:00', endTime: '2026-10-10T15:00:00+08:00',
            isAllDay: false, priority: 'urgent', tags: ['待办', '截止'], color: '#e74c3c',
            isCompleted: false, location: '', contact: '陈总',
            sourceText: '陈总: 10 月 10 号下午产品发布会彩排，务必全员到场',
            createdAt: '2026-10-02T10:10:00+08:00', updatedAt: '2026-10-02T10:10:00+08:00',
          },
        ],
        contactHints: [
          {
            id: 'inthint_m6', type: 'contact', title: '王经理',
            content: '新来的产品助理电话 138xxxx，之后对接找她',
            tags: ['群消息', '联系人'], sourceText: '王经理: 对了，新来的产品助理电话 138xxxx，之后对接找她',
            createdAt: '2026-10-02T10:10:00+08:00',
          },
        ],
        warnings: [],
      },
    };
  },
};