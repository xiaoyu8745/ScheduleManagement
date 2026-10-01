/**
 * ChronoFlow Electron 主进程入口
 * 【集成工程师维护】
 *
 * 职责：
 *   1. 创建 BrowserWindow，加载 preload + 渲染页面
 *   2. 注册全部 IPC handler（schedule:* + search:* 内部）
 *
 * 注：主进程产物为 CJS（见 electron.vite.config.ts 的 formats: ['cjs']），
 * 因此这里直接使用 __dirname，不用 ESM 的 import.meta.url。
 */

// 必须排在所有 import 之前：把项目根 .env 加载进 process.env，
// 供冻结契约 src/shared/config.ts 读取 MOCK_MODE（CJS 按 require 顺序求值）。
import '../core/load-env';

import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { join } from 'path';
import { IPC } from '../shared/ipc';
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
import { multiPlatformQuery, getSummary } from '../core/search-agent';

// ==================== 安全约定 ====================
// contextIsolation=true、nodeIntegration=false，由 BrowserWindow 默认值保证，
// 这里显式声明 webPreferences 以确保安全。
// sandbox 保持 false：preload 产物虽已为 CJS，但保留原设置以免影响既有行为。

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#eef2f8',
    title: 'ChronoFlow 智能日程',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 等首帧渲染完成再显示，避免白屏闪烁
  win.once('ready-to-show', () => win.show());

  // 开发模式：加载 electron-vite 的 dev server
  // 生产模式：加载打包后的 index.html
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ==================== IPC 注册 ====================

function registerIpcHandlers(): void {
  // ---------- schedule:* 通道（暴露给渲染进程） ----------
  ipcMain.handle(IPC.SCHEDULE_GEN_TABLE, (_e, req) => genTableFromText(req));
  ipcMain.handle(IPC.SCHEDULE_EXTRACT_HIGHLIGHTS, (_e, req) => extractHighlights(req));
  ipcMain.handle(IPC.SCHEDULE_SAVE_CLASSIFIED, (_e, req) => saveClassifiedInfo(req));
  ipcMain.handle(IPC.SCHEDULE_QUERY_CLASSIFIED, (_e, req) => queryClassifiedItems(req));
  ipcMain.handle(IPC.SCHEDULE_UPDATE_CLASSIFIED, (_e, item) => updateClassifiedItem(item));
  ipcMain.handle(IPC.SCHEDULE_DELETE_CLASSIFIED, (_e, id) => deleteClassifiedItem(id));
  ipcMain.handle(IPC.SCHEDULE_CREATE, (_e, input) => createSchedule(input));
  ipcMain.handle(IPC.SCHEDULE_UPDATE, (_e, item) => updateSchedule(item));
  ipcMain.handle(IPC.SCHEDULE_DELETE, (_e, id) => deleteSchedule(id));
  ipcMain.handle(IPC.SCHEDULE_QUERY, (_e, req) => querySchedule(req));

  // ---------- search:* 通道（内部，不暴露给渲染进程） ----------
  ipcMain.handle(IPC.SEARCH_MULTI_PLATFORM, (_e, req) => multiPlatformQuery(req));
  ipcMain.handle(IPC.SEARCH_GET_SUMMARY, (_e, req) => getSummary(req));
}

// ==================== 应用生命周期 ====================

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // 移除默认菜单栏（File/Edit/View...），界面更干净
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    // macOS：点击 Dock 图标时若无窗口则重建
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS 之外，关闭所有窗口即退出应用
  if (process.platform !== 'darwin') app.quit();
});