<template>
  <div class="cf-container">
    <el-scrollbar class="scroll">
      <div class="scroll-body">

        <!-- Credentials -->
        <div class="cf-card">
          <div class="card-title">{{ $t('cfCredentials') }}</div>
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
            {{ $t('cfTokenHelp') }}
          </el-alert>

          <div class="cf-row">
            <el-input v-model="form.cfApiToken" show-password
                      :placeholder="hasToken ? $t('cfTokenStored') : $t('cfTokenPlaceholder')"/>
            <el-button :loading="loading" @click="probe">{{ $t('cfProbe') }}</el-button>
          </div>

          <div class="cf-row" v-if="accounts.length || form.cfAccountId">
            <el-select v-model="form.cfAccountId" :placeholder="$t('cfAccount')">
              <el-option v-for="a in accounts" :key="a.id" :value="a.id" :label="a.name"/>
            </el-select>
            <el-select v-model="form.cfZoneId" :placeholder="$t('cfZone')">
              <el-option v-for="z in zones" :key="z.id" :value="z.id" :label="`${z.name} (${z.status})`"/>
            </el-select>
            <el-button type="primary" :loading="loading" @click="saveCredentials">{{ $t('save') }}</el-button>
          </div>
        </div>

        <!-- Diagnosis -->
        <div class="cf-card">
          <div class="card-title">
            {{ $t('cfDiagnosis') }}
            <el-button size="small" :loading="loading" @click="refresh">{{ $t('refresh') }}</el-button>
          </div>

          <div v-if="!findings.length" class="cf-empty">{{ $t('cfNotChecked') }}</div>

          <div v-for="(f, i) in findings" :key="i" class="cf-finding" :class="`cf-${f.status}`">
            <Icon :icon="statusIcon(f.status)" width="20" height="20"/>
            <div class="cf-finding-body">
              <div class="cf-finding-label">{{ f.label }}</div>
              <div class="cf-finding-detail">{{ f.detail }}</div>
            </div>
            <el-button v-if="f.fix && f.fix !== 'redeploy'" size="small" type="primary"
                       :loading="loading" @click="applyFix(f)">
              {{ $t('cfFix') }}
            </el-button>
            <el-tag v-else-if="f.fix === 'redeploy'" size="small" type="warning">{{ $t('cfRedeploy') }}</el-tag>
          </div>

          <div v-if="checkedAt" class="cf-checked">{{ $t('cfCheckedAt') }}: {{ checkedAt }}</div>
        </div>

        <!-- Free plan usage -->
        <div class="cf-card">
          <div class="card-title">
            {{ $t('cfUsage') }}
            <el-button size="small" :loading="usageLoading" @click="loadUsage">{{ $t('refresh') }}</el-button>
          </div>

          <div v-if="usageError" class="cf-empty">{{ usageError }}</div>

          <template v-else-if="usage">
            <div class="cf-meter">
              <div class="cf-meter-head">
                <span>{{ $t('cfRequestsToday') }}</span>
                <span>{{ usage.today.requests?.toLocaleString() ?? 0 }} / {{ usage.limits.requestsPerDay.toLocaleString() }}</span>
              </div>
              <el-progress :percentage="requestPercent" :status="requestPercent > 80 ? 'exception' : undefined"/>
            </div>

            <el-alert v-if="usage.projection.willExceed" type="warning" :closable="false" show-icon
                      style="margin: 10px 0">
              {{ $t('cfProjectionWarn', {
                projected: usage.projection.projected.toLocaleString(),
                hours: usage.projection.hoursToLimit
              }) }}
            </el-alert>

            <el-table :data="usage.series" size="small" max-height="280" style="margin-top: 10px">
              <el-table-column prop="date" :label="$t('cfDate')" width="120"/>
              <el-table-column :label="$t('cfRequests')" width="120">
                <template #default="{ row }">{{ row.requests.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column prop="errors" :label="$t('cfErrors')" width="100"/>
              <el-table-column prop="subrequests" :label="$t('cfSubrequests')" width="130"/>
              <el-table-column :label="$t('cfCpuP99')">
                <template #default="{ row }">
                  <span :class="row.cpuP99 > usage.limits.cpuMsPerRequest ? 'cf-over' : ''">
                    {{ Math.round(row.cpuP99 * 100) / 100 }} ms
                  </span>
                </template>
              </el-table-column>
            </el-table>

            <div class="cf-note">{{ $t('cfLimitsNote') }}</div>
          </template>
        </div>

      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {computed, defineOptions, onMounted, reactive, ref} from "vue";
import {Icon} from "@iconify/vue";
import {useI18n} from 'vue-i18n';
import {useSettingStore} from "@/store/setting.js";
import {cfStatus, cfUsage, cfFix, cfProbe, cfCredentials} from "@/request/cf.js";

defineOptions({
  name: 'cloudflare'
})

const {t} = useI18n()
const settingStore = useSettingStore()

const loading = ref(false)
const usageLoading = ref(false)
const findings = ref([])
const checkedAt = ref('')
const accounts = ref([])
const zones = ref([])
const usage = ref(null)
const usageError = ref('')
const form = reactive({cfApiToken: '', cfAccountId: '', cfZoneId: ''})

const hasToken = computed(() => !!settingStore.settings.hasCfToken)

const requestPercent = computed(() => {
  if (!usage.value) return 0
  const used = usage.value.today.requests ?? 0
  return Math.min(100, Math.round((used / usage.value.limits.requestsPerDay) * 100))
})

function statusIcon(status) {
  return {
    ok: 'mdi:check-circle',
    warn: 'mdi:alert',
    fail: 'mdi:close-circle'
  }[status] ?? 'mdi:help-circle'
}

async function probe() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await cfProbe(form.cfApiToken || undefined)
    accounts.value = data.accounts
    zones.value = data.zones
    form.cfAccountId ||= data.accounts[0]?.id ?? ''
    form.cfZoneId ||= data.zones[0]?.id ?? ''
    ElMessage({message: t('cfProbeOk', {zones: data.zones.length}), type: 'success'})
  } finally {
    loading.value = false
  }
}

async function saveCredentials() {
  if (loading.value) return
  loading.value = true
  try {
    await cfCredentials({...form})
    // Never keep the plaintext token in the page after it is stored.
    form.cfApiToken = ''
    settingStore.settings.hasCfToken = true
    await refresh()
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await cfStatus()
    findings.value = data.findings
    checkedAt.value = new Date(data.checkedAt).toLocaleString()
  } finally {
    loading.value = false
  }
  await loadUsage()
}

async function applyFix(finding) {
  if (loading.value) return
  loading.value = true
  try {
    const data = await cfFix(finding.fix)
    ElMessage({message: data.done, type: 'success'})
  } finally {
    loading.value = false
  }
  await refresh()
}

async function loadUsage() {
  if (usageLoading.value) return
  usageLoading.value = true
  usageError.value = ''
  try {
    usage.value = await cfUsage(7)
  } catch (e) {
    // Usage needs an extra analytics permission; a missing one should not
    // hide the diagnosis above.
    usageError.value = e.message ?? String(e)
  } finally {
    usageLoading.value = false
  }
}

onMounted(() => {
  if (hasToken.value) {
    refresh()
  }
})
</script>

<style scoped lang="scss">
.cf-container {
  height: 100%;
  overflow: hidden;
}

.scroll-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1000px;
}

.cf-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.cf-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;

  .el-input, .el-select {
    flex: 1;
    min-width: 180px;
  }
}

.cf-finding {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-of-type {
    border-bottom: none;
  }

  &.cf-ok { color: var(--el-color-success); }
  &.cf-warn { color: var(--el-color-warning); }
  &.cf-fail { color: var(--el-color-danger); }
}

.cf-finding-body {
  flex: 1;
  min-width: 0;
}

.cf-finding-label {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.cf-finding-detail {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  word-break: break-word;
}

.cf-empty, .cf-checked, .cf-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding-top: 8px;
}

.cf-meter-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.cf-over {
  color: var(--el-color-danger);
}
</style>
