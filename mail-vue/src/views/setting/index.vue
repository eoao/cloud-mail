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
    <!-- Inbound rules -->
    <div class="container">
      <div class="title">{{ $t('rules') }}</div>
      <el-table :data="rules" size="small" v-if="rules.length">
        <el-table-column prop="name" :label="$t('rule')" min-width="140" show-overflow-tooltip/>
        <el-table-column :label="$t('ruleConditions')" min-width="200">
          <template #default="{ row }">{{ describeConditions(row) }}</template>
        </el-table-column>
        <el-table-column :label="$t('ruleActions')" min-width="140">
          <template #default="{ row }">{{ row.actions.map(a => a.type).join(', ') }}</template>
        </el-table-column>
        <el-table-column :label="$t('status')" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? $t('enabled') : $t('disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openRule(row)">{{ $t('edit') }}</el-button>
            <el-button size="small" type="danger" @click="removeRule(row)">{{ $t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button type="primary" style="margin-top: 10px" @click="openRule()">{{ $t('add') }}</el-button>
    </div>

    <!-- Reply templates -->
    <div class="container">
      <div class="title">{{ $t('templates') }}</div>
      <el-table :data="templates" size="small" v-if="templates.length">
        <el-table-column prop="name" :label="$t('template')" min-width="160" show-overflow-tooltip/>
        <el-table-column prop="subject" :label="$t('subject')" min-width="200" show-overflow-tooltip/>
        <el-table-column width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openTemplate(row)">{{ $t('edit') }}</el-button>
            <el-button size="small" type="danger" @click="removeTemplate(row)">{{ $t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button type="primary" style="margin-top: 10px" @click="openTemplate()">{{ $t('add') }}</el-button>
    </div>

    <el-dialog v-model="ruleShow" :title="$t('rule')" width="620">
      <el-input v-model="ruleForm.name" :placeholder="$t('rule')" style="margin-bottom: 12px"/>

      <div class="sub-title">{{ $t('ruleConditions') }}</div>
      <div v-for="(cond, i) in ruleForm.conditions" :key="i" class="rule-row">
        <el-select v-model="cond.field" size="small" style="width: 120px">
          <el-option v-for="f in vocabulary.fields" :key="f" :value="f" :label="f"/>
        </el-select>
        <el-select v-model="cond.op" size="small" style="width: 140px">
          <el-option v-for="o in vocabulary.ops" :key="o" :value="o" :label="o"/>
        </el-select>
        <el-input v-model="cond.value" size="small"/>
        <Icon icon="mingcute:close-line" width="18" height="18" class="rule-remove"
              @click="ruleForm.conditions.splice(i, 1)"/>
      </div>
      <el-button size="small" @click="ruleForm.conditions.push({field: 'from', op: 'contains', value: ''})">
        {{ $t('ruleAddCondition') }}
      </el-button>

      <div class="sub-title">{{ $t('ruleActions') }}</div>
      <div v-for="(act, i) in ruleForm.actions" :key="'a' + i" class="rule-row">
        <el-select v-model="act.type" size="small" style="width: 140px">
          <el-option v-for="a in vocabulary.actions" :key="a" :value="a" :label="a"/>
        </el-select>
        <el-select v-if="act.type === 'label' || act.type === 'move'" v-model="act.value" size="small">
          <el-option v-for="l in labels" :key="l.labelId" :value="String(l.labelId)" :label="l.name"/>
        </el-select>
        <el-input v-else-if="act.type === 'snooze'" v-model="act.value" size="small"
                  placeholder="YYYY-MM-DD HH:mm:ss"/>
        <Icon icon="mingcute:close-line" width="18" height="18" class="rule-remove"
              @click="ruleForm.actions.splice(i, 1)"/>
      </div>
      <el-button size="small" @click="ruleForm.actions.push({type: 'markRead', value: ''})">
        {{ $t('ruleAddAction') }}
      </el-button>

      <div class="rule-row" style="margin-top: 14px">
        <el-checkbox v-model="ruleForm.matchAll" :true-value="1" :false-value="0">{{ $t('ruleMatchAll') }}</el-checkbox>
        <el-checkbox v-model="ruleForm.stopOnMatch" :true-value="1" :false-value="0">{{ $t('ruleStopOnMatch') }}</el-checkbox>
        <el-checkbox v-model="ruleForm.enabled" :true-value="1" :false-value="0">{{ $t('enabled') }}</el-checkbox>
      </div>

      <el-button type="primary" style="margin-top: 12px" :loading="ruleLoading" @click="saveRule">
        {{ $t('save') }}
      </el-button>
    </el-dialog>

    <el-dialog v-model="templateShow" :title="$t('template')" width="520">
      <el-input v-model="templateForm.name" :placeholder="$t('template')" style="margin-bottom: 12px"/>
      <el-input v-model="templateForm.subject" :placeholder="$t('subject')" style="margin-bottom: 12px"/>
      <el-input v-model="templateForm.content" type="textarea" :rows="8" style="margin-bottom: 12px"/>
      <el-button type="primary" :loading="ruleLoading" @click="saveTemplate">{{ $t('save') }}</el-button>
    </el-dialog>

    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
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
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {onMounted, reactive, ref, defineOptions} from 'vue'
import {Icon} from '@iconify/vue'
import {
  ruleVocabulary, ruleList, ruleSet, ruleDelete,
  templateList, templateSet, templateDelete
} from '@/request/rule.js'
import {labelList} from '@/request/search.js'
import {resetPassword, userDelete} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)

// ---- rules and templates ------------------------------------------------

const rules = ref([])
const templates = ref([])
const labels = ref([])
const vocabulary = ref({fields: [], ops: [], actions: []})
const ruleShow = ref(false)
const templateShow = ref(false)
const ruleLoading = ref(false)
const ruleForm = reactive({ruleId: null, name: '', conditions: [], actions: [], matchAll: 1, stopOnMatch: 0, enabled: 1})
const templateForm = reactive({templateId: null, name: '', subject: '', content: ''})

function describeConditions(row) {
  return row.conditions.map(c => `${c.field} ${c.op} "${c.value}"`).join(row.matchAll ? ' AND ' : ' OR ')
}

async function loadRules() {
  const [voc, ruleRows, templateRows, labelRows] = await Promise.all([
    ruleVocabulary(), ruleList(), templateList(), labelList()
  ])
  vocabulary.value = voc
  rules.value = ruleRows
  templates.value = templateRows
  labels.value = labelRows
}

function openRule(row) {
  ruleForm.ruleId = row?.ruleId ?? null
  ruleForm.name = row?.name ?? ''
  // Clone so an abandoned edit does not mutate the row still shown in the table.
  ruleForm.conditions = row ? row.conditions.map(c => ({...c})) : [{field: 'from', op: 'contains', value: ''}]
  ruleForm.actions = row ? row.actions.map(a => ({...a})) : [{type: 'markRead', value: ''}]
  ruleForm.matchAll = row?.matchAll ?? 1
  ruleForm.stopOnMatch = row?.stopOnMatch ?? 0
  ruleForm.enabled = row?.enabled ?? 1
  ruleShow.value = true
}

async function saveRule() {
  if (ruleLoading.value) return
  ruleLoading.value = true
  try {
    await ruleSet({...ruleForm})
    ruleShow.value = false
    await loadRules()
  } finally {
    ruleLoading.value = false
  }
}

async function removeRule(row) {
  await ElMessageBox.confirm(t('deleteConfirm'), {type: 'warning'})
  await ruleDelete(row.ruleId)
  await loadRules()
}

function openTemplate(row) {
  templateForm.templateId = row?.templateId ?? null
  templateForm.name = row?.name ?? ''
  templateForm.subject = row?.subject ?? ''
  templateForm.content = row?.content ?? ''
  templateShow.value = true
}

async function saveTemplate() {
  if (ruleLoading.value) return
  ruleLoading.value = true
  try {
    await templateSet({...templateForm})
    templateShow.value = false
    await loadRules()
  } finally {
    ruleLoading.value = false
  }
}

async function removeTemplate(row) {
  await ElMessageBox.confirm(t('deleteConfirm'), {type: 'warning'})
  await templateDelete(row.templateId)
  await loadRules()
}

onMounted(loadRules)

defineOptions({
  name: 'setting'
})

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

  accountSetName(userStore.user.account.accountId,name).then(() => {
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

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
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

  if (setPwdLoading.value) return

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

</script>
<style scoped lang="scss">
.sub-title {
  margin: 14px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .rule-remove {
    cursor: pointer;
    flex-shrink: 0;
    color: var(--el-text-color-secondary);

    &:hover {
      color: var(--el-color-danger);
    }
  }
}

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

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
