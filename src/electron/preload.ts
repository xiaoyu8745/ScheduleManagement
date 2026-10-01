/**
 * ChronoFlow Electron 预加载脚本
 * 【集成工程师维护】
 *
 * 安全约定：仅暴露 schedule:* 白名单，search:* 绝不出现在这里。
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { ScheduleApi } from '../shared/api';

const appApi: ScheduleApi = {
  genTableFromText:    (req) => ipcRenderer.invoke(IPC.SCHEDULE_GEN_TABLE, req),
  extractHighlights:   (req) => ipcRenderer.invoke(IPC.SCHEDULE_EXTRACT_HIGHLIGHTS, req),
  saveClassifiedInfo:  (req) => ipcRenderer.invoke(IPC.SCHEDULE_SAVE_CLASSIFIED, req),
  queryClassifiedItems:(req) => ipcRenderer.invoke(IPC.SCHEDULE_QUERY_CLASSIFIED, req),
  updateClassifiedItem:(item) => ipcRenderer.invoke(IPC.SCHEDULE_UPDATE_CLASSIFIED, item),
  deleteClassifiedItem:(id) => ipcRenderer.invoke(IPC.SCHEDULE_DELETE_CLASSIFIED, id),
  create:              (input) => ipcRenderer.invoke(IPC.SCHEDULE_CREATE, input),
  update:              (item) => ipcRenderer.invoke(IPC.SCHEDULE_UPDATE, item),
  delete:              (id) => ipcRenderer.invoke(IPC.SCHEDULE_DELETE, id),
  query:               (req) => ipcRenderer.invoke(IPC.SCHEDULE_QUERY, req),
};

contextBridge.exposeInMainWorld('appApi', appApi);