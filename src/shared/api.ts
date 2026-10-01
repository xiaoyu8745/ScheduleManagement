// ============================================================
// 渲染进程可见的 API 契约（仅类型） —— 冻结契约，禁止修改
// ============================================================

import type {
  GenScheduleTableReq, GenScheduleTableRes,
  ExtractHighlightsReq, ExtractHighlightsRes,
  SaveInfoReq, ClassifiedItem,
  QueryClassifiedReq, ClassifiedQueryRes,
  ScheduleInput, ScheduleItem,
  ScheduleQueryReq, ScheduleQueryRes,
  IntegrateMessagesReq, IntegrateMessagesRes,
  Result,
} from './types';

export interface ScheduleApi {
  genTableFromText(req: GenScheduleTableReq): Promise<Result<GenScheduleTableRes>>;
  extractHighlights(req: ExtractHighlightsReq): Promise<Result<ExtractHighlightsRes>>;
  saveClassifiedInfo(req: SaveInfoReq): Promise<Result<ClassifiedItem>>;
  queryClassifiedItems(req: QueryClassifiedReq): Promise<Result<ClassifiedQueryRes>>;
  // 契约增量扩展：零散信息编辑/删除（详见 PR 描述，实现层均已同步）
  updateClassifiedItem(item: ClassifiedItem): Promise<Result<ClassifiedItem>>;
  deleteClassifiedItem(id: string): Promise<Result<boolean>>;
  create(input: ScheduleInput): Promise<Result<ScheduleItem>>;
  update(item: ScheduleItem): Promise<Result<ScheduleItem>>;
  delete(id: string): Promise<Result<boolean>>;
  query(req: ScheduleQueryReq): Promise<Result<ScheduleQueryRes>>;
  // 契约增量扩展：云端消息整合（拉取 + 整合一步完成）
  integrateMessages(req: IntegrateMessagesReq): Promise<Result<IntegrateMessagesRes>>;
}