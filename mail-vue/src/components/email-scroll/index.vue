<template>
  <div class="email-container">
    <div class="header-actions">
      <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
        <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16"
              v-if="getSelectedMailsIds().length > 0"
              @click="handleDelete"/>
      </div>

      <div class="header-right">
        <span class="email-count" v-if="total">共 {{ total }} 封</span>
        <Icon v-if="showAccountIcon" class="more-icon icon" width="16" height="16" icon="akar-icons:dot-grid-fill"
              @click="changeAccountShow"/>
      </div>
    </div>

    <div ref="scroll" class="scroll">
      <el-scrollbar ref="scrollbarRef" @scroll="handleScroll" >
        <div class="scroll-box" :infinite-scroll-immediate="false" v-infinite-scroll="loadData"
             infinite-scroll-distance="600">
          <div v-for="item in emailList" :key="item.emailId">
            <div class="email-row"
                 :data-checked="item.checked"
                 @click="jumpDetails(item)"
            >
              <el-checkbox v-model="item.checked" @click.stop></el-checkbox>
              <div @click.stop="starChange(item)" class="pc-star" v-if="showStar">
                <Icon v-if="item.isStar" icon="fluent-color:star-16" width="20" height="20"/>
                <Icon v-else icon="solar:star-line-duotone" width="18" height="18"/>
              </div>
              <div v-if="!showStar"></div>
              <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

                <div class="email-sender" :style=" showStatus ? 'gap: 10px;' : ''">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip v-if="item.status ===  0"
                                effect="dark"
                                content="已接收"
                    >
                      <Icon icon="ic:round-mark-email-read" style="color: #67C23A" width="20" height="20"/>
                      />

                    </el-tooltip>
                    <el-tooltip v-if="item.status ===  1"
                                effect="dark"
                                content="已发送"
                    >
                      <Icon icon="bi:send-arrow-up" style="color: #67C23A" width="20" height="20"
                      />

                    </el-tooltip>
                    <el-tooltip v-if="item.status ===  2"
                                effect="dark"
                                content="发送成功"
                    >
                      <Icon icon="bi:send-check-fill" style="color: #67C23A" width="20"
                            height="20"/>

                    </el-tooltip>
                    <el-tooltip v-if="item.status ===  3"
                                effect="dark"
                                content="发送失败"
                    >
                      <Icon icon="bi:send-x-fill" style="color: #F56C6C" width="20"
                            height="20"/>

                    </el-tooltip>
                    <el-tooltip v-if="item.status ===  4"
                                effect="dark"
                                content="被标记垃圾邮件"
                    >
                      <Icon icon="bi:send-exclamation-fill" style="color:#FBBD08" width="20"
                            height="20"/>

                    </el-tooltip>
                    <el-tooltip v-if="item.status ===  5"
                                effect="dark"
                                content="发送延迟"
                    >
                      <Icon icon="quill:send-later" style="color:#FBBD08" width="20"
                            height="20"/>

                    </el-tooltip>
                  </div>
                  <div v-else></div>
                  <span class="name">
                    <span>{{ item.name }}</span>
                    <span>
                      <Icon v-if="item.isStar" icon="fluent-color:star-16" width="18" height="18"/>
                    </span>
                  </span>
                  <span class="phone-time">{{ fromNow(item.createTime) }}</span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject">{{ item.subject }}</span>
                    <span class="email-content">{{ htmlToText(item) }}</span>
                  </div>
                  <div class="user-info" v-if="showUserInfo">
                    <div class="user">
                      <span>
                        <Icon icon="mynaui:user" width="20" height="20"/>
                      </span>
                      <span>{{ item.userEmail }}</span>
                    </div>
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="20" height="20"/>
                      </span>
                      <span>{{ item.accountEmail }}</span>
                    </div>
                    <div class="del-status" v-if="item.isDel">
                      <el-tag type="info" size="small">已删除</el-tag>
                    </div>
                  </div>
                </div>
              </div>
              <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                <span class="email-time">{{ fromNow(item.createTime) }}</span>
              </div>
            </div>
          </div>
          <div class="loading" :class="loading ? 'loading-show' : 'loading-hide'">
            <Loading/>
          </div>
          <div class="follow-loading" v-if="followLoading">
            <Loading/>
          </div>
          <div class="noLoading" v-if="noLoading && emailList.length > 0">
            <div>没有更多数据了</div>
          </div>
          <div class="empty" v-if="noLoading && emailList.length === 0">
            <el-empty description="没有任何邮件"/>
          </div>
        </div>
      </el-scrollbar>

    </div>
  </div>
</template>

<script setup>
import Loading from "@/components/loading/index.vue";
import {Icon} from "@iconify/vue";
import {computed, onActivated, reactive, ref, watch} from "vue";
import {onBeforeRouteLeave} from "vue-router";
import {ElMessage, ElMessageBox} from "element-plus";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {fromNow} from "@/utils/day.js";

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  }
})


const emit = defineEmits(['jump', 'refresh-before'])

const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
const queryParam = reactive({
  emailId: 0,
  size: 30,
});

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total
})

onActivated(() => {
  scroll.value.scrollTop = scrollTop
})

getEmailList()

onBeforeRouteLeave(() => {
  scrollTop = scroll.value.scrollTop
})


watch(
    () => emailList.map(item => item.checked),
    () => {
      if (emailList.length > 0) {
        updateCheckStatus();
      }
    },
    {deep: true}
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

function handleScroll(e) {
}

function htmlToText(email) {
  if (email.content) {

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = email.content;
    const scriptsAndStyles = tempDiv.querySelectorAll('script, style, title');
    scriptsAndStyles.forEach(el => el.remove());
    const text = tempDiv.textContent || tempDiv.innerText || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  if (email.text) {
    return email.text
  } else {
    return ''
  }

}


function starChange(email) {

  if (!email.isStar) {

    if (!props.allowStar) return;

    email.isStar = 1;
    props.starAdd(email.emailId).then(() => {
      email.isStar = 1;
      props.starSuccess(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 0
    })
  } else {

    email.isStar = 0;
    props.starCancel(email.emailId).then(() => {
      email.isStar = 0;
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 1;
    })
  }
}

function changeAccountShow() {
  uiStore.accountShow = !uiStore.accountShow;
}


const handleDelete = () => {
  ElMessageBox.confirm('确认批量删除这些邮件吗?', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const emailIds = getSelectedMailsIds();
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: '删除成功',
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds;
    })
  })
}

function deleteEmail(emailIds) {
  emailIds.forEach(emailId => {
    emailList.forEach((item, index) => {
      if (emailId === item.emailId) {
        emailList.splice(index, 1);
      }
    })
  })
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return
  }


  if (props.timeSort) {
    if (noLoading.value) {
      emailList.push(email)
      latestEmail.value = email
      total.value++
    } else {
      total.value++
    }
    return;
  }

  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      emailList.push(email)
    }
  }

  latestEmail.value = email
  total.value++
}

function handleCheckAllChange(val) {
  emailList.forEach(item => item.checked = val);
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}


function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkAll.value = checkedCount === emailList.length;
  isIndeterminate.value = checkedCount > 0 && checkedCount < emailList.length;
}

function jumpDetails(email) {
  emit('jump', email)
}


function getEmailList(refresh = false) {

  if (reqLock) return;

  reqLock = true

  if (!refresh) {

    if (loading.value || noLoading.value) {
      reqLock = false
      return
    }

  } else {
    loading.value = true
  }

  if (emailList.length === 0) {
    loading.value = true
  } else {
    followLoading.value = !refresh;
  }


  props.getEmailList(queryParam.emailId, queryParam.size).then(data => {


    firstLoad.value = false

    let list = data.list.map(item => ({
      ...item,
      checked: false
    }));


    if (refresh) {
      emailList.length = 0
    }

    latestEmail.value = data.latestEmail
    emailList.push(...list);

    if (refresh) scrollbarRef.value?.setScrollTop(0);

    noLoading.value = data.list.length < queryParam.size;
    followLoading.value = data.list.length >= queryParam.size;

    total.value = data.total;
    queryParam.emailId = data.list.length > 0 ? data.list.at(-1).emailId : 0
  }).finally(() => {
    loading.value = false
    reqLock = false
  })
}

function refresh() {
  emit('refresh-before')
  refreshList()
}

function refreshList() {
  checkAll.value = false;
  isIndeterminate.value = false;
  queryParam.emailId = 0;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}

</script>

<style lang="scss" scoped>

.email-container {
  border-radius: 8px;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 0;
  font-size: 14px;
  color: #2e2e2e;
  overflow: hidden;
  height: 100%;
}

.scroll {
  margin: 0;
  overflow: auto;
  height: 100%;
  position: relative;

  .scroll-box {
    height: 100%;
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
    padding: 15px 0;
    color: gray;
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.8);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
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
}

.email-row {
  display: flex;
  padding: 8px 0;
  justify-content: space-between;
  box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);
  cursor: pointer;
  align-items: center;
  position: relative;
  transition: background 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  @media (max-width: 1199px) {
  }

  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    color: rgba(25, 41, 59, 0.4);

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: all 300ms;
      line-height: 12px;
      max-width: 290px;

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  .el-checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
  }

  .title-column {
    @media (max-width: 1200px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    display: grid;
    grid-template-columns: 220px 1fr;
    @media (max-width: 1199px) {
      padding-right: 15px;
    }
    @media (max-width: 1024px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      font-weight: bold;
      color: #1a1a1a;
      display: grid;
      grid-template-columns: auto 1fr auto;

      .email-status {
        display: flex;
        align-content: center;
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;
        @media (min-width: 1024px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        color: #333 !important;
        @media (min-width: 1200px) {
          display: none;
        }
      }
    }

    .email-text {
      color: #333;
      display: grid;
      grid-template-columns: auto 1fr;
      @media (max-width: 1199px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: rgba(25, 41, 59, 0.4);
        @media (max-width: 1199px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 12px;
    white-space: nowrap;
    display: flex;
    padding-left: 15px;
    align-items: center;
    color: #333;
    @media (max-width: 1199px) {
      display: none;
    }
  }

  &:hover {
    box-shadow: inset 1px 0 0 rgb(218, 220, 224),
    inset -1px 0 0 rgb(218, 220, 224),
    0 1px 2px 0 rgba(60, 64, 67, 0.3),
    0 1px 3px 1px rgba(60, 64, 67, 0.15);
    z-index: 0;
  }

  /*&[data-checked="true"] {
    background-color: #c2dbff;
  }*/
}


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@media (max-width: 1024px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: 16px !important;
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 15px;
  padding: 3px 15px;
  box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);


  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 15px;
    row-gap: 8px;
    padding-left: 2px;
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: start;
    height: 100%;

    .email-count {
      white-space: nowrap;
      margin-top: 6px;
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

</style>
