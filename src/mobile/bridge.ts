/**
 * ChronoFlow Capacitor 移动端桥
 *
 * 手机端通过 Capacitor Bridge 调用 core/ 业务逻辑。
 * 桌面端走 Electron IPC，手机端走这个，渲染层无感知。
 */

import type { ScheduleApi } from '../shared/api';
import {
  genTableFromText,
  extractHighlights,
  saveClassifiedInfo,
  queryClassifiedItems,
  updateClassifiedItem,
  deleteClassifiedItem,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  querySchedule,
} from '../core/schedule';

// 手机端直接调用 core 层函数，无需 IPC
export const mobileAppApi: ScheduleApi = {
  genTableFromText,
  extractHighlights,
  saveClassifiedInfo,
  queryClassifiedItems,
  updateClassifiedItem,
  deleteClassifiedItem,
  create: createSchedule,
  update: updateSchedule,
  delete: deleteSchedule,
  query: querySchedule,
};

/**
 * 在 Capacitor app 启动时调用，注册到 window.appApi
 * 用法（main.ts）：
 *   import { registerMobileBridge } from '@mobile/bridge'
 *   registerMobileBridge()
 */
export function registerMobileBridge() {
  (window as any).appApi = mobileAppApi;
}