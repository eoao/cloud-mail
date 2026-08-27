<template>
  <div class="apply-page">
    <div class="apply-card">
      <div class="card-head">
        <Icon icon="mdi:email-check-outline" width="26" height="26" />
        <span class="title">{{ $t('applyTitle') }}</span>
      </div>
      <span class="desc">{{ settingStore.settings.title }}</span>

      <!-- 未登录：引导 OAuth 登录 -->
      <template v-if="view === 'guide'">
        <div class="guide-desc">{{ $t('applyGuideDesc') }}</div>
        <el-button v-for="p in oauthProviders" :key="p.key" class="btn" @click="loginAndApply(p.key)">
          <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" style="margin-right: 10px" />
          <Icon v-else :icon="p.icon" width="18" height="18" style="margin-right: 10px" />
          {{ $t('applyLoginFirst') }} · {{ p.label }}
        </el-button>
      </template>

      <!-- 表单：无记录 或 驳回后重申 -->
      <template v-else-if="view === 'form'">
        <el-input v-model="form.prefix" type="text" :placeholder="$t('emailAccount')" autocomplete="off"
                  class="prefix-input" @keyup.enter="submit">
          <template #append>
            <div @click.stop="openSelect">
              <el-select ref="mySelect" v-model="suffix" :placeholder="$t('select')" class="select">
                <el-option v-for="item in domainList" :key="item" :label="item" :value="item"/>
              </el-select>
              <div>
                <span>{{ suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input v-model="form.reason" type="textarea" :rows="4" maxlength="300" show-word-limit
                  :placeholder="$t('applyReasonPh')"/>
        <el-button class="btn" type="primary" :loading="submitLoading" @click="submit">{{ $t('applySubmit') }}</el-button>
      </template>

      <!-- 待审核 -->
      <template v-else-if="view === 'pending'">
        <el-result icon="warning" :title="$t('applyPending')">
          <template #sub-title>
            <div class="result-sub">
              <div>{{ record.email }}</div>
              <div class="tip">{{ $t('applyPendingTip') }}</div>
            </div>
          </template>
        </el-result>
      </template>

      <!-- 已驳回 -->
      <template v-else-if="view === 'rejected'">
        <el-result icon="error" :title="$t('applyRejected')">
          <template #sub-title>
            <div class="result-sub">
              <div>{{ record.email }}</div>
              <div class="tip" v-if="record.remark">{{ $t('applyRejectReason') }}：{{ record.remark }}</div>
            </div>
          </template>
        </el-result>
        <el-button class="btn" @click="backToForm">{{ $t('reApply') }}</el-button>
      </template>

      <!-- 已通过 -->
      <template v-else-if="view === 'approved'">
        <el-result icon="success" :title="$t('applyApproved')">
          <template #sub-title>
            <div class="result-sub">
              <div>{{ record.email }}</div>
              <div class="tip">{{ $t('applyApprovedTip') }}</div>
            </div>
          </template>
        </el-result>
        <el-button class="btn" type="primary" @click="goLogin">{{ $t('backToLogin') }}</el-button>
      </template>

    </div>
  </div>
</template>

<script setup>
import {computed, onMounted, onUnmounted, reactive, ref} from "vue";
import {useRouter} from "vue-router";
import {Icon} from "@iconify/vue";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {launchOauth} from "@/utils/oauth.js";
import {applyAdd, applyMine} from "@/request/apply.js";

defineOptions({
  name: 'apply'
})

const router = useRouter()
const {t} = useI18n()
const settingStore = useSettingStore()

const view = ref('guide')
const loading = ref(false)
const submitLoading = ref(false)
const record = ref({})
const form = reactive({
  prefix: '',
  reason: ''
})
const mySelect = ref()
const domainList = settingStore.domainList
const suffix = ref(domainList[0] || '')

let pollTimer = null

const oauthProviders = computed(() => {
  const allProviders = [
    {key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image'},
    {key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify'},
    {key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify'},
  ]
  return allProviders.filter(p => settingStore.settings[p.key + 'Switch'] === 0)
})

function loginAndApply(provider) {
  launchOauth(provider, settingStore.settings[provider + 'ClientId'], 'apply')
}

function openSelect() {
  mySelect.value.toggleMenu()
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function clearSession() {
  sessionStorage.removeItem('applyJwt')
  sessionStorage.removeItem('applyUserInfo')
}

function handleInvalidToken() {
  clearSession()
  view.value = 'guide'
}

async function fetchMine() {

  const applyJwt = sessionStorage.getItem('applyJwt')

  if (!applyJwt) {
    view.value = 'guide'
    return
  }

  let data

  try {
    data = await applyMine(applyJwt)
  } catch (e) {
    if (e && e.code) {
      handleInvalidToken()
    } else {
      ElMessage({message: t('networkErrorMsg'), type: 'error', plain: true})
    }
    return
  }

  stopPoll()

  if (!data || data.status === undefined || data.status === null) {
    view.value = 'form'
    return
  }

  record.value = data

  if (data.status === 1) {
    view.value = 'approved'
    return
  }

  if (data.status === 2) {
    view.value = 'rejected'
    return
  }

  view.value = 'pending'
  pollTimer = setInterval(fetchMine, 30000)
}

function submit() {

  if (submitLoading.value) return

  if (!form.prefix) {
    ElMessage({message: t('emptyEmailMsg'), type: 'error', plain: true})
    return
  }

  const email = form.prefix + suffix.value

  if (!isEmail(email)) {
    ElMessage({message: t('notEmailMsg'), type: 'error', plain: true})
    return
  }

  if ((form.reason || '').trim().length < 10) {
    ElMessage({message: t('applyReasonMin'), type: 'error', plain: true})
    return
  }

  submitLoading.value = true

  applyAdd({token: sessionStorage.getItem('applyJwt'), email: email, reason: form.reason.trim()})
      .then(() => {
        ElMessage({message: t('applySubmitted'), type: 'success', plain: true})
        form.prefix = ''
        form.reason = ''
        fetchMine()
      })
      .catch(e => {
        if (e && e.message) {
          ElMessage({message: e.message, type: 'error', plain: true})
          if (e.code === 401) {
            handleInvalidToken()
          }
        }
      })
      .finally(() => {
        submitLoading.value = false
      })
}

function backToForm() {
  view.value = 'form'
}

function goLogin() {
  clearSession()
  stopPoll()
  router.replace('/login')
}

onMounted(fetchMine)

onUnmounted(stopPoll)

</script>

<style lang="scss" scoped>
.apply-page {
  min-height: 100vh;
  background: linear-gradient(to bottom, #2980b9, #6dd5fa, #fff);
  display: flex;
  align-items: center;
  justify-content: center;

  @media (prefers-color-scheme: dark) {
    background: linear-gradient(to bottom, #1a2733, #10222f);
  }
}

.apply-card {
  width: 400px;
  max-width: calc(100vw - 36px);
  background: var(--el-bg-color);
  border-radius: 10px;
  box-shadow: var(--el-box-shadow-light);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;

  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;

    .title {
      font-size: 20px;
      font-weight: bold;
    }
  }

  .desc {
    margin-top: 6px;
    margin-bottom: 18px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  .guide-desc {
    color: var(--el-text-color-regular);
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 16px;
  }

  .btn {
    height: 38px;
    width: 100%;
    border-radius: 6px;
  }

  .prefix-input {
    margin-bottom: 16px;
  }

  :deep(.el-textarea) {
    margin-bottom: 16px;
  }

  .result-sub {
    display: flex;
    flex-direction: column;
    gap: 8px;
    word-break: break-all;

    .tip {
      color: var(--el-text-color-secondary);
      font-size: 13px;
      line-height: 1.6;
    }
  }
}
</style>
