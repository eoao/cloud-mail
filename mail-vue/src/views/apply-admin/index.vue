<template>
  <div class="apply-admin">
    <div class="header-actions">
      <el-select v-model="query.status" class="status-select" :placeholder="$t('all')" clearable @change="search">
        <el-option :label="$t('auditPending')" :value="0"/>
        <el-option :label="$t('auditApproved')" :value="1"/>
        <el-option :label="$t('auditRejected')" :value="2"/>
      </el-select>
      <div class="search">
        <el-input v-model="query.keyword" class="search-input" :placeholder="$t('searchApplyDesc')"
                  @keyup.enter="search"/>
      </div>
      <Icon class="icon" icon="iconoir:search" width="20" height="20" @click="search"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
    </div>

    <el-scrollbar class="scrollbar">
      <div class="loading" :class="listLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
        <loading/>
      </div>

      <el-table v-if="!listLoading || tableShow" :data="tableData" :fit="true" style="width: 100%">
        <el-table-column :label="$t('applicant')" :min-width="180" fixed="left">
          <template #default="{row}">
            <div class="applicant-cell">
              <el-avatar :size="28" :src="row.avatar">{{ (row.username || '?').slice(0, 1).toUpperCase() }}</el-avatar>
              <span class="username">{{ row.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="platform" :label="$t('oauthSetting')" :width="90"/>
        <el-table-column :label="$t('trustLevel')" :width="100">
          <template #default="{row}">
            <el-tag v-if="row.trustLevel !== null && row.trustLevel !== undefined"
                    :type="trustTagType(row.trustLevel)">TL{{ row.trustLevel }}
            </el-tag>
            <el-tag v-else type="info">{{ $t('unknownLevel') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="email" :label="$t('applyAddress')" :min-width="200" :show-overflow-tooltip="true"/>
        <el-table-column prop="reason" :label="$t('applyReason')" :min-width="220" :show-overflow-tooltip="true"/>
        <el-table-column :label="$t('applyStatusLabel')" :width="100">
          <template #default="{row}">
            <el-tag v-if="row.status === 0" type="warning">{{ $t('auditPending') }}</el-tag>
            <el-tag v-else-if="row.status === 1" type="success">{{ $t('auditApproved') }}</el-tag>
            <el-tag v-else type="danger">{{ $t('auditRejected') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" :label="$t('applyRejectReason')" :min-width="140" :show-overflow-tooltip="true"/>
        <el-table-column prop="createTime" :label="$t('date')" :width="165" :formatter="formatTime" fixed="right"/>
        <el-table-column :label="$t('operate')" :width="130" fixed="right">
          <template #default="{row}">
            <template v-if="row.status === 0">
              <el-button link type="primary" size="small" @click="openApprove(row)">{{ $t('auditApprove') }}</el-button>
              <el-button link type="danger" size="small" @click="openReject(row)">{{ $t('auditReject') }}</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="empty" v-if="tableData.length === 0 && !first">
        <el-empty :image-size="isMobile ? 120 : null" :description="$t('noApplyFound')"/>
      </div>
    </el-scrollbar>

    <div class="pagination-box">
      <el-pagination
          v-model:current-page="query.num"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10,15,20,25,30,50]"
          layout="total, sizes, prev, pager, next"
          background
          @size-change="sizeChange"
          @current-change="getList"
      />
    </div>

    <el-dialog v-model="rejectShow" :title="$t('auditReject')" width="400px">
      <el-input v-model="rejectRemark" type="textarea" :rows="3" maxlength="200" show-word-limit
                :placeholder="$t('rejectRemarkPh')"/>
      <template #footer>
        <el-button @click="rejectShow = false">{{ $t('cancel') }}</el-button>
        <el-button type="danger" :loading="auditLoading" @click="submitReject">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineOptions, onMounted, reactive, ref} from "vue";
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import {useSettingStore} from "@/store/setting.js";
import {applyApprove, applyList, applyReject} from "@/request/apply.js";
import dayjs from "dayjs";
import {useI18n} from "vue-i18n";

defineOptions({
  name: 'apply-admin'
})

const {t} = useI18n()
const settingStore = useSettingStore()

const isMobile = ref(window.innerWidth < 768)

const query = reactive({
  num: 1,
  size: 15,
  status: '',
  keyword: ''
})

const total = ref(0)
const tableData = ref([])
const listLoading = ref(false)
const first = ref(true)
const tableShow = ref(false)

const rejectShow = ref(false)
const rejectRemark = ref('')
const currentRow = ref(null)
const auditLoading = ref(false)

function trustTagType(level) {
  if (level >= 3) return 'success'
  if (level === 2) return 'primary'
  return 'info'
}

function formatTime(row) {
  if (!row.createTime) return ''
  return dayjs(row.createTime).format('YYYY-MM-DD HH:mm')
}

async function getList() {

  listLoading.value = true

  try {
    const data = await applyList({
      num: query.num,
      size: query.size,
      status: query.status,
      keyword: query.keyword
    })
    tableData.value = data.list || []
    total.value = data.total || 0
  } finally {
    first.value = false
    listLoading.value = false
    tableShow.value = true
  }
}

function search() {
  query.num = 1
  getList()
}

function refresh() {
  getList()
}

function sizeChange() {
  query.num = 1
  getList()
}

function openApprove(row) {

  ElMessageBox.confirm(t('confirmApproveMsg'), t('applyAudit'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'success'
  }).then(async () => {
    auditLoading.value = true
    try {
      await applyApprove(row.applyId)
      ElMessage({message: t('setSuccess'), type: 'success', plain: true})
      getList()
    } finally {
      auditLoading.value = false
    }
  }).catch(() => {
  })
}

function openReject(row) {
  currentRow.value = row
  rejectRemark.value = ''
  rejectShow.value = true
}

async function submitReject() {

  if (!currentRow.value) return

  auditLoading.value = true

  try {
    await applyReject(currentRow.value.applyId, rejectRemark.value)
    rejectShow.value = false
    ElMessage({message: t('setSuccess'), type: 'success', plain: true})
    getList()
  } finally {
    auditLoading.value = false
  }
}

onMounted(getList)

</script>

<style lang="scss" scoped>

.apply-admin {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;

  .status-select {
    width: 130px;
  }

  .search {
    flex: 1;
    max-width: 300px;
  }

  .icon {
    cursor: pointer;
    color: var(--el-text-color-secondary);

    &:hover {
      color: var(--el-color-primary);
    }
  }
}

.scrollbar {
  height: calc(100% - 110px);
  padding: 0 10px;
}

.applicant-cell {
  display: flex;
  align-items: center;
  gap: 8px;

  .username {
    font-weight: 500;
  }
}

.pagination-box {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 10px;
}
</style>
