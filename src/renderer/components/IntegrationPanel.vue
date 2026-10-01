<script setup lang="ts">
/**
 * 云端消息整合面板 IntegrationPanel
 *
 * 职责：从协作平台（飞书/钉钉/企业微信，或手动）拉取群聊消息，
 * 自动「检查并整合」成：整体摘要 + 归纳要点 + 日程/待办草稿 + 联系人线索。
 * 用户可以一键把提取出的日程草稿导入到日程表。
 *
 * 数据通路：组件 → useAppApi → window.appApi → IPC → 主进程（真实平台）
 *         或 → browserMockApi（纯浏览器预览降级）
 * 约束：不 import src/electron/**，一律走 useAppApi。
 */
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useAppApi } from '../hooks/useAppApi';
import { useScheduleStore } from '../hooks/useScheduleStore';
import type {
  IntegrationSource,
  IntegrateMessagesRes,
  ScheduleItem,
} from '../../shared/types';

defineOptions({ name: 'IntegrationPanel' });

const api = useAppApi();
const store = useScheduleStore();

const visible = ref(false);

/** 平台元信息（manual 为兜底，真实平台会扩展） */
const SOURCE_OPTIONS: Array<{ value: IntegrationSource; label: string; desc: string }> = [
  { value: 'feishu', label: '飞书', desc: '需在 .env 配置 App ID / Secret' },
  { value: 'dingtalk', label: '钉钉', desc: '即将支持' },
  { value: 'wecom', label: '企业微信', desc: '即将支持' },
];

const form = reactive({
  source: 'feishu' as IntegrationSource,
  chatId: '',
  limit: 50,
});

const loading = ref(false);
const result = ref<IntegrateMessagesRes | null>(null);
const importing = ref(false);

/** 是否已拉取到结果 */
const hasResult = computed(() => result.value !== null);

async function run() {
  loading.value = true;
  result.value = null;
  try {
    const res = await api.integrateMessages({
      source: form.source,
      chatId: form.chatId.trim() || undefined,
      limit: form.limit,
    });
    result.value = res;
    ElMessage.success(`整合完成：检查 ${res.synthesis.messageCount} 条消息`);
  } catch {
    /* useAppApi 已提示 */
  } finally {
    loading.value = false;
  }
}

/** 一键导入提取出的日程草稿 */
async function importDrafts() {
  const drafts = result.value?.synthesis.draftSchedules ?? [];
  if (!drafts.length) {
    ElMessage.warning('没有可导入的日程');
    return;
  }
  importing.value = true;
  try {
    // 去掉整合草稿的临时 id，走正常创建
    const cleaned: ScheduleItem[] = drafts.map((d) => ({ ...d }));
    const ok = await store.importDrafts(cleaned);
    ElMessage.success(`已导入 ${ok} 条日程`);
    result.value = null;
  } finally {
    importing.value = false;
  }
}

function open() {
  visible.value = true;
  result.value = null;
}
function close() {
  visible.value = false;
}

defineExpose({ open, close });
</script>

<template>
  <el-dialog
    v-model="visible"
    title="云端消息整合"
    width="720px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <!-- 配置区 -->
    <section class="cfg">
      <div class="cfg-row">
        <span class="cfg-label">平台</span>
        <el-select v-model="form.source" class="cfg-select" placeholder="选择平台">
          <el-option
            v-for="opt in SOURCE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          >
            <span>{{ opt.label }}</span>
            <span class="opt-desc">{{ opt.desc }}</span>
          </el-option>
        </el-select>
        <span class="cfg-label">群 ID</span>
        <el-input
          v-model="form.chatId"
          class="cfg-chat"
          placeholder="飞书群 chat_id（Mock 模式可留空）"
        />
        <el-button type="primary" :loading="loading" @click="run">🔍 检查并整合</el-button>
      </div>
      <p class="cfg-hint">
        当前为演示数据（Mock 模式）。接入真实飞书群请参考「接入配置指南」，在 .env 配置凭证后切换 MOCK_MODE=false。
      </p>
    </section>

    <!-- 结果区 -->
    <template v-if="hasResult">
      <el-divider content-position="left">整合结果</el-divider>

      <!-- 摘要 -->
      <section class="summary">{{ result!.synthesis.summary }}</section>

      <!-- 归纳要点 -->
      <section v-if="result!.synthesis.keyPoints.length" class="block">
        <h4>📌 归纳要点</h4>
        <ul class="points">
          <li v-for="(p, i) in result!.synthesis.keyPoints" :key="i" class="point">
            <span class="point-speaker">{{ p.speakers.join('、') }}</span>
            <span class="point-text">{{ p.text }}</span>
            <el-tag size="small" effect="plain" :type="p.confidence >= 0.8 ? 'success' : 'info'">
              {{ Math.round(p.confidence * 100) }}%
            </el-tag>
          </li>
        </ul>
      </section>

      <!-- 提取的日程/待办 -->
      <section v-if="result!.synthesis.draftSchedules.length" class="block">
        <h4>🗓 提取到的日程 / 待办（{{ result!.synthesis.draftSchedules.length }}）</h4>
        <ul class="drafts">
          <li v-for="d in result!.synthesis.draftSchedules" :key="d.id" class="draft">
            <span class="color-dot" :style="{ background: d.color }" />
            <div class="draft-body">
              <div class="draft-title">
                {{ d.title }}
                <el-tag size="small" effect="light" :type="d.priority === 'urgent' || d.priority === 'high' ? 'danger' : 'info'">
                  {{ d.priority }}
                </el-tag>
              </div>
              <div class="draft-desc">{{ d.description }}</div>
            </div>
          </li>
        </ul>
      </section>

      <!-- 联系人线索 -->
      <section v-if="result!.synthesis.contactHints.length" class="block">
        <h4>👤 联系人线索（{{ result!.synthesis.contactHints.length }}）</h4>
        <ul class="hints">
          <li v-for="h in result!.synthesis.contactHints" :key="h.id ?? h.createdAt" class="hint">
            {{ h.content }}
          </li>
        </ul>
      </section>

      <!-- 警告 -->
      <section v-if="result!.synthesis.warnings.length" class="warnings">
        <p v-for="(w, i) in result!.synthesis.warnings" :key="i">⚠ {{ w }}</p>
      </section>
    </template>

    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button
        v-if="hasResult && result!.synthesis.draftSchedules.length"
        type="primary"
        :loading="importing"
        @click="importDrafts"
      >
        导入全部日程（{{ result!.synthesis.draftSchedules.length }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cfg {
  padding: 6px 2px;
}
.cfg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cfg-label {
  font-size: 13px;
  color: #5d6b7f;
  flex-shrink: 0;
}
.cfg-select {
  width: 140px;
}
.cfg-chat {
  width: 200px;
}
.opt-desc {
  float: right;
  color: #b0b8c4;
  font-size: 12px;
  margin-left: 12px;
}
.cfg-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #98a4b6;
}

.summary {
  padding: 12px 14px;
  background: #f7f9fd;
  border-left: 3px solid #4f8cff;
  border-radius: 8px;
  font-size: 13px;
  color: #3a4658;
  line-height: 1.6;
}

.block {
  margin-top: 14px;
}
.block h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2933;
}

.points,
.drafts,
.hints {
  list-style: none;
  margin: 0;
  padding: 0;
}
.point {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fafbfc;
  border: 1px solid #eef0f3;
  margin-bottom: 6px;
  font-size: 13px;
}
.point-speaker {
  flex-shrink: 0;
  font-size: 12px;
  color: #4f8cff;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 999px;
}
.point-text {
  flex: 1;
  color: #2b3646;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fafbfc;
  border: 1px solid #eef0f3;
  margin-bottom: 6px;
}
.color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.draft-body {
  min-width: 0;
}
.draft-title {
  font-size: 13px;
  font-weight: 600;
  color: #2b3646;
  display: flex;
  align-items: center;
  gap: 6px;
}
.draft-desc {
  margin-top: 3px;
  font-size: 12px;
  color: #98a4b6;
  line-height: 1.5;
}

.hint {
  padding: 8px 10px;
  border-radius: 8px;
  background: #fbf8ff;
  border: 1px solid #f0e9ff;
  margin-bottom: 6px;
  font-size: 13px;
  color: #5b4a86;
}

.warnings {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7e6;
  border: 1px solid #ffe2b3;
}
.warnings p {
  margin: 0 0 4px;
  font-size: 12px;
  color: #a8761e;
}
</style>
