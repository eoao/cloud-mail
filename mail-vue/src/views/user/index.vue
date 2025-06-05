<template>
  <div class="user-box">
    <div class="header-actions">
      <Icon class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <div class="search">
        <el-input
            v-model="params.email"
            class="search-input"
            placeholder="输入邮箱名搜索"
        >
        </el-input>
      </div>
      <el-select v-model="params.status" placeholder="Select" class="status-select">
        <el-option :key="-1" label="全部" :value="-1"/>
        <el-option :key="0" label="正常" :value="0"/>
        <el-option :key="1" label="封禁" :value="1"/>
        <el-option :key="-2" label="删除" :value="-2"/>
      </el-select>
      <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
      <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
            v-if="params.timeSort === 1" width="28" height="28"/>
      <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else width="28"
            height="28"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
      <Icon class="icon" icon="pepicons-pencil:expand" width="26" height="26" @click="changeExpand"/>
    </div>
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div>
        <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'">
          <loading/>
        </div>
        <el-table
            @filter-change="tableFilter"
            :empty-text="first ? '' : null"
            :default-expand-all="expandStatus"
            :data="users"
            :preserve-expanded-content="preserveExpanded"
            style="width: 100%;"
            :key="key"
        >
          <el-table-column :width="expandWidth" type="expand">
            <template #default="props">
              <div class="details">
                <div v-if="!sendNumShow"><span class="details-item-title">发件数量:</span>{{ props.row.sendEmailCount }}
                </div>
                <div v-if="!accountNumShow"><span class="details-item-title">邮箱数量:</span>{{
                    props.row.accountCount
                  }}
                </div>
                <div v-if="!createTimeShow"><span class="details-item-title">注册时间:</span>{{
                    tzDayjs(props.row.createTime).format('YYYY-MM-DD HH:mm:ss')
                  }}
                </div>
                <div v-if="!typeShow"><span class="details-item-title">身份类型:</span> {{ toRoleName(props.row.type) }}
                </div>
                <div v-if="!statusShow">
                  <span class="details-item-title">状态:</span>
                  <el-tag disable-transitions v-if="props.row.isDel === 1" type="info">删除</el-tag>
                  <el-tag disable-transitions v-else-if="props.row.status === 0" type="primary">正常</el-tag>
                  <el-tag disable-transitions v-else-if="props.row.status === 1" type="danger">封禁</el-tag>
                </div>
                <div><span class="details-item-title">注册IP:</span>{{ props.row.createIp || '未知' }}</div>
                <div><span class="details-item-title">近期IP:</span>{{ props.row.activeIp || '未知' }}</div>
                <div><span class="details-item-title">近期活动:</span>{{
                    props.row.activeTime ? tzDayjs(props.row.activeTime).format('YYYY-MM-DD') : '未知'
                  }}
                </div>
                <div><span class="details-item-title">登录设备:</span>{{ props.row.device || '未知' }}</div>
                <div><span class="details-item-title">登录系统:</span>{{ props.row.os || '未知' }}</div>
                <div><span class="details-item-title">登录浏览器:</span>{{ props.row.browser || '未知' }}</div>
                <div>
                  <span class="details-item-title">发件次数:</span>
                  <span>{{ formatSendCount(props.row) }}</span>
                  <el-tag style="margin-left: 10px" v-if="props.row.sendAction.hasPerm" type="success">
                    {{ formatSendType(props.row) }}
                  </el-tag>
                  <el-button size="small" style="margin-left: 10px"
                             v-if="props.row.sendAction.hasPerm && props.row.sendAction.sendCount"
                             @click="resetSendCount(props.row)" type="primary">重置
                  </el-button>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column show-overflow-tooltip :tooltip-formatter="tableRowFormatter" label="用户邮箱" :min-width="emailWidth">
            <template #default="props">
              <div class="email-row">{{ props.row.email }}</div>
            </template>
          </el-table-column>
          <el-table-column :formatter="formatterReceive" label-class-name="receive" column-key="receive"
                           :filtered-value="filteredValue" :filters="filters" :width="receiveWidth" label="收件数量"
                           prop="receiveEmailCount"/>
          <el-table-column :formatter="formatterSend" label-class-name="send" column-key="send"
                           :filtered-value="filteredValue" :filters="filters" v-if="sendNumShow" label="发件数量"
                           prop="sendEmailCount"/>
          <el-table-column :formatter="formatterAccount" label-class-name="account" column-key="account"
                           :filtered-value="filteredValue" :filters="filters" v-if="accountNumShow" label="邮箱数量"
                           prop="accountCount"/>
          <el-table-column v-if="createTimeShow" label="注册时间" min-width="160" prop="createTime">
            <template #default="props">
              {{ tzDayjs(props.row.createTime).format('YYYY-MM-DD HH:mm:ss') }}
            </template>
          </el-table-column>
          <el-table-column v-if="statusShow" min-width="60px" label="状态" prop="status">
            <template #default="props">
              <el-tag disable-transitions v-if="props.row.isDel === 1" type="info">删除</el-tag>
              <el-tag disable-transitions v-else-if="props.row.status === 0" type="primary">正常</el-tag>
              <el-tag disable-transitions v-else-if="props.row.status === 1" type="danger">封禁</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="typeShow" label="身份类型" min-width="140" prop="type">
            <template #default="props">
              <div class="type">
                {{ toRoleName(props.row.type) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="设置" :width="settingWidth">
            <template #default="props">
              <el-dropdown trigger="click">
                <el-button size="small" type="primary">操作</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openSetPwd(props.row)">改密</el-dropdown-item>
                    <el-dropdown-item @click="openSetType(props.row)">权限</el-dropdown-item>
                    <el-dropdown-item v-if="props.row.isDel !== 1" @click="setStatus(props.row)">
                      {{ setStatusName(props.row) }}
                    </el-dropdown-item>
                    <el-dropdown-item v-else @click="restore(props.row)">恢复</el-dropdown-item>
                    <el-dropdown-item @click="delUser(props.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination" v-if="total > 10">
          <el-pagination
              :size="pageSize"
              :current-page="params.num"
              :page-size="params.size"
              :pager-count="pagerCount"
              :page-sizes="[10, 15, 20, 25, 30, 50]"
              background
              :layout="layout"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
          <el-pagination
              v-if="phonePageShow"
              :size="pageSize"
              :current-page="params.num"
              :page-size="params.size"
              :pager-count="pagerCount"
              :page-sizes="[10, 15, 20, 25, 30, 50]"
              background
              layout="sizes, total"
              :total="total"
              @size-change="sizeChange"
              @current-change="numChange"
          />
        </div>
      </div>
    </el-scrollbar>
    <el-dialog class="dialog" v-model="setPwdShow" title="修改密码" @closed="resetUserForm">
      <div class="dialog-box">
        <el-input v-model="userForm.password" type="password" placeholder="密码" autocomplete="off">
        </el-input>
        <el-button class="btn" type="primary" :loading="settingLoading" @click="updatePwd"
        >保存
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="dialog" v-model="setTypeShow" title="设置权限" @closed="resetUserForm">
      <div class="dialog-box">
        <el-select v-model="userForm.type" placeholder="Select">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-button class="btn" :loading="settingLoading" type="primary" @click="setType"
        >保存
        </el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="showAdd" title="添加用户">
      <div class="container">
        <el-input v-model="addForm.email" type="text" placeholder="邮箱" autocomplete="off">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
                  placeholder="请选择"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div style="color: #333">
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input type="password" v-model="addForm.password" placeholder="密码"/>
        <el-select v-model="addForm.type" placeholder="身份类型">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >添加
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, h, reactive, ref, watch} from 'vue'
import {
  userList,
  userDelete,
  userSetPwd,
  userSetStatus,
  userSetType,
  userAdd,
  userRestSendCount, userRestore
} from '@/request/user.js'
import {roleSelectUse} from "@/request/role.js";
import {Icon} from "@iconify/vue";
import {ElMessage, ElMessageBox, ElRadio, ElRadioGroup} from "element-plus";
import loading from "@/components/loading/index.vue";
import {tzDayjs} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useRoleStore} from "@/store/role.js";

defineOptions({
  name: 'user'
})

const roleStore = useRoleStore()
const settingStore = useSettingStore()
const filteredValue = ['normal', 'del']
const filters = [{text: '正常', value: 'normal'}, {text: '删除', value: 'del'}]
const preserveExpanded = ref(false)
const emailWidth = ref(230)
const expandWidth = ref(40)
const settingWidth = ref(null)
const sendNumShow = ref(true)
const accountNumShow = ref(true)
const createTimeShow = ref(true)
const statusShow = ref(true)
const typeShow = ref(true)
const receiveWidth = ref(null)
const phonePageShow = ref(false)
const layout = ref('prev, pager, next,  sizes, total')
const pageSize = ref('')
const expandStatus = ref(false)
const users = ref([])
const total = ref(0)
const first = ref(true)
const scrollbarRef = ref(null)

const domainList = settingStore.domainList

const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0],
  password: '',
  type: null,
})

const params = reactive({
  email: '',
  num: 1,
  size: 15,
  timeSort: 0,
  status: -1
})
let chooseUser = {}
const userForm = reactive({
  password: null,
  type: -1,
  userId: 0,
})

const showAdd = ref(false)
const addLoading = ref(false);
const setTypeShow = ref(false)
const setPwdShow = ref(false)
const pagerCount = ref(10)
const settingLoading = ref(false)
const tableLoading = ref(true)
const roleList = reactive([])
const mySelect = ref({})
const key = ref(0)

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})


watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

getUserList()

const filterItem = reactive({
  send: ['normal', 'del'],
  account: ['normal', 'del'],
  receive: ['normal', 'del']
})

function tableFilter(e) {

  if (e.send) filterItem.send = e.send
  if (e.account) filterItem.account = e.account
  if (e.receive) filterItem.receive = e.receive

}

function formatterSend(e) {

  if (filterItem.send.length === 2) {
    return e.sendEmailCount + e.delSendEmailCount
  }

  if (filterItem.send.includes('normal')) {
    return e.sendEmailCount
  }

  if (filterItem.send.includes('del')) {
    return e.delSendEmailCount
  }

  return 0
}

function formatterAccount(e) {

  if (filterItem.account.length === 2) {
    return e.accountCount + e.delAccountCount
  }

  if (filterItem.account.includes('normal')) {
    return e.accountCount
  }

  if (filterItem.account.includes('del')) {
    return e.delAccountCount
  }

  return 0
}

function formatterReceive(e) {


  if (filterItem.receive.length === 2) {
    return e.receiveEmailCount + e.delReceiveEmailCount
  }

  if (filterItem.receive.includes('normal')) {
    return e.receiveEmailCount
  }

  if (filterItem.receive.includes('del')) {
    return e.delReceiveEmailCount
  }

  return 0
}

function setStatusName(user) {
  if (user.isDel === 1) return '恢复'
  if (user.status === 0) return '禁用'
  if (user.status === 1) return '启用'
}

const tableRowFormatter = (data) => {
  return data.row.email
}

function changeExpand() {
  expandStatus.value = !expandStatus.value
  key.value++
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function resetAddForm() {
  addForm.email = ''
  addForm.suffix = settingStore.domainList[0]
  addForm.type = null
  addForm.password = ''
}

function openAdd() {
  showAdd.value = true
}

function submit() {

  if (!addForm.email) {
    ElMessage({
      message: "邮箱不能为空",
      type: "error",
      plain: true
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: "非法邮箱",
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.password) {
    ElMessage({
      message: "密码不能为空",
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.password.length < 6) {
    ElMessage({
      message: "密码至少六位",
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.type) {
    ElMessage({
      message: "身份类型不能为空",
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  const form = {...addForm}
  form.email = form.email + form.suffix
  userAdd(form).then(() => {
    addLoading.value = false
    showAdd.value = false
    ElMessage({
      message: "添加成功",
      type: "success",
      plain: true
    })
    resetAddForm()
    getUserList(false)
  }).finally(res => {
    addLoading.value = false
  })
}


function formatSendType(user) {
  if (user.sendAction.sendType === 'day') return '每天'
  if (user.sendAction.sendType === 'count') return '总数'
}

function formatSendCount(user) {

  if (!user.sendAction.hasPerm) {
    return '无权限'
  }

  if (!user.sendAction.sendCount) {
    return '无限制';
  }

  return user.sendCount + '/' + user.sendAction.sendCount + '次'
}

function toRoleName(type) {

  if (type === 0) {
    return '超级管理员'
  }

  const index = roleList.findIndex(role => role.roleId === type)
  if (index > -1) {
    return roleList[index].name
  }
  return ""
}

function resetSendCount(user) {

  ElMessageBox.confirm(`确认重置${user.email}发件次数吗?`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    userRestSendCount(user.userId).then(() => {
      ElMessage({
        message: "重置成功",
        type: "success",
        plain: true
      })
      user.sendCount = 0
    })
  });
}

function delUser(user) {
  ElMessageBox.confirm(`确认删除${user.email}吗?`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    userDelete(user.userId).then(() => {
      ElMessage({
        message: "删除成功",
        type: "success",
        plain: true
      })
      getUserList(false)
    })
  });
}

function restore(user) {

  const type = ref(0)

  ElMessageBox.confirm( null, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    message: () => h('div', [
      h('div', { class: 'mb-2' }, `确认要恢复 ${user.email}`),
      h(ElRadioGroup, {
        modelValue: type.value,
        'onUpdate:modelValue': (val) => (type.value = val),
      }, [
        h(ElRadio, { label: 'option1', value: 0 }, '普通恢复'),
        h(ElRadio, { label: 'option2', value: 1 }, '包括已删除的数据'),
      ])
    ]),
    type: 'warning'
  }).then(() => {
    userRestore(user.userId,type.value).then(() => {
      user.isDel = 0
      ElMessage({
        message: "恢复成功",
        type: "success",
        plain: true
      })
    })
  });
}

function setStatus(user) {

  if (user.status === 0) {
    ElMessageBox.confirm(`确认禁用 ${user.email} 吗?`, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      httpSetStatus(user)
    });
  } else {
    httpSetStatus(user)
  }
}

function httpSetStatus(user) {
  let status = user.status ? 0 : 1
  userSetStatus({status: status, userId: user.userId}).then(() => {
    user.status = status
    ElMessage({
      message: "设置成功",
      type: "success",
      plain: true
    })
  })
}

function setType() {
  settingLoading.value = true
  userSetType({type: userForm.type, userId: userForm.userId}).then(() => {
    chooseUser.type = userForm.type
    setTypeShow.value = false
    ElMessage({
      message: "设置成功",
      type: "success",
      plain: true
    })

  }).finally(() => {
    settingLoading.value = false
  })
}


function resetUserForm() {
  userForm.password = null
  userForm.userId = 0
  userForm.type = 0
}

function search() {
  params.num = 1
  getUserList()
}

function updatePwd() {

  if (userForm.password.length < 6) {
    ElMessage({
      message: '密码不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (userForm.password.length < 6) {
    ElMessage({
      message: '密码最少六位',
      type: 'error',
      plain: true,
    })
    return
  }

  settingLoading.value = true
  userSetPwd({password: userForm.password, userId: userForm.userId}).then(() => {
    setPwdShow.value = false
    ElMessage({
      message: "设置成功",
      type: "success",
      plain: true
    })
  }).finally(() => {
    settingLoading.value = false
  })
}

function openSetType(user) {
  chooseUser = user
  userForm.userId = user.userId
  userForm.type = user.type
  setTypeShow.value = true
}

function openSetPwd(user) {
  userForm.userId = user.userId
  setPwdShow.value = true
}

function refresh() {
  params.email = ''
  params.num = 1
  params.status = -1
  params.timeSort = 0
  getUserList();
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
}

function changeTimeSort() {
  params.num = 1
  params.timeSort = params.timeSort ? 0 : 1
  getUserList()
}

function numChange(num) {
  params.num = num
  getUserList()
}

function sizeChange(size) {
  params.size = size
  getUserList()
}

function getUserList(loading = true) {

  tableLoading.value = loading
  const newParams = {...params}

  if (newParams.status === -2) {
    delete newParams.status
    newParams.isDel = 1
  }
  userList(newParams).then(data => {
    users.value = data.list
    total.value = data.total
    scrollbarRef.value?.setScrollTop(0);
  }).finally(() => {
    tableLoading.value = false
    first.value = false
  })
}

window.onresize = () => {
  adjustWidth()
};

adjustWidth()

function adjustWidth() {
  const width = window.innerWidth
  statusShow.value = width > 1090
  createTimeShow.value = width > 1200
  accountNumShow.value = width > 650
  sendNumShow.value = width > 685
  typeShow.value = width > 767
  emailWidth.value = width > 480 ? 230 : null
  settingWidth.value = width < 480 ? 75 : null
  expandWidth.value = width < 480 ? 25 : 40
  pagerCount.value = width < 768 ? 7 : 11
  receiveWidth.value = width < 480 ? 90 : null
  layout.value = width < 768 ? 'pager' : 'prev, pager, next,sizes, total'
  phonePageShow.value = width < 768
  pageSize.value = width < 380 ? 'small' : ''
}

</script>

<style>
.el-message-box__container {
  align-items: start !important;
}

.el-message-box__message {
  word-break: break-all;
}
</style>
<style lang="scss" scoped>

.user-box {
  overflow: hidden;
  height: 100%;
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);
  font-size: 18px;

  .search-input {
    width: min(200px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input-group) {
      height: 28px;
    }

    :deep(.el-input__inner) {
      height: 28px;
    }
  }

  .icon {
    cursor: pointer;
  }
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.type {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.choose-star {
  color: var(--el-color-primary)
}

.scrollbar {
  width: 100%;
  overflow: auto;
  height: calc(100% - 50px);
  @media (max-width: 464px) {
    height: calc(100% - 90px);
  }
}

.details {
  padding: 20px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));

  .details-item-title {
    white-space: pre;
    color: #909399;
    font-weight: bold;
    padding-right: 10px;
  }
}

.pagination {
  margin-top: 15px;
  margin-bottom: 20px;
  padding-right: 30px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 10px;
  @media (max-width: 767px) {
    padding-right: 10px;
  }

  .el-pagination {
    align-self: end;
  }
}


.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-select {
  width: 80px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
  }
}

.dialog {
  .dialog-box {
    .el-button {
      width: 100%;
      margin-top: 15px;
    }
  }
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

.loading {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.8);
  left: 0;
  z-index: 2;
  top: 0;
  width: 100%;
  height: 100%;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: all 200ms;
  opacity: 0;
}

.setting-icon {
  position: relative;
  top: 6px;
}


.btn {
  width: 100%;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: #FFF;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: #FFFFFF;
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.cell) {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

:deep(.receive .cell) {
  white-space: nowrap;
}

:deep(.send .cell) {
  white-space: nowrap;
}

:deep(.account .cell) {
  white-space: nowrap;
}

:deep(.el-table th.el-table__cell>.cell.highlight) {
  color: #909399;
}

:deep(.el-table__inner-wrapper:before) {
  background: #fff;
}

:deep(.el-message-box__container) {
  align-items: start;
}
</style>