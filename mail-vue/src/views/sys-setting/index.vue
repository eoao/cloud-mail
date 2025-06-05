<template>
  <div class="settings-container">
    <el-scrollbar class="scroll">
      <div class="card-grid">
        <!-- Website Settings Card -->
        <div class="settings-card">
          <div class="card-title">网站设置</div>
          <div class="card-content">
            <div class="setting-item">
              <div><span>用户注册</span></div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.register"/>
              </div>
            </div>
            <div class="setting-item">
              <div><span>添加邮箱</span></div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.addEmail"/>
              </div>
            </div>
            <div class="setting-item">
              <div>
                <span>多号模式</span>
                <el-tooltip effect="dark" content="开启后账号栏出现一个用户可以添加多个邮箱">
                  <Icon class="warning" icon="fe:warning" width="20" height="20"/>
                </el-tooltip>
              </div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.manyEmail"/>
              </div>
            </div>
            <div class="setting-item">
              <div>
                <span>轮询刷新</span>
                <el-tooltip effect="dark" content="轮询请求服务器获取最新邮件">
                  <Icon class="warning" icon="fe:warning" width="20" height="20"/>
                </el-tooltip>
              </div>
              <div>
                <el-select
                    @change="change"
                    style="width: 80px;"
                    v-model="setting.autoRefreshTime"
                    placeholder="Select"
                >
                  <el-option
                      v-for="item in options"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                  />
                </el-select>
              </div>
            </div>
            <div class="setting-item">
              <div>
                <span>物理清空数据</span>
                <el-tooltip effect="dark" content="该操作会物理清空所有已被删除的数据">
                  <Icon class="warning" icon="fe:warning" width="20" height="20"/>
                </el-tooltip>
              </div>
              <div>
                <el-button class="opt-button" style="margin-top: 0" @click="physicsDeleteAllData" size="small"
                           type="primary">
                  <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16"/>
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Personalization Settings Card -->
        <div class="settings-card">
          <div class="card-title">个性化设置</div>
          <div class="card-content">
            <div class="setting-item">
              <div class="title-item"><span>网站标题</span></div>
              <div class="email-title">
                <span>{{ setting.title }}</span>
                <el-button class="opt-button" size="small" type="primary" @click="editTitleShow = true">
                  <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                </el-button>
              </div>
            </div>
            <div class="setting-item">
              <div class="title-item"><span>登录透明</span></div>
              <div>
                <el-input-number size="small" v-model="loginOpacity" @change="opacityChange" :precision="2" :step="0.01" :max="1" :min="0" />
              </div>
            </div>
            <div class="setting-item personalized">
              <div><span>登录背景</span></div>
              <div>
                <el-image
                    class="background"
                    :src="cvtR2Url(setting.background)"
                    :preview-src-list="[cvtR2Url(setting.background)]"
                    show-progress
                    fit="cover"
                >
                  <template #error>
                    <div class="error-image" @click="openCut">
                      <Icon icon="ph:image" width="24" height="24"/>
                    </div>
                  </template>
                </el-image>
                <div class="background-btn">
                  <el-button class="opt-button" size="small" type="primary" @click="openCut">
                    <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                  </el-button>
                  <el-button class="opt-button" size="small" type="primary" @click="delBackground">
                    <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Email Sending Settings Card -->
        <div class="settings-card">
          <div class="card-title">邮件设置</div>
          <div class="card-content">
            <div class="setting-item">
              <div><span>邮件接收</span></div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.receive"/>
              </div>
            </div>
            <div class="setting-item">
              <div><span>邮件发送</span></div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.send"/>
              </div>
            </div>
            <div class="setting-item">
              <div><span>添加resend令牌</span></div>
              <div>
                <el-button class="opt-button" style="margin-top: 0" @click="openResendForm" size="small" type="primary">
                  <Icon icon="material-symbols:add-rounded" width="16" height="16"/>
                </el-button>
              </div>
            </div>
            <div class="setting-item token-item" v-for="(value, key, index) in setting.resendTokens" :key="index">
              <div><span>{{ key }}</span></div>
              <div><span>{{ value }}</span></div>
            </div>
          </div>
        </div>

        <!-- R2 Object Storage Card -->
        <div class="settings-card">
          <div class="card-title">R2对象存储</div>
          <div class="card-content">
            <div class="setting-item">
              <div><span>访问域名</span></div>
              <div class="r2domain">
                <span>{{ setting.r2Domain || '空' }}</span>
                <el-button class="opt-button" size="small" type="primary" @click="r2DomainShow = true">
                  <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Turnstile Verification Card -->
        <div class="settings-card">
          <div class="card-title">Turnstile 人机验证</div>
          <div class="card-content">
            <div class="setting-item">
              <div><span>注册验证</span></div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.registerVerify"/>
              </div>
            </div>
            <div class="setting-item">
              <div><span>添加验证</span></div>
              <div>
                <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                           v-model="setting.addEmailVerify"/>
              </div>
            </div>
            <div class="setting-item">
              <div><span>siteKey</span></div>
              <div class="bot-verify">
                <span>{{ setting.siteKey || '空' }}</span>
                <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                  <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                </el-button>
              </div>
            </div>
            <div class="setting-item">
              <div><span>secretKey</span></div>
              <div class="bot-verify">
                <span> {{ setting.secretKey || '空' }} </span>
                <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                  <Icon icon="lsicon:edit-outline" width="16" height="16"/>
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="card-title">关于</div>
          <div class="card-content">
            <div class="concerning-item">
              <span>版本:</span>
              <span>v1.1.0</span>
            </div>
            <div class="concerning-item">
              <span>交流:</span>
              <el-button @click="jump('https://t.me/cloud_mail_tg')">
                telegram
                <template #icon>
                  <Icon icon="logos:telegram" width="30" height="30"/>
                </template>
              </el-button>
              <el-button @click="jump('https://github.com/LaziestRen/cloud-mail')">
                github
                <template #icon>
                  <Icon icon="codicon:github-inverted" width="22" height="22" />
                </template>
              </el-button>
            </div>
          </div>
        </div>
      </div>


      <!-- Dialogs remain the same -->
      <el-dialog v-model="editTitleShow" title="修改标题" width="340" @closed="editTitle = ''">
        <form>
          <el-input type="text" placeholder="网站标题" v-model="editTitle"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTitle">保存</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="resendTokenFormShow" title="添加resend令牌" width="340" @closed="cleanResendTokenForm">
        <form>
          <el-select style="margin-bottom: 15px" v-model="resendTokenForm.domain" placeholder="Select">
            <el-option
                v-for="item in settingStore.domainList"
                :key="item"
                :label="item"
                :value="item"
            />
          </el-select>
          <el-input type="text" placeholder="令牌" v-model="resendTokenForm.token"/>
          <el-button type="primary" :loading="settingLoading" @click="saveResendToken">保存</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="r2DomainShow" title="添加R2访问域名" width="340" @closed="r2DomainInput = ''">
        <form>
          <el-input type="text" placeholder="R2访问域名" v-model="r2DomainInput"/>
          <el-button type="primary" :loading="settingLoading" @click="saveR2domain">保存</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="turnstileShow" title="添加Turnstile密钥" width="340"
                 @closed="turnstileForm.secretKey = '';turnstileForm.siteKey = ''">
        <form>
          <el-input type="text" placeholder="siteKey" v-model="turnstileForm.siteKey"/>
          <el-input type="text" style="margin-top: 15px" placeholder="secretKey" v-model="turnstileForm.secretKey"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTurnstileKey">保存</el-button>
        </form>
      </el-dialog>
      <el-dialog
          v-model="cutShow"
          title="背景截图"
          class="cut-dialog"
      >
        <div class="cropper">
          <vueCropper
              ref="cropper"
              :img="cutImage"
              :fixedNumber="[16,9]"
              outputType="jpeg"
              :fixed="true"
              :centerBox="true"
              :full="true"
              :autoCrop="true"
              :outputSize="0.9"
          ></vueCropper>
        </div>
        <div class="cut-button">
          <el-button type="primary" :loading="settingLoading" @click="saveBackground">保存</el-button>
        </div>
      </el-dialog>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {defineOptions, nextTick, onMounted, reactive, ref} from "vue";
import {physicsDeleteAll, setBackground, settingQuery, settingSet} from "@/request/setting.js";
import {ElMessage, ElMessageBox} from "element-plus";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import {useAccountStore} from "@/store/account.js";
import {Icon} from "@iconify/vue";
import {compressImage} from "@/utils/file-utils.js";
import {cvtR2Url} from "@/utils/convert.js";
import {storeToRefs} from "pinia";
import { debounce } from 'lodash-es'

defineOptions({
  name: 'sys-setting'
})

const cropper = ref()
const cutImage = ref('')
const cutShow = ref(false)
const accountStore = useAccountStore();
const userStore = useUserStore();
const editTitleShow = ref(false)
const resendTokenFormShow = ref(false)
const r2DomainShow = ref(false)
const turnstileShow = ref(false)
const settingStore = useSettingStore();
const {settings: setting} = storeToRefs(settingStore);
const editTitle = ref('')
const settingLoading = ref(false)
const r2DomainInput = ref('')
const loginOpacity = ref(0)
let backup = '{}'
const resendTokenForm = reactive({
  domain: '',
  token: '',
})
const turnstileForm = reactive({
  siteKey: '',
  secretKey: ''
})
const options = [
  {label: '关闭', value: 0},
  {label: '3s', value: 3},
  {label: '5s', value: 5},
  {label: '7s', value: 7},
  {label: '10s', value: 10},
  {label: '15s', value: 15},
  {label: '20s', value: 20}
]

onMounted(() => {
  resendTokenForm.domain = settingStore.domainList[0];
  loginOpacity.value = settingStore.settings.loginOpacity
})

function doOpacityChange() {
  const form = {...setting.value}
  form.loginOpacity = loginOpacity.value
  editSetting(form,true)
}

const opacityChange = debounce(doOpacityChange, 1000, {
  leading: false,
  trailing: true
})

function physicsDeleteAllData() {
  ElMessageBox.prompt('此操作不可逆转, 输入 <b style="font-weight: bold">确认删除</b> 继续操作', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    dangerouslyUseHTMLString: true,
    title: '警告',
    type: 'warning',
    inputPattern: /^确认删除$/,
    inputErrorMessage: '请输入确认删除',
  }).then(() => {
    physicsDeleteAll().then(() => {
      ElMessage({
        message: "删除成功",
        type: "success",
        plain: true
      })
    })
  })
}

function delBackground() {
  ElMessageBox.confirm('确定要删除这个背景吗?', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    setting.value.background = null
    editSetting({background: null})
  })
}

function saveTurnstileKey() {
  const settingForm = {}
  settingForm.siteKey = turnstileForm.siteKey
  settingForm.secretKey = turnstileForm.secretKey
  editSetting(settingForm)
}

function saveBackground() {
  settingLoading.value = true
  cropper.value.getCropData(data => {
    setBackground(data).then(key => {
      setting.value.background = key
      cutShow.value = false
      ElMessage({
        message: "设置成功",
        type: "success",
        plain: true
      })
    }).finally(() => {
      settingLoading.value = false
    })
  })
}

function openCut() {
  const doc = document.createElement('input')
  doc.setAttribute('type', 'file')
  doc.setAttribute('accept', 'image/*')
  doc.click()
  doc.onchange = async (e) => {
    const image = await compressImage(e.target.files[0], 0.9)
    cutImage.value = URL.createObjectURL(image)
    cutShow.value = true
  }
}

function saveR2domain() {
  const settingForm = {r2Domain: r2DomainInput.value}
	if (settingForm.r2Domain && !settingForm.r2Domain.startsWith('http')) {
		ElMessage({
			message: "域名必须以http或https开头",
			type: "error",
			plain: true
		})
		return;
	}
  editSetting(settingForm)
}

function openResendForm() {
  resendTokenFormShow.value = true
}

function saveResendToken() {
  const settingForm = {
    resendTokens: {}
  }
  const domain = resendTokenForm.domain.slice(1)
  settingForm.resendTokens[domain] = resendTokenForm.token
  editSetting(settingForm)
}

function backupSetting() {
  const settingForm = {...setting.value}
  delete settingForm.resendTokens
  delete settingForm.siteKey
  delete settingForm.secretKey
  backup = JSON.stringify(setting.value)
}

function cleanResendTokenForm() {
  resendTokenForm.token = ''
}

function beforeChange() {
  if (settingLoading.value) return false
  backupSetting()
  return true
}

function change(e) {
  const settingForm = {...setting.value}
  delete settingForm.siteKey
  delete settingForm.secretKey
  delete settingForm.resendTokens
  editSetting(settingForm, false)
}

function refresh() {
  settingQuery().then(setting => {
    settingStore.settings = setting;
    settingStore.domainList = setting.domainList;
  })
}

function saveTitle() {
  editSetting({title: editTitle.value})
}

function jump(href) {
  const doc = document.createElement('a')
  doc.href = href
  doc.target = '_blank'
  doc.click()
}



function editSetting(settingForm, refreshStatus = true) {
  if (settingLoading.value) return
  settingLoading.value = true
  settingSet(settingForm).then(() => {
    settingLoading.value = false
    ElMessage({
      message: "设置成功",
      type: "success",
      plain: true
    })
    if (setting.value.manyEmail === 1) {
      accountStore.currentAccountId = userStore.user.accountId;
    }
    if (refreshStatus) {
      refresh()
    }
    editTitleShow.value = false
    r2DomainShow.value = false
    resendTokenFormShow.value = false
    turnstileShow.value = false
  }).catch(() => {
    loginOpacity.value = setting.value.loginOpacity
    setting.value = {...setting.value, ...JSON.parse(backup)}
  }).finally(() => {
    settingLoading.value = false
  })
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
  overflow: hidden;
}

.scroll {
  width: 100%;
}

.card-grid {

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  padding: 20px;
  gap: 20px;
  @media (max-width: 500px) {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  @media (max-width: 767px) {
    gap: 15px;
    padding: 15px;
  }
}

.background {
  width: 230px;
  height: 120px;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  @media (max-width: 500px) {
    width: 150px;
    height: 83px;
  }
}

.background-btn {
  display: flex;
  gap: 10px;
  flex-direction: column;
}

.settings-card {
  background-color: #fff;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  transition: all 300ms;
  box-shadow: var(--el-box-shadow-light);
  overflow: hidden;
}

.card-title {
  font-size: 16px;
  font-weight: bold;
  padding: 10px 20px;
  border-bottom: 1px solid #e6e6e6;
}

.card-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  font-weight: bold;

  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    display: grid;
    grid-template-columns: 1fr auto;
    justify-items: flex-end;
    font-weight: normal;
  }
}

.warning {
  margin-left: 5px;
  color: gray;
  cursor: pointer;
}

.cropper {
  height: 397px;
  width: 705px;
  @media (max-width: 767px) {
    width: calc(100vw - 60px);
    height: calc((100vw - 60px) * 9 / 16);
  }
}

:deep(.cut-dialog.el-dialog) {
  width: fit-content !important;
  height: fit-content !important;
}

.error-image {
  background: #f5f7fa;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cut-button {
  padding-top: 15px;
  width: 100%;
  display: flex;
  justify-content: end;

  .el-button {
    width: fit-content;
  }
}

.bot-verify {
  display: grid;
  grid-template-columns: 1fr auto;

  span {
    display: flex;
    align-items: center;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.opt-button {
  width: fit-content !important;
}

.r2domain {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.personalized {
  align-items: start;

  > div:last-child {
    display: flex;
    justify-content: end;

    .el-button {
      margin-left: 10px;
      margin-top: 0;
    }
  }
}

.concerning-item {
  display: flex;
  align-items: center;

  :deep(.el-button) {
    padding: 0 10px;

    i {
      font-size: 22px;
    }
  }

  > span:first-child {
    font-weight: bold;
    padding-right: 20px;
  }
}

.email-title {
  font-weight: normal !important;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto;
  align-items: center;
  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    margin-top: 0;
  }
}

.token-item {
  padding-top: 0;

  div:last-child {
    font-weight: normal;
  }
}

form .el-button {
  margin-top: 15px;
  width: 100%;
}

.el-switch {
  height: 28px;
}


:deep(.el-button--small) {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  height: 24px;
}

:deep(.el-select__wrapper) {
  min-height: 28px;
}
</style>