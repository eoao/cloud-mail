<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="title">{{$t('oauthBinding')}}</div>
      <div style="color: var(--regular-text-color); margin-bottom: 15px;">
        {{$t('oauthBindingDesc')}}
      </div>
      <div class="oauth-bindings">
        <div v-for="provider in oauthProviders" :key="provider.key" class="oauth-item">
          <div class="oauth-header">
            <Icon :icon="provider.icon" width="24" height="24" class="provider-icon"/>
            <span class="provider-name">{{ provider.label }}</span>
            <span v-if="userOauthBindings[provider.key]" class="bound-status">{{ $t('bound') }}</span>
          </div>
          <div class="oauth-actions">
            <el-button
              v-if="!userOauthBindings[provider.key]"
              type="primary"
              size="small"
              @click="handleBindOauth(provider.key)"
            >
              {{$t('bindOauth')}}
            </el-button>
            <el-button
              v-else
              type="danger"
              size="small"
              @click="handleUnbindOauth(provider.key)"
            >
              {{$t('unbindOauth')}}
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions, computed} from 'vue'
import {resetPassword, userDelete} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {getOauthBindings, initOauthBind, unbindOauthAccount} from "@/request/oauth.js";
import {useSettingStore} from "@/store/setting.js";
import {onMounted} from "vue";
import {Icon} from "@iconify/vue";

const { t } = useI18n()
const accountStore = useAccountStore()
const userStore = useUserStore();
const settingStore = useSettingStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const userOauthBindings = ref({})

// Get provider icon based on type
const getProviderIcon = (providerKey) => {
  const presetProviders = {
    github: 'mdi:github',
    google: 'mdi:google',
    microsoft: 'mdi:microsoft'
  }
  return presetProviders[providerKey] || 'mdi:account-circle-outline'
}

// Get OAuth providers from settings
const oauthProviders = computed(() => {
  const settings = settingStore.settings
  if (!settings.oauthProvider) {
    return [
      { key: 'github', label: 'GitHub', icon: getProviderIcon('github') },
      { key: 'google', label: 'Google', icon: getProviderIcon('google') },
      { key: 'microsoft', label: 'Microsoft', icon: getProviderIcon('microsoft') }
    ]
  }
  
  // If custom provider, use custom name
  if (settings.oauthProvider === 'custom') {
    return [{ 
      key: 'custom', 
      label: settings.oauthCustomProviderName || t('customProvider'),
      icon: getProviderIcon('custom')
    }]
  }
  
  // Return configured provider
  return [{ 
    key: settings.oauthProvider, 
    label: settings.oauthProvider.charAt(0).toUpperCase() + settings.oauthProvider.slice(1),
    icon: getProviderIcon(settings.oauthProvider)
  }]
})

defineOptions({
  name: 'setting'
})

// Load user OAuth bindings
async function loadOauthBindings() {
  try {
    const bindings = await getOauthBindings()
    const bindingMap = {}
    bindings.forEach(binding => {
      bindingMap[binding.provider] = binding
    })
    userOauthBindings.value = bindingMap
  } catch (error) {
    console.error('Failed to load OAuth bindings:', error)
    userOauthBindings.value = {}
  }
}

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

async function handleBindOauth(provider) {
  const settings = settingStore.settings
  
  if (settings.oauthEnabled !== 0) {
    ElMessage({
      message: t('oauthNotConfigured'),
      type: 'error',
      plain: true,
    })
    return
  }

  try {
    // Call API to get authorization URL
    const result = await initOauthBind(provider)
    
    // Open OAuth authorization in popup window
    const width = 600
    const height = 700
    const left = (screen.width / 2) - (width / 2)
    const top = (screen.height / 2) - (height / 2)
    
    const popup = window.open(
      result.authorizationUrl,
      'OAuth Authorization',
      `width=${width},height=${height},left=${left},top=${top}`
    )
    
    // Listen for messages from popup
    const messageHandler = (event) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        console.warn('Received postMessage from untrusted origin:', event.origin)
        return
      }
      
      if (event.data.type === 'oauth_bind_success') {
        ElMessage({
          message: t('oauthBindingSuccess'),
          type: 'success',
          plain: true,
        })
        loadOauthBindings()
        window.removeEventListener('message', messageHandler)
      } else if (event.data.type === 'oauth_error') {
        const providerName = event.data.provider || provider
        let errorMsg = event.data.error || t('oauthBindingFailed')
        
        // If error is about already used OAuth ID, append provider name
        if (errorMsg.includes('already bound to another user') || errorMsg.includes('已被其他用户绑定')) {
          errorMsg = `${providerName} ${errorMsg}`
        }
        
        ElMessage({
          message: errorMsg,
          type: 'error',
          plain: true,
          duration: 5000
        })
        window.removeEventListener('message', messageHandler)
      }
    }
    
    window.addEventListener('message', messageHandler)
    
    // Clean up if popup is closed
    const checkPopup = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopup)
        window.removeEventListener('message', messageHandler)
      }
    }, 1000)
  } catch (error) {
    console.error('OAuth binding error:', error)
    ElMessage({
      message: error.message || t('oauthBindingFailed'),
      type: 'error',
      plain: true,
    })
  }
}

async function handleUnbindOauth(provider) {
  ElMessageBox.confirm(t('confirmUnbindOauth'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    try {
      await unbindOauthAccount(provider)
      ElMessage({
        message: t('oauthUnbindSuccess'),
        type: 'success',
        plain: true,
      })
      await loadOauthBindings()
    } catch (error) {
      console.error('OAuth unbind error:', error)
      ElMessage({
        message: error.message || t('oauthUnbindFailed'),
        type: 'error',
        plain: true,
      })
    }
  }).catch(() => {
    // User cancelled
  })
}

// Initialize on component mount
onMounted(() => {
  loadOauthBindings()
})

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .oauth-bindings {
    display: grid;
    gap: 15px;

    .oauth-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      border: 1px solid var(--el-border-color);
      border-radius: 4px;
      background-color: var(--el-fill-color-light);

      .oauth-header {
        display: flex;
        align-items: center;
        gap: 10px;

        .provider-icon {
          flex-shrink: 0;
        }

        .provider-name {
          font-weight: 500;
        }

        .bound-status {
          font-size: 12px;
          color: #67c23a;
          background-color: rgba(103, 194, 58, 0.1);
          padding: 2px 8px;
          border-radius: 2px;
        }
      }

      .oauth-actions {
        display: flex;
        gap: 10px;
      }
    }
  }
}
</style>
