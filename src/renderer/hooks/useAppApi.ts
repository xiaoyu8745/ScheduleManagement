/**
 * ChronoFlow 统一 API 封装（双端通用）
 *
 * 桌面端走 Electron IPC（window.appApi → preload → 主进程）
 * 手机端走 Capacitor Bridge（window.appApi → core/ 直接调用）
 *
 * 渲染层组件不需要关心当前在哪个平台，只管调 useAppApi()。
 *
 * 额外约定：纯浏览器预览环境（既无 preload、也无 registerMobileBridge）
 * 自动降级到 dev/browserMockApi，保证 `electron-vite build` 后用浏览器
 * 直接打开 out/renderer/index.html 也能把界面跑起来。
 */

import { ElMessage } from 'element-plus';
import type {
  GenScheduleTableReq, GenScheduleTableRes,
  ExtractHighlightsReq, ExtractHighlightsRes,
  SaveInfoReq, ClassifiedItem,
  QueryClassifiedReq, ClassifiedQueryRes,
  ScheduleInput, ScheduleItem,
  ScheduleQueryReq, ScheduleQueryRes,
  IntegrateMessagesReq, IntegrateMessagesRes,
} from '../../shared/types';
import type { ScheduleApi } from '../../shared/api';
import { browserMockApi } from '../dev/browserMockApi';

declare global {
  interface Window {
    appApi: ScheduleApi;
  }
}

function fail(msg: string): never {
  ElMessage.error(msg);
  throw new Error(msg);
}

/**
 * Electron IPC 通过结构化克隆（structured clone）传参，Vue 的响应式代理
 * （reactive/ref 深层暴露的 Proxy，如列表行、form.tags）无法被克隆，
 * 会报 "An object could not be cloned."（浏览器/手机端无克隆环节，故只在桌面端触发）。
 *
 * useAppApi 是渲染层所有 API 调用的必经之路，在这里统一把请求参数
 * 深度转成纯 JSON 数据兜底。本项目数据均为 JSON 安全类型
 * （字符串 / 数字 / 布尔 / 数组 / 普通对象），无 Date、Map 等类型，可放心序列化。
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function call<T>(action: () => Promise<{ success: boolean; data?: T; error?: { message: string } }>): Promise<T> {
  let res;
  try {
    res = await action();
  } catch (e) {
    // IPC 通道本身抛错（如真实模式下 Not implemented）
    fail(e instanceof Error ? e.message : '操作失败');
  }
  if (!res.success) {
    fail(res.error?.message || '操作失败');
  }
  return res.data as T;
}

/**
 * Electron 环境返回 preload 暴露的 window.appApi；
 * 手机端返回 registerMobileBridge 注册的同一份 window.appApi；
 * 两者都不存在（纯浏览器预览）时降级到 browserMockApi。
 */
function api(): ScheduleApi {
  return (window as Window & { appApi?: ScheduleApi }).appApi ?? browserMockApi;
}

export function useAppApi() {
  return {
    genTableFromText: (req: GenScheduleTableReq) =>
      call(() => api().genTableFromText(toPlain(req))),
    extractHighlights: (req: ExtractHighlightsReq) =>
      call(() => api().extractHighlights(toPlain(req))),
    saveClassifiedInfo: (req: SaveInfoReq) =>
      call(() => api().saveClassifiedInfo(toPlain(req))),
    queryClassifiedItems: (req: QueryClassifiedReq) =>
      call(() => api().queryClassifiedItems(toPlain(req))),
    updateClassifiedItem: (item: ClassifiedItem) =>
      call(() => api().updateClassifiedItem(toPlain(item))),
    deleteClassifiedItem: (id: string) =>
      call(() => api().deleteClassifiedItem(id)),
    create: (input: ScheduleInput) =>
      call(() => api().create(toPlain(input))),
    update: (item: ScheduleItem) =>
      call(() => api().update(toPlain(item))),
    delete: (id: string) =>
      call(() => api().delete(id)),
    query: (req: ScheduleQueryReq) =>
      call(() => api().query(toPlain(req))),
    integrateMessages: (req: IntegrateMessagesReq) =>
      call(() => api().integrateMessages(toPlain(req))),
  };
}
