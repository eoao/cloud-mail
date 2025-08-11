<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <div v-perm="'email:send'" class="writer-box" @click="openSend">
      <div class="writer" >
        <Icon icon="material-symbols:edit-outline-sharp" width="22" height="22" />
      </div>
    </div>
    <div class="toolbar">
      <el-dropdown>
        <div class="translate icon-item">
          <Icon icon="carbon:ibm-watson-language-translator" />
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="changeLang('zh')">简体中文</el-dropdown-item>
            <el-dropdown-item @click="changeLang('en')">English</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <div class="notice icon-item" @click="openNotice">
        <Icon icon="streamline-plump:announcement-megaphone" />
      </div>
      <el-dropdown :teleported="false" popper-class="detail-dropdown" >
        <div class="avatar">
          <div class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24" />
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="details-avatar">
              {{ formatName(userStore.user.email) }}
            </div>
            <div class="user-name">
              {{userStore.user.name}}
            </div>
            <div class="detail-email" @click="copyEmail(userStore.user.email)">
              {{ userStore.user.email }}
            </div>
            <div class="detail-user-type">
              <el-tag >{{$t(userStore.user.role.name)}}</el-tag>
            </div>
            <div class="action-info">
              <div>
                <span style="margin-right: 10px">{{$t('sendCount')}}</span>
                <span style="margin-right: 10px">{{$t('accountCount')}}</span>
              </div>
              <div>
                <div>
                  <span v-if="sendCount" style="margin-right: 5px" >{{  sendCount }}</span>
                  <el-tag v-if="!hasPerm('email:send')" >{{sendType}}</el-tag>
                  <el-tag v-else >{{sendType}}</el-tag>
                </div>
                <div>
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail" >{{$t('disabled')}}</el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')" style="margin-right: 5px">{{ $t('totalUserAccount',{msg: accountCount}) }}</span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')" >{{$t('unlimited')}}</el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')" >{{$t('unauthorized')}}</el-tag>
                </div>
              </div>
            </div>
            <div class="logout">
              <el-button type="primary" :loading="logoutLoading" @click="clickLogout">{{$t('logOut')}}</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import { logout} from "@/request/login.js";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import { useRoute } from "vue-router";
import {computed, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import { hasPerm } from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {copyText} from "@/utils/clipboard-utils.js";

const { t } = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const logoutLoading = ref(false)

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})

async function copyEmail(email) {
  try {
    await copyText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function changeLang(lang) {
  settingStore.lang = lang
}

function openNotice() {
  uiStore.showNotice()
}

function openSend() {
  uiStore.writerRef.open()
}

function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

function clickLogout() {
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem("token")
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email[0]?.toUpperCase() || ''
}

</script>

<style lang="scss" scoped>

.breadcrumb-item {
  font-weight: bold;
  font-size: 14px;
  white-space: nowrap;
}

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 250px;
  font-size: 14px;
  color: #333;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }
  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;
    >div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }
    >div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;
      >div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: #5c5958;
    cursor: pointer;
  }
  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;
    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }
  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    border: 1px solid #ccc;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}



.header {
  text-align: right;
  font-size: 12px;
  display: grid;
  height: 100%;
  gap: 10px;
  grid-template-columns: auto auto 1fr;
}

.header.not-send {
  grid-template-columns: auto 1fr;
}

.writer-box {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 5px;
  .writer {
    width:  34px;
    height: 34px;
    border-radius: 50%;
    color: #ffffff;
    background: linear-gradient(135deg, #1890ff, #3a80dd);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    .writer-text {
      margin-left: 15px;
      font-size: 14px;
      font-weight: bold;
    }
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
}



.toolbar {
  display: flex;
  justify-content: end;
  gap: 15px;
  @media (max-width: 767px) {
    gap: 10px;
  }
  .icon-item {
    align-self: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-item:hover {
    background: #F0F2F5;
  }

  .notice {
    font-size: 22px;
    margin-right: 4px;
  }

  .translate {
    padding-top: 2px;
    font-size: 21px;
  }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;
    .avatar-text {
      height: 30px;
      width: 30px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      border: 1px solid #ccc;
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }
  }

}
.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
