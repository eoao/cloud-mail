<template>
  <div class="send" v-show="show">
    <div class="write-box">
      <div class="title">
        <div class="title-left">
          <span class="title-text">写邮件</span>
        </div>
        <div @click="close" style="cursor: pointer;">
          <Icon icon="material-symbols-light:close-rounded" width="22" height="22"/>
        </div>
      </div>
      <div class="container">
        <el-input v-model="form.sendEmail" disabled placeholder="">
          <template #prefix>
            <div class="item-title">发件人 :</div>
          </template>
        </el-input>
        <el-input v-model="form.receiveEmail" placeholder="收件人邮箱地址">
          <template #prefix>
            <div class="item-title">收件人 :</div>
          </template>
        </el-input>
        <el-input v-model="form.name" placeholder="发件人名字,不填则默认使用邮箱名">
          <template #prefix>
            <div class="item-title">名字 :</div>
          </template>
        </el-input>
        <el-input v-model="form.subject" placeholder="邮件主题">
          <template #prefix>
            <div class="item-title">主题 :</div>
          </template>
        </el-input>
        <tinyEditor ref="editor" @change="change"/>
        <div class="button-item">
          <div class="att-add" @click="chooseFile">
            <Icon icon="iconamoon:attachment-fill" width="26" height="26"/>
          </div>
          <div class="att-clear" @click="clearContent">
            <Icon icon="icon-park-outline:clear-format" width="26" height="26"/>
          </div>
          <div class="att-list">
            <div class="att-item" v-for="(item,index) in form.attachments" :key="index">
              <Icon :icon="getIconByName(item.filename)" width="20" height="20"/>
              <span class="att-filename">{{ item.filename }}</span>
              <span class="att-size">{{ formatBytes(item.size) }}</span>
              <Icon style="cursor: pointer;" icon="material-symbols-light:close-rounded" @click="delAtt(index)"
                    width="22" height="22"/>
            </div>
          </div>
          <div>
            <el-button type="primary" @click="sendEmail">发送</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import tinyEditor from '@/components/tiny-editor/index.vue'
import {h, onMounted, onUnmounted, reactive, ref} from "vue";
import {Icon} from "@iconify/vue";
import {useUserStore} from "@/store/user.js";
import {emailSend} from "@/request/email.js";
import {isEmail} from "@/utils/verify-utils.js";
import {ElMessage, ElMessageBox, ElNotification} from "element-plus";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import hasPerm from "@/utils/perm.js";

defineExpose({
  open
})

const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const percent = ref(0)
let percentMessage = null
let sending = false
const form = reactive({
  sendEmail: '',
  receiveEmail: '',
  accountId: -1,
  name: '',
  subject: '',
  content: '',
  text: '',
  attachments: []
})

function clearContent() {
  ElMessageBox.confirm('确定要清空邮件吗?', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    resetForm()
  })

}

function delAtt(index) {
  form.attachments.splice(index, 1);
}

function chooseFile() {
  const doc = document.createElement("input")
  doc.setAttribute("type", "file")
  doc.click()
  doc.onchange = async (e) => {

    const file = e.target.files[0]
    const size = file.size
    const filename = file.name
    const contentType = file.type

    const TotalSize = form.attachments.reduce((acc, item) => acc + item.size, 0);
    if ((TotalSize + size) > 29360128) {
      ElMessage({
        message: '附件文件大小限制28mb',
        type: 'error',
        plain: true,
      })
      return
    }

    const content = await fileToBase64(file)
    form.attachments.push({content, filename, size, contentType})
  }
}

async function sendEmail() {

  if (!form.receiveEmail) {
    ElMessage({
      message: '收件人邮箱地址不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(form.receiveEmail)) {
    ElMessage({
      message: '请输入正确的收件人邮箱',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.subject) {
    ElMessage({
      message: '主题不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.content) {
    ElMessage({
      message: '正文不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (sending) {
    ElMessage({
      message: '邮件正在发送中',
      type: 'error',
      plain: true,
    })
    return
  }

  percentMessage =  ElMessage({
    message: () => h(sendPercent, { value: percent.value }),
    dangerouslyUseHTMLString: true,
    plain: true,
    duration: 0,
    customClass: 'message-bottom'
  })

  sending = true
  close()
  emailSend(form, (e) => {
    percent.value = Math.round((e.loaded * 98) / e.total)
  }).then(email => {
    emailStore.sendScroll?.addItem(email)
    resetForm()
    show.value = false
    ElNotification({
      title: '邮件已发送',
      type: "success",
      message: h('span', { style: 'color: teal' }, email.subject),
      position: 'bottom-right'
    })
    userStore.refreshUserInfo();
  }).catch((e) => {
    ElNotification({
      title: '发送失败',
      type: e.code === 403 ? 'warning' : 'error',
      message: h('span', { style: 'color: teal' }, e.message),
      position: 'bottom-right'
    })
  }).finally(() => {
    percentMessage.close()
    percent.value = 0
    sending = false
  })
}


function resetForm() {
  form.receiveEmail = ''
  form.name = ''
  form.subject = ''
  form.content = ''
  form.attachments = []
  editor.value.clearEditor()
}

function change(content, text) {
  form.content = content;
  form.text = text
}

function open() {
  if (!accountStore.currentAccount.email) {
    form.sendEmail = userStore.user.email;
    form.accountId = userStore.user.accountId;
  } else {
    form.sendEmail = accountStore.currentAccount.email;
    form.accountId = accountStore.currentAccount.accountId;
  }
  show.value = true;
}

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    close()
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

function close() {
  show.value = false;
}

</script>

<style scoped lang="scss">
.send {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  .write-box {
    background: #FFFFFF;
    width: 900px;
    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--el-border-color-light);
    transition: var(--el-transition-duration);
    padding: 15px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    @media (max-width: 1024px) {
      width: 100%;
      height: 100%;
      border-radius: 0;
    }

    @media (min-width: 1024px) {
      height: min(800px, calc(100vh - 60px));
    }

    .title {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      .title-left {
        align-items: center;
        display: flex;
        gap: 10px;
      }
      .title-text {
        font-weight: bold;
        font-size: 16px;
      }

      div {
        display: flex;
      }
    }

    .container {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 15px;

      .item-title {
        color: #333;
        margin-right: 8px;
      }

      .button-item {
        display: grid;
        grid-template-columns: auto auto 1fr auto;

        .att-add {
          cursor: pointer;
        }

        .att-clear {
          cursor: pointer;
          margin-left: 10px;
        }

        .att-list {
          display: grid;
          gap: 5px;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          padding-left: 10px;
          padding-right: 10px;
          max-height: 110px;
          overflow-y: auto;
          @media (max-width: 450px) {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          }

          .att-item {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            gap: 5px;
            height: 32px;
            font-size: 14px;
            border: 1px solid var(--el-border-color-light);
            padding: 5px 5px;
            border-radius: 4px;

            .att-filename {
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
            }
          }
        }
      }
    }
  }

}
.icon {
  cursor: pointer;
}
</style>