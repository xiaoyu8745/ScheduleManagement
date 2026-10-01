<script setup lang="ts">
/**
 * 分类信息面板 ClassifiedPanel
 *
 * 职责：收纳「时间轴之外」的零散信息 —— 用户随手输入一段文字，
 * 由主进程自动归类（日程 / 参考 / 联系人 / 备注），并支持搜索、筛选、分页浏览。
 *
 * 数据通路：组件 → useAppApi → window.appApi → IPC → 主进程
 * 约束：不 import src/electron/**，不使用 process / require，一律走 useAppApi。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAppApi } from '../hooks/useAppApi';
import type {
  ClassifiedItem,
  ClassifiedQueryRes,
  ClassifiedType,
  QueryClassifiedReq,
} from '../../shared/types';

defineOptions({ name: 'ClassifiedPanel' });

const api = useAppApi();

// ==================== 类型元信息 ====================

/** 四类信息的展示名 + 主题色（配色为需求约定值，勿随意更改） */
const TYPE_META: Record<ClassifiedType, { label: string; color: string }> = {
  schedule: { label: '日程', color: '#4f8cff' },
  reference: { label: '参考', color: '#10b981' },
  contact: { label: '联系人', color: '#8b5cf6' },
  note: { label: '备注', color: '#f39c12' },
};

/** 后端返回未知类型时的兜底样式，避免界面炸掉 */
const TYPE_FALLBACK = { label: '未分类', color: '#909399' };

/** Tab 值：'' 表示「全部」，此时不向接口传 type */
type TabValue = '' | ClassifiedType;

const TABS: ReadonlyArray<{ label: string; value: TabValue }> = [
  { label: '全部', value: '' },
  { label: '日程', value: 'schedule' },
  { label: '参考', value: 'reference' },
  { label: '联系人', value: 'contact' },
  { label: '备注', value: 'note' },
];

function metaOf(type: ClassifiedType | undefined) {
  return (type && TYPE_META[type]) || TYPE_FALLBACK;
}

/** 类型标签的内联配色：纯色文字 + 10% 底色 + 30% 描边 */
function tagStyle(type: ClassifiedType | undefined) {
  const c = metaOf(type).color;
  return { color: c, backgroundColor: `${c}1a`, borderColor: `${c}4d` };
}

// ==================== 状态 ====================

// ---- 输入区 ----
const inputText = ref('');
const saving = ref(false);

// ---- 编辑弹窗 ----
const editVisible = ref(false);
const editSaving = ref(false);
const editForm = ref<{ type: ClassifiedType; title: string; content: string; tagsText: string }>({
  type: 'note',
  title: '',
  content: '',
  tagsText: '',
});
/** 正在编辑的原始条目（保存时回传 id / sourceText / createdAt） */
let editingItem: ClassifiedItem | null = null;

/** 分类下拉/按钮组选项（来自 TYPE_META，天然同源） */
const TYPE_OPTIONS = (Object.keys(TYPE_META) as ClassifiedType[]).map((t) => ({
  value: t,
  label: TYPE_META[t].label,
}));

// ---- 查询条件 ----
const activeType = ref<TabValue>('');
const keyword = ref('');

// ---- 列表与分页 ----
const items = ref<ClassifiedItem[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

/** 是否处于筛选/搜索状态 —— 用于区分「暂无记录」与「无匹配结果」 */
const hasFilter = computed(() => !!activeType.value || !!keyword.value.trim());

// ==================== 查询 ====================

/** 按当前筛选条件拼装请求；空条件不下发，保持请求干净 */
function buildReq(): QueryClassifiedReq {
  const req: QueryClassifiedReq = { page: page.value, pageSize: pageSize.value };
  if (activeType.value) req.type = activeType.value;
  const kw = keyword.value.trim();
  if (kw) req.keyword = kw;
  return req;
}

/**
 * 兼容层：契约规定 items 为「当前页切片」，但现网 mock 数据源未实现分页
 * （src/shared/mock.ts 的 queryClassifiedItems 直接返回全量 items）。
 * 这里做一次防御性归一化：返回条数超出 pageSize 即判定后端未切片，改由渲染层按页切分，
 * 使用户在两种后端下都能正常翻页。后端修复切片后，此分支不再触发，行为不变。
 */
function toPageItems(res: ClassifiedQueryRes | undefined, reqPage: number): ClassifiedItem[] {
  const raw = res?.items ?? [];
  if (raw.length <= pageSize.value) return raw;
  const start = (reqPage - 1) * pageSize.value;
  return raw.slice(start, start + pageSize.value);
}

async function loadItems(): Promise<void> {
  loading.value = true;
  try {
    let res: ClassifiedQueryRes = await api.queryClassifiedItems(buildReq());
    const totalCount = res?.pageInfo?.total ?? (res?.items?.length ?? 0);

    // 防御性越界保护：若当前页已超出总量范围（例如数据被其他视图删减、
    // 或后端分页口径变化），退回有效范围内的最后一页重取一次，
    // 避免出现「有总数却空白」的假空态。常规交互都会先重置到第 1 页，此处兜底。
    if (toPageItems(res, page.value).length === 0 && page.value > 1 && totalCount > 0) {
      const lastPage = Math.max(1, Math.ceil(totalCount / pageSize.value));
      if (lastPage < page.value) {
        page.value = lastPage;
        res = await api.queryClassifiedItems(buildReq());
      }
    }

    items.value = toPageItems(res, page.value);
    total.value = res?.pageInfo?.total ?? items.value.length;
    if (res?.pageInfo?.page) page.value = res.pageInfo.page;
  } catch {
    // useAppApi 已经弹过错误提示，这里只负责把界面落回空态
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// ==================== 保存 ====================

async function handleSave(): Promise<void> {
  const content = inputText.value.trim();
  if (!content) {
    ElMessage.warning('请先输入要保存的内容');
    return;
  }

  saving.value = true;
  try {
    const item = await api.saveClassifiedInfo({ content });
    // 展示后端实际判定的类型（而非前端猜测），便于用户发现归类偏差
    ElMessage.success(`已归类为：${item?.type ?? '未知'}`);
    inputText.value = '';
    // 回到「全部」+ 第一页，确保刚保存的条目一定能被看到
    activeType.value = '';
    page.value = 1;
    await loadItems();
  } catch {
    // useAppApi 已经弹过错误提示
  } finally {
    saving.value = false;
  }
}

// ==================== 编辑 / 删除 ====================

/** 条目稳定 Key：优先 id，旧数据（无 id）回退 createdAt */
function itemKey(item: ClassifiedItem): string {
  return item.id ?? item.createdAt;
}

/** 打开编辑弹窗，用当前条目预填表单 */
function startEdit(item: ClassifiedItem): void {
  editingItem = item;
  editForm.value = {
    type: item.type,
    title: item.title,
    content: item.content,
    tagsText: (item.tags ?? []).join(' '),
  };
  editVisible.value = true;
}

async function handleEditSave(): Promise<void> {
  if (!editingItem) return;
  const content = editForm.value.content.trim();
  if (!content) {
    ElMessage.warning('内容不能为空');
    return;
  }

  editSaving.value = true;
  try {
    const tags = editForm.value.tagsText
      .trim()
      .split(/[\s,，、]+/)
      .filter(Boolean);
    await api.updateClassifiedItem({
      ...editingItem,
      id: itemKey(editingItem),
      type: editForm.value.type,
      // 标题留空时按保存时的规则自动取内容前 20 字
      title: editForm.value.title.trim() || content.slice(0, 20),
      content,
      tags,
    });
    ElMessage.success('已保存修改');
    editVisible.value = false;
    await loadItems();
  } catch {
    // useAppApi 已经弹过错误提示
  } finally {
    editSaving.value = false;
  }
}

async function handleDelete(item: ClassifiedItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「${item.title || '这条记录'}」吗？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  try {
    const ok = await api.deleteClassifiedItem(itemKey(item));
    if (ok) ElMessage.success('已删除');
    else ElMessage.warning('记录不存在或已被删除');
    await loadItems();
  } catch {
    // useAppApi 已经弹过错误提示
  }
}

// ==================== 交互 ====================

function handleTabChange(): void {
  page.value = 1;
  void loadItems();
}

function handleSearch(): void {
  page.value = 1;
  void loadItems();
}

function handlePageChange(next: number): void {
  page.value = next;
  void loadItems();
}

// ==================== 展示辅助 ====================

/** content 预览：前 50 字，超出加省略号 */
function preview(text: string | undefined): string {
  const s = text ?? '';
  return s.length > 50 ? `${s.slice(0, 50)}…` : s;
}

/** ISO8601 → 本地可读时间（YYYY-MM-DD HH:mm） */
function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

onMounted(() => {
  void loadItems();
});
</script>

<template>
  <section class="classified-panel">
    <header class="panel-header">
      <h2 class="panel-title">零散信息</h2>
      <p class="panel-subtitle">随手记一段，系统自动归类</p>
    </header>

    <!-- ==================== 输入区 ==================== -->
    <div class="save-block">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        resize="none"
        maxlength="500"
        show-word-limit
        placeholder="粘贴或输入任意内容，例如：王经理电话 138xxxx，产品部负责人"
        @keydown.ctrl.enter.prevent="handleSave"
      />
      <div class="save-actions">
        <span class="hint">Ctrl + Enter 快速保存</span>
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存
        </el-button>
      </div>
    </div>

    <!-- ==================== 分类 Tab ==================== -->
    <el-tabs v-model="activeType" class="type-tabs" @tab-change="handleTabChange">
      <el-tab-pane
        v-for="tab in TABS"
        :key="tab.value || 'all'"
        :label="tab.label"
        :name="tab.value"
      />
    </el-tabs>

    <!-- ==================== 搜索栏 ==================== -->
    <div class="search-block">
      <el-input
        v-model="keyword"
        clearable
        placeholder="搜索标题或内容关键词"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-button :loading="loading" @click="handleSearch">搜索</el-button>
    </div>

    <!-- ==================== 列表 ==================== -->
    <div v-loading="loading" class="list-block">
      <el-empty
        v-if="!loading && items.length === 0"
        :description="hasFilter ? '没有匹配的记录，换个关键词试试' : '还没有记录，输入点内容保存试试'"
        :image-size="80"
      />

      <ul v-else class="item-list">
        <li v-for="(item, idx) in items" :key="`${itemKey(item)}-${idx}`" class="item">
          <span class="item-actions">
            <el-button link type="primary" size="small" @click="startEdit(item)">编辑</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(item)">删除</el-button>
          </span>

          <div class="item-head">
            <span class="type-tag" :style="tagStyle(item.type)">
              {{ metaOf(item.type).label }}
            </span>
            <span class="item-title" :title="item.title">{{ item.title }}</span>
            <span class="item-time">{{ formatTime(item.createdAt) }}</span>
          </div>

          <p class="item-content">{{ preview(item.content) }}</p>

          <div v-if="item.tags?.length" class="item-tags">
            <el-tag
              v-for="tag in item.tags"
              :key="tag"
              size="small"
              type="info"
              effect="plain"
            >
              {{ tag }}
            </el-tag>
          </div>
        </li>
      </ul>
    </div>

    <!-- ==================== 编辑弹窗 ==================== -->
    <el-dialog
      v-model="editVisible"
      title="编辑零散信息"
      width="440px"
      :close-on-click-modal="false"
      class="edit-dialog"
    >
      <el-form label-width="48px" label-position="left">
        <el-form-item label="分类">
          <el-radio-group v-model="editForm.type">
            <el-radio-button
              v-for="opt in TYPE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题">
          <el-input
            v-model="editForm.title"
            maxlength="30"
            placeholder="留空则自动取内容前 20 字"
          />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="editForm.content"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            @keydown.ctrl.enter.prevent="handleEditSave"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="editForm.tagsText"
            placeholder="用空格或逗号分隔，例如：产品 路线图"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="handleEditSave">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- ==================== 分页 ==================== -->
    <footer v-if="total > 0" class="panel-footer">
      <span class="total">共 {{ total }} 条</span>
      <el-pagination
        background
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="handlePageChange"
      />
    </footer>
  </section>
</template>

<style scoped>
.classified-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  height: 100%;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
}

/* ---------- 头部 ---------- */
.panel-header {
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}
.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
}
.panel-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a919f;
}

/* ---------- 输入区 ---------- */
.save-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.save-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hint {
  font-size: 12px;
  color: #b0b6c0;
}

/* ---------- Tab ---------- */
.type-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}
.type-tabs :deep(.el-tabs__item) {
  font-size: 13px;
}

/* ---------- 搜索 ---------- */
.search-block {
  display: flex;
  gap: 8px;
}

/* ---------- 列表容器 ---------- */
.list-block {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
}

/* ---------- 列表 ---------- */
.item-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ---------- 单条记录 ---------- */
.item {
  position: relative;
  padding: 10px 12px;
  background: #fafbfc;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  transition: background-color 0.15s, border-color 0.15s;
}
.item:hover {
  background: #f5f7fa;
  border-color: #dbe1e8;
}

/* 悬浮操作按钮：右上角，悬停显现（渐变底遮住时间文字）；触屏设备无 hover，常显 */
.item-actions {
  position: absolute;
  top: 5px;
  right: 8px;
  z-index: 1;
  display: flex;
  gap: 2px;
  padding-left: 14px;
  opacity: 0;
  background: linear-gradient(to right, transparent, #f5f7fa 35%);
  transition: opacity 0.15s;
}
.item:hover .item-actions {
  opacity: 1;
}
@media (hover: none) {
  .item-actions {
    opacity: 1;
  }
}
.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.type-tag {
  flex: none;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 16px;
  border: 1px solid transparent;
  border-radius: 4px;
}
.item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: #1f2329;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.item-time {
  flex: none;
  font-size: 11px;
  color: #a0a6b0;
}
.item-content {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #5c6270;
  word-break: break-word;
}
.item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

/* ---------- 分页 ---------- */
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid #f0f2f5;
}
.total {
  font-size: 12px;
  color: #8a919f;
}
</style>