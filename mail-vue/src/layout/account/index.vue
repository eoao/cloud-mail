<template>
  <div class="account-box">
    <div class="head-opt" >
      <Icon v-if="settingStore.settings.addEmail === 0" v-perm="'account:add'" class="icon" icon="ion:add-outline" width="23" height="23" @click="add" />
      <Icon class="icon" icon="ion:reload" width="18" height="18"  @click="refresh" />
    </div>
    <el-scrollbar class="scrollbar">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600"  :infinite-scroll-immediate="false">
        <el-card class="item" :class="itemBg(item.accountId)" v-for="item in accounts" :key="item.accountId" @click="changeAccount(item)">
          <div class="account">
            {{ item.email }}
          </div>
          <div class="opt">
            <div class="send-email" @click.stop>
              <Icon  icon="eva:email-fill" width="22" height="22" color="#fbbd08" />
            </div>
            <div class="settings" @click.stop>
              <Icon v-if="item.accountId === userStore.user.accountId || !hasPerm('account:delete')" icon="fluent:settings-24-filled" width="20" height="20" color="#909399" />
              <el-dropdown v-else >
                <Icon icon="fluent:settings-24-filled" width="20" height="20" color="#909399" />
                <template #dropdown >
                  <el-dropdown-menu>
                    <el-dropdown-item @click="remove(item)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </el-card>

        <!-- Initial Loading Skeleton -->
        <template v-if="loading">
          <el-skeleton v-for="i in 3" :key="i"  animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 20px" />
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px" />
                  <el-skeleton-item variant="text" style="width: 20px" />
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <!-- Follow Loading Skeleton -->
        <template v-if="accounts.length > 0 && !noLoading">
          <el-skeleton animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 20px" />
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px" />
                  <el-skeleton-item variant="text" style="width: 20px" />
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <div class="noLoading" v-if="noLoading && accounts.length > 0">
          <div>没有更多数据了</div>
        </div>
        <div class="empty" v-if="noLoading && accounts.length === 0">
          <el-empty description="没有任何邮件" />
        </div>
      </div>

    </el-scrollbar>
    <el-dialog v-model="showAdd" title="添加邮箱" >
        <div class="container">
          <el-input v-model="addForm.email" type="text" placeholder="邮箱" autocomplete="off">
            <template #append>
              <div  @click.stop="openSelect">
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
                  <span >{{addForm.suffix}}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20" />
                </div>
              </div>
            </template>
          </el-input>
          <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
          >添加
          </el-button>
        </div>
      <div
          class="add-email-turnstile"
          :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
          :data-sitekey="settingStore.settings.siteKey"
          data-callback="onTurnstileSuccess"
      ></div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {nextTick, reactive, ref} from "vue";
import {accountList, accountAdd, accountDelete} from "@/request/account.js";
import {ElMessage, ElMessageBox} from "element-plus";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import hasPerm from "@/utils/perm.js";

const userStore = useUserStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const showAdd = ref(false)
const addLoading = ref(false);
const domainList = settingStore.domainList
const accounts = reactive([])
const noLoading = ref(false)
const loading = ref(false)
const followLoading = ref(false);
const verifyShow = ref(false)
let turnstileId = false
let verifyToken = ''
const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0]
})
const queryParams = {
  accountId: 0,
  size: 20
}

const mySelect = ref()

if (hasPerm('account:query')) {
  getAccountList()
}


const openSelect = () => {
  mySelect.value.toggleMenu()
}

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
  setTimeout(() => {
    verifyShow.value = false
  },1500)
};

function itemBg(accountId) {
  return accountStore.currentAccountId === accountId ? 'item-choose' : ''
}

function remove(account) {
  ElMessageBox.confirm(`确认删除${account.email}吗?`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    accountDelete(account.accountId).then(() => {
      const index = accounts.findIndex(item => item.accountId === account.accountId);
      accounts.splice(index, 1);
      if (accounts.length < queryParams.size) {
        getAccountList()
      }
      ElMessage({
        message: '删除成功',
        type: 'success',
        plain: true,
      })
    })
  });
}

function refresh() {
  if (loading.value) {
    return
  }
  loading.value = false
  followLoading.value = false
  noLoading.value = false
  queryParams.accountId = 0
  accounts.splice(0, accounts.length)
  getAccountList()
}
function changeAccount(account) {
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
}

function add() {
  showAdd.value = true
}

function getAccountList() {

  if (loading.value || followLoading.value || noLoading.value) return;

  if (accounts.length === 0) {
    loading.value = true
  }else {
    followLoading.value = true
  }

  accountList(queryParams.accountId,queryParams.size).then(list => {
    if (list.length < queryParams.size) {
      noLoading.value = true
    }
    if (accounts.length === 0) {
      accountStore.currentAccount = list[0].accountId
    }
    queryParams.accountId = list.at(-1).accountId
    accounts.push(...list)

    loading.value = false
    followLoading.value = false
  }).catch(() => {
    loading.value = false
    followLoading.value = false
  })
}


function submit()  {

  if (!addForm.email){
    ElMessage({
      message: "邮箱不能为空",
      type: "error",
      plain: true
    })
    return
  }

  if (!isEmail(addForm.email+addForm.suffix)) {
    ElMessage({
      message: "非法邮箱",
      type: "error",
      plain: true
    })
    return
  }
  if (!verifyToken && settingStore.settings.addEmailVerify === 0) {
    verifyShow.value = true
    if (!turnstileId) {
      nextTick(() => {
        turnstileId = window.turnstile.render('.add-email-turnstile')
      })
    } else {
      window.turnstile.reset(turnstileId)
    }
    return;
  }

  addLoading.value = true
  accountAdd(addForm.email+addForm.suffix,verifyToken).then(account => {
    addLoading.value = false
    showAdd.value = false
    addForm.email = ''
    accounts.push(account)
    verifyToken = ''
    ElMessage({
      message: "添加成功",
      type: "success",
      plain: true
    })
    userStore.refreshUserInfo()
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      window.turnstile.reset(turnstileId)
      verifyShow.value = true
    }
    addLoading.value = false
  })
}
</script>
<style scoped lang="scss">
.account-box {

  border-right: 1px solid var(--el-border-color) !important;
  background-color: #FFF;
  height: 100%;
  overflow: hidden;
  .head-opt {
    display: flex;
    align-items: center;
    height: 38px;
    box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);
    padding-left: 10px;
    padding-right: 10px;
    .icon{
      cursor: pointer;
    }
    .icon:nth-child(2) {
      margin-left: 15px;
    }
  }
  .scrollbar {
    width: 100%;
    height: calc(100% - 38px);
    overflow: auto;
    @media (max-width: 767px) {
      height: calc(100% - 98px);
    }
    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    .noLoading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px 0;
      color: gray;
    }
  }
  .btn {
    width: 100%;
    margin-top: 15px;
  }

  .item {
    background-color: #fff;
    border-radius: 8px;
    padding: 12px 10px;
    margin-bottom: 10px;
    margin-left: 10px;
    margin-right: 10px;
    cursor: pointer;
    .account {
      font-weight: 600;
      margin-bottom: 20px;
      color: #333;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .opt {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #888;

    }

    :deep(.el-card__body) {
      padding: 0;
    }
  }
  .item:first-child{
    margin-top: 10px  ;
  }

  .item-choose {
    background: var(--el-color-primary-light-8);
  }
}


.setting-icon {
  position: relative;
  top: 6px;
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

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: #FFF;
}

.add-email-turnstile {
  margin-top: 15px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

</style>