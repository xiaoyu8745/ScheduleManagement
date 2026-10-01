<script setup lang="ts">
/**
 * ChronoFlow 根组件 —— Task 6：根组件 + 布局（P4 实现）
 *
 * 职责：把三个子组件串成一个「调度中心」
 *   1. 顶部导航栏（ElHeader）：标题「ChronoFlow 智能日程」
 *   2. 布局（ElContainer）：ElAside width=30% → ClassifiedPanel
 *                         1px 分割线
 *                         ElMain → ScheduleTable
 *   3. 全局弹窗控制：HighlightPreviewModal 挂在根级，由 App 统一开关
 *   4. 响应式：左右两栏撑满 100vh，窄屏（@media）上下堆叠，Aside 在上
 *
 * ── 与文档提示词的一处有意差异（重要）────────────────────────────
 * 文档用 props/emits（visible / close / imported / open-highlight）在 App 内
 * 用 local ref 做弹窗调度；本仓库的跨组件状态已统一收敛在
 * hooks/useScheduleStore.ts，因此 `showHighlight` 用 computed 读写 store.preview，
 * 语义与文档一致（true = 弹窗打开）：
 *     ScheduleTable open-highlight   → store.openPreview(payload) → 弹窗打开
 *     HighlightPreviewModal close    → store.closePreview()       → 弹窗关闭
 *     HighlightPreviewModal imported → 关闭弹窗 + 刷新日程表
 * 同时下面仍挂载了三个契约事件的监听，任一子组件将来改用 emits 也不会掉线。
 * 三个子组件（ScheduleTable / ClassifiedPanel / HighlightPreviewModal）保持不变。
 */
import { computed, ref } from 'vue';
import ScheduleTable from './components/ScheduleTable.vue';
import ClassifiedPanel from './components/ClassifiedPanel.vue';
import HighlightPreviewModal from './components/HighlightPreviewModal.vue';
import IntegrationPanel from './components/IntegrationPanel.vue';
import type { HighlightSegment, ScheduleItem } from '../shared/types';
import { useScheduleStore, type PreviewPayload } from './hooks/useScheduleStore';

const store = useScheduleStore();
const { state } = store;

/** 子组件若改用 emits，事件载荷形如文档里的 highlights / draftSchedules / fullText */
interface OpenHighlightPayload {
  title?: string;
  sourceText?: string;
  fullText?: string;
  highlights?: HighlightSegment[];
  draftSchedules?: ScheduleItem[];
}

// ==================== 全局弹窗控制 ====================

/**
 * showHighlight：文档要求的弹窗开关 ref。
 * 这里做成 store.preview 的可读写视图，保证「唯一数据源」不被 App 复制一份。
 */
const showHighlight = computed<boolean>({
  get: () => state.preview !== null,
  set: (next) => {
    if (!next) store.closePreview();
  },
});

/** 文档要求把 highlights / draftSchedules / fullText 暂存到 ref（保留下来便于调试与断言） */
const highlightPayload = ref<Pick<PreviewPayload, 'fullText' | 'highlights' | 'draftSchedules'>>({
  fullText: '',
  highlights: [],
  draftSchedules: [],
});

/** HighlightPreviewModal @close → 关闭弹窗 */
function onCloseHighlight() {
  showHighlight.value = false;
}

/** ScheduleTable @open-highlight → 暂存载荷并打开弹窗（store 路径已打开时为幂等覆盖） */
function onOpenHighlight(payload?: OpenHighlightPayload) {
  highlightPayload.value = {
    fullText: payload?.fullText ?? '',
    highlights: payload?.highlights ?? [],
    draftSchedules: payload?.draftSchedules ?? [],
  };
  store.openPreview({
    kind: 'highlight',
    title: payload?.title || '文本划重点',
    sourceText: payload?.sourceText || highlightPayload.value.fullText,
    ...highlightPayload.value,
  });
}

// ==================== 日程表刷新 ====================

const tableRef = ref<InstanceType<typeof ScheduleTable> | null>(null);

/** 优先调 ScheduleTable 暴露的 refresh()，未暴露时退回 store.refresh() */
function refreshScheduleTable() {
  const exposed = tableRef.value as unknown as { refresh?: () => void } | null;
  if (exposed && typeof exposed.refresh === 'function') exposed.refresh();
  else void store.refresh();
}

/** HighlightPreviewModal @imported → 关闭弹窗 + 刷新日程表 */
function onImported() {
  showHighlight.value = false;
  refreshScheduleTable();
}

// ==================== 云端消息整合 ====================

const integrationRef = ref<InstanceType<typeof IntegrationPanel> | null>(null);

function openIntegration() {
  integrationRef.value?.open();
}
</script>

<template>
  <el-container class="chrono-app" direction="vertical" :class="{ 'preview-open': showHighlight }">
    <!-- ========== 1. 顶部导航栏 ========== -->
    <el-header class="chrono-header" height="72px">
      <div class="brand">
        <span class="brand-mark">CF</span>
        <div class="brand-text">
          <h1>ChronoFlow 智能日程</h1>
          <p>把零散的日程信息，变成一张自动整理好的智能日程表</p>
        </div>
      </div>
      <div class="header-right">
        <el-button class="integrate-btn" type="primary" plain size="small" @click="openIntegration">
          ☁ 云端整合
        </el-button>
        <span class="mode-badge">共 {{ state.schedules.length }} 条日程</span>
        <span class="mode-badge">ChronoFlow v1.0</span>
      </div>
    </el-header>

    <!-- ========== 2. 主体：左 30% / 1px 分割线 / 右 70% ========== -->
    <el-container class="chrono-body">
      <el-aside class="chrono-aside" width="30%">
        <ClassifiedPanel />
      </el-aside>

      <div class="split-line" aria-hidden="true" />

      <el-main class="chrono-main">
        <ScheduleTable ref="tableRef" @open-highlight="onOpenHighlight" />
      </el-main>
    </el-container>
  </el-container>

  <!-- ========== 3. 全局弹窗 ========== -->
  <HighlightPreviewModal @close="onCloseHighlight" @imported="onImported" />
  <IntegrationPanel ref="integrationRef" />
</template>

<style>
/* 全局基础样式（随根组件一起加载） */
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
}
body {
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  background: #eef2f8;
  color: #1f2933;
  -webkit-font-smoothing: antialiased;
}
* {
  box-sizing: border-box;
}
</style>

<style scoped>
/* ========== 外壳：撑满 100vh ========== */
.chrono-app {
  height: 100vh;
  padding: 16px 18px 18px;
  gap: 14px;
  background: linear-gradient(160deg, #f3f7ff 0%, #eef2f8 42%, #eaf0f9 100%);
  overflow: hidden;
}
.chrono-app.preview-open {
  overflow: hidden;
}

/* ========== 顶部导航栏 ========== */
.chrono-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  box-sizing: border-box;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.brand-mark {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
  background: linear-gradient(135deg, #4f8cff 0%, #7b6bff 100%);
  box-shadow: 0 6px 16px rgba(79, 140, 255, 0.35);
}
.brand-text {
  min-width: 0;
}
.brand-text h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1f2933;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.brand-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #8c98a8;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.integrate-btn {
  margin-right: 4px;
}
.mode-badge {
  font-size: 11px;
  color: #8c98a8;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e6ebf3;
}

/* ========== 主体两栏 ========== */
.chrono-body {
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.chrono-aside {
  width: 30%;
  flex: 0 0 30%;
  min-width: 0;
  min-height: 0;
  padding-right: 14px;
}

/* 两栏之间的 1px 分割线 */
.split-line {
  flex: 0 0 1px;
  width: 1px;
  align-self: stretch;
  background: #e3e9f2;
}

.chrono-main {
  flex: 1 1 70%;
  min-width: 0;
  min-height: 0;
  padding: 0 0 0 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ========== 响应式适配 ========== */
/* 中等屏幕：左侧固定宽度，避免 30% 把分类面板压得太窄 */
@media (max-width: 1180px) {
  .chrono-aside {
    width: 340px;
    flex-basis: 340px;
  }
}

/* 窄屏：上下堆叠，Aside 在上，分割线转为横线 */
@media (max-width: 900px) {
  .chrono-app {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }
  .chrono-body {
    flex-direction: column;
  }
  .chrono-aside {
    width: 100%;
    flex: 0 0 auto;
    height: 46vh;
    min-height: 300px;
    padding: 0 0 14px;
  }
  .split-line {
    flex: 0 0 1px;
    width: 100%;
    height: 1px;
  }
  .chrono-main {
    flex: 1 1 auto;
    min-height: 520px;
    padding: 14px 0 0;
    overflow: visible;
  }
}
</style>