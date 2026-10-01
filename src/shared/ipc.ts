// ============================================================
// ChronoFlow IPC 通道常量 —— 冻结契约，禁止修改
// 命名格式：domain:action
// ============================================================

export const IPC = {
  // ============ 日程表主通道（暴露给渲染进程） ============
  SCHEDULE_GEN_TABLE:       'schedule:genTableFromText',
  SCHEDULE_EXTRACT_HIGHLIGHTS: 'schedule:extractHighlights',
  SCHEDULE_SAVE_CLASSIFIED: 'schedule:saveClassifiedInfo',
  SCHEDULE_QUERY_CLASSIFIED: 'schedule:queryClassifiedItems',
  SCHEDULE_UPDATE_CLASSIFIED: 'schedule:updateClassifiedItem',
  SCHEDULE_DELETE_CLASSIFIED: 'schedule:deleteClassifiedItem',
  SCHEDULE_CREATE:          'schedule:create',
  SCHEDULE_UPDATE:          'schedule:update',
  SCHEDULE_DELETE:          'schedule:delete',
  SCHEDULE_QUERY:           'schedule:query',

  // ============ 内嵌搜索 Agent（内部调用，不暴露给渲染进程） ============
  SEARCH_MULTI_PLATFORM:    'search:multiPlatformQuery',
  SEARCH_GET_SUMMARY:       'search:getSummary',
} as const;