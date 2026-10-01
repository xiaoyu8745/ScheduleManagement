/**
 * 浏览器降级 Mock —— 仅用于「脱离 Electron 的纯前端预览 / 调试」。
 *
 * Electron 运行时会走 preload 暴露的真实 window.appApi，永远不会命中这里；
 * 只有在浏览器里直接打开渲染层（window.appApi 为 undefined）时才兜底，
 * 复用 src/shared/mock.ts 的样例数据，保证 UI 可交互、可截图。
 */

import type { ScheduleApi } from '../../shared/api';
import type { Result } from '../../shared/types';
import { mockScheduleData } from '../../shared/mock';

const delay = (ms = 220) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function call<T>(fn: () => T): Promise<Result<T>> {
  await delay();
  try {
    return { success: true, data: fn() };
  } catch (e) {
    return {
      success: false,
      error: {
        code: 'E_BROWSER_MOCK',
        message: e instanceof Error ? e.message : '浏览器 Mock 调用失败',
      },
    };
  }
}

export const browserMockApi: ScheduleApi = {
  genTableFromText: (req) => call(() => mockScheduleData.genTableFromText(req)),
  extractHighlights: (req) => call(() => mockScheduleData.extractHighlights(req)),
  saveClassifiedInfo: (req) => call(() => mockScheduleData.saveClassifiedInfo(req)),
  queryClassifiedItems: (req) => call(() => mockScheduleData.queryClassifiedItems(req)),
  updateClassifiedItem: (item) => call(() => mockScheduleData.updateClassifiedItem(item)),
  deleteClassifiedItem: (id) => call(() => mockScheduleData.deleteClassifiedItem(id)),
  create: (input) => call(() => mockScheduleData.create(input)),
  update: (item) => call(() => mockScheduleData.update(item)),
  delete: (id) => call(() => mockScheduleData.delete(id)),
  query: (req) => call(() => mockScheduleData.query(req)),
};
