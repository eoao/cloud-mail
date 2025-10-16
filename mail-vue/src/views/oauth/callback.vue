<template>
  <div class="oauth-callback">
    <el-card class="oauth-card" shadow="never">
      <div v-if="loading" class="oauth-status">{{ $t('oauthProcessing') }}</div>
      <div v-else-if="error" class="oauth-error">{{ error }}</div>
      <div v-else class="oauth-status">{{ $t('oauthProcessing') }}</div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { oauthCallback } from '@/request/login.js'
import { myOAuthCallback, loginUserInfo } from '@/request/my.js'
import { useAccountStore } from '@/store/account.js'
import { useUserStore } from '@/store/user.js'
import { useUiStore } from '@/store/ui.js'
import { permsToRouter } from '@/perm/perm.js'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const loading = ref(true)
const error = ref('')
const accountStore = useAccountStore()
const userStore = useUserStore()
const uiStore = useUiStore()

const getQueryParam = (value) => Array.isArray(value) ? value[0] : value

const completeLogin = async (token) => {
  localStorage.setItem('token', token)
  const user = await loginUserInfo()
  accountStore.currentAccountId = user.accountId
  userStore.user = user
  const routers = permsToRouter(user.permKeys)
  routers.forEach(routerData => {
    router.addRoute('layout', routerData)
  })
  await router.replace({name: 'layout'})
  uiStore.showNotice()
}

onMounted(async () => {
  const provider = getQueryParam(route.params.provider)
  const code = getQueryParam(route.query.code)
  const state = getQueryParam(route.query.state)

  if (!code || !state || !provider) {
    error.value = t('oauthInvalidCallback')
    loading.value = false
    return
  }

  const bindingProvider = sessionStorage.getItem('oauth_bind_provider')

  try {
    if (bindingProvider && bindingProvider === provider) {
      await myOAuthCallback(provider, { code, state })
      sessionStorage.removeItem('oauth_bind_provider')
      const redirectPath = sessionStorage.getItem('oauth_bind_return') || '/settings'
      sessionStorage.removeItem('oauth_bind_return')
      sessionStorage.removeItem('oauth_provider')
      const user = await loginUserInfo()
      userStore.user = user
      ElMessage({
        message: t('githubBindSuccess'),
        type: 'success',
        plain: true,
      })
      await router.replace(redirectPath)
      return
    }

    const storedProvider = sessionStorage.getItem('oauth_provider')
    const finalProvider = storedProvider || provider
    const data = await oauthCallback(finalProvider, { code, state })
    sessionStorage.removeItem('oauth_provider')
    sessionStorage.removeItem('oauth_bind_provider')
    sessionStorage.removeItem('oauth_bind_return')
    await completeLogin(data.token)
  } catch (e) {
    error.value = e?.message || t('oauthInvalidCallback')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.oauth-callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-info-light-9);
  padding: 20px;

  .oauth-card {
    width: min(420px, 100%);
    text-align: center;
  }

  .oauth-status {
    font-size: 16px;
    color: var(--el-text-color-primary);
  }

  .oauth-error {
    color: var(--el-color-error);
    font-size: 16px;
    word-break: break-word;
  }
}
</style>
