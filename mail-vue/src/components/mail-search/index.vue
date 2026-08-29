<template>
  <div class="search-wrap">
    <el-input v-model="keyword" :placeholder="$t('searchPlaceholder')" clearable
              @keyup.enter="run" @clear="clear" ref="inputRef">
      <template #prefix>
        <Icon icon="mingcute:search-line" width="18" height="18"/>
      </template>
      <template #suffix>
        <Icon class="filter-toggle" :class="filtersOpen ? 'on' : ''"
              icon="mingcute:filter-line" width="18" height="18"
              @click.stop="filtersOpen = !filtersOpen"/>
      </template>
    </el-input>

    <div v-if="filtersOpen" class="filters">
      <el-input v-model="filters.from" :placeholder="$t('searchFrom')" size="small" clearable/>
      <el-input v-model="filters.to" :placeholder="$t('searchTo')" size="small" clearable/>
      <el-date-picker v-model="filters.since" type="date" size="small" value-format="YYYY-MM-DD"
                      :placeholder="$t('searchSince')"/>
      <el-date-picker v-model="filters.until" type="date" size="small" value-format="YYYY-MM-DD"
                      :placeholder="$t('searchUntil')"/>
      <el-checkbox v-model="filters.hasAtt" size="small">{{ $t('searchHasAtt') }}</el-checkbox>
      <el-button size="small" type="primary" :loading="loading" @click="run">{{ $t('search') }}</el-button>
      <el-button size="small" @click="clear">{{ $t('searchClear') }}</el-button>
    </div>

    <div v-if="active" class="results">
      <div v-if="!results.length && !loading" class="empty">{{ $t('searchNoResults') }}</div>
      <div v-for="row in results" :key="row.emailId" class="result" @click="$emit('open', row)">
        <div class="result-top">
          <span class="who">{{ row.name || row.sendEmail }}</span>
          <span class="when">{{ row.createTime?.slice(0, 16) }}</span>
        </div>
        <div class="subject">{{ row.subject || '(no subject)' }}</div>
        <div class="snippet">{{ row.text }}</div>
        <div v-if="row.labels?.length" class="chips">
          <el-tag v-for="l in row.labels" :key="l.labelId" size="small"
                  :color="l.color || undefined" effect="plain">{{ l.name }}</el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {nextTick, reactive, ref} from "vue";
import {Icon} from "@iconify/vue";
import {searchEmail} from "@/request/search.js";

defineEmits(['open'])
defineExpose({focus})

const keyword = ref('')
const filtersOpen = ref(false)
const loading = ref(false)
const active = ref(false)
const results = ref([])
const inputRef = ref(null)
const filters = reactive({from: '', to: '', since: '', until: '', hasAtt: false})

function focus() {
  nextTick(() => inputRef.value?.focus())
}

function hasCriteria() {
  return !!(keyword.value.trim() || filters.from || filters.to || filters.since || filters.until || filters.hasAtt)
}

async function run() {
  // An empty query would return the whole mailbox one page at a time, which is
  // just the inbox with extra steps - and a wasted D1 read on the free plan.
  if (!hasCriteria()) {
    clear()
    return
  }

  loading.value = true
  active.value = true
  try {
    results.value = await searchEmail({
      keyword: keyword.value.trim(),
      from: filters.from || undefined,
      to: filters.to || undefined,
      since: filters.since || undefined,
      until: filters.until || undefined,
      hasAtt: filters.hasAtt ? 1 : undefined,
      size: 30
    })
  } finally {
    loading.value = false
  }
}

function clear() {
  keyword.value = ''
  Object.assign(filters, {from: '', to: '', since: '', until: '', hasAtt: false})
  results.value = []
  active.value = false
}
</script>

<style scoped lang="scss">
.search-wrap {
  position: relative;
  padding: 8px 10px;
}

.filter-toggle {
  cursor: pointer;

  &.on {
    color: var(--el-color-primary);
  }
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;

  .el-input, .el-date-editor {
    width: 150px;
  }
}

.results {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 100%;
  z-index: 20;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
}

.empty {
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.result {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.result-top {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.subject {
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snippet {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chips {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
</style>
