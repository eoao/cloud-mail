<template>
  <div class="send" v-show="show" @click="close">
    <div class="write-box" @click.stop>
      <div class="title">
        <div class="title-left">
          <span class="title-text">
            <Icon icon="hugeicons:quill-write-01" width="28" height="28" />
          </span>
          <span class="sender">发件人:</span>
          <span class="sender-name">{{form.name}}</span>
          <span class="send-email"><{{form.sendEmail}}></span>
        </div>
        <div @click="close" style="cursor: pointer;">
          <Icon icon="material-symbols-light:close-rounded" width="22" height="22"/>
        </div>
      </div>
      <div class="container">
        <el-input-tag @add-tag="addTagChange" tag-type="primary" size="default" v-model="form.receiveEmail" placeholder="多个邮箱用, 分开 example1.com,example2.com" >
          <template #prefix>
            <div class="item-title">收件人 </div>
          </template>
          <template #suffix>
            <span class="distribute" :class="form.manyType ? 'checked' : ''" @click.stop="checkDistribute" >分别发送</span>
          </template>
        </el-input-tag>
        <el-input v-model="form.subject" placeholder="请输入邮件主题">
          <template #prefix>
            <div class="item-title">主题 </div>
          </template>
        </el-input>
        <tinyEditor :def-value="defValue" ref="editor" @change="change"/>
        <div class="button-item">
          <div class="att-add" @click="chooseFile">
            <Icon icon="iconamoon:attachment-fill" width="24" height="24"/>
          </div>
          <div class="att-clear" @click="clearContent">
            <Icon icon="icon-park-outline:clear-format" width="24" height="24 "/>
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
            <el-button type="primary" @click="sendEmail" v-if="form.sendType === 'reply'">回复</el-button>
            <el-button type="primary" @click="sendEmail" v-else >发送</el-button>
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
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import {formatDetailDate} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";

defineExpose({
  open,
  openReply
})

const settingStore = useSettingStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const percent = ref(0)
let percentMessage = null
let sending = false
const defValue = ref('')
const form = reactive({
  sendEmail: '',
  receiveEmail: [],
  accountId: -1,
  manyType: null,
  name: '',
  subject: '',
  content: '',
  sendType: '',
  text: '',
  emailId: 0,
  attachments: []
})

function addTagChange(val) {

  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  form.receiveEmail.splice(form.receiveEmail.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !form.receiveEmail.includes(email)) {
      form.receiveEmail.push(email)
    }

  })


}

function checkDistribute() {
  form.manyType = form.manyType ? null : 'divide'
}

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

  if (form.receiveEmail.length === 0) {
    ElMessage({
      message: '收件人邮箱地址不能为空',
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

  if (form.manyType === 'divide' && form.attachments.length > 0) {
    ElMessage({
      message: '分别发送暂时不支持附件',
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
  }).then(emailList => {
    const email = emailList[0]
    emailList.forEach(item => {
      emailStore.sendScroll?.addItem(item)
    })
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
  form.receiveEmail = []
  form.subject = ''
  form.content = ''
  form.manyType = null
  form.attachments = []
  form.sendType = null
  form.emailId = 0
  editor.value.clearEditor()
}

function change(content, text) {
  form.content = content;
  form.text = text
}

function openReply(email) {

  resetForm();

  email.subject = email.subject || ''

  form.receiveEmail.push(email.sendEmail)
  form.subject = (email.subject.startsWith('Re:') || email.subject.startsWith('回复：')) ? email.subject : 'Re: ' + email.subject
  form.sendType = 'reply'
  form.emailId = email.emailId

  defValue.value = ''

  setTimeout(() => {
    defValue.value = `
    <div></div>
    <div>
    <br>
        ${ formatDetailDate(email.createTime) }，${email.name} &lt${email.sendEmail}&gt 来信:
    </div>
    <blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">
      <articl>
          ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
      </article>
    </blockquote>`
    open()
    console.log(defValue.value)
  })

}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  console.log(content)
  return  content.replace(/{{domain}}/g, domain + '/');
}

function open() {
  if (!accountStore.currentAccount.email) {
    form.sendEmail = userStore.user.email;
    form.accountId = userStore.user.accountId;
    form.name = userStore.user.name;
  } else {
    form.sendEmail = accountStore.currentAccount.email;
    form.accountId = accountStore.currentAccount.accountId;
    form.name = accountStore.currentAccount.name;
  }
  show.value = true;
  editor.value.focus()
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
    width: min(1200px,calc(100% - 80px));
    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--el-border-color-light);
    transition: var(--el-transition-duration);
    padding: 15px;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    @media (max-width: 1024px) {
      width: 100%;
      height: 100%;
      border-radius: 0;
      padding-top: 10px;
    }

    @media (min-width: 1025px) {
      height: min(800px, calc(100vh - 60px));
    }

    .title {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      .title-left {
        align-items: center;
        display: grid;
        grid-template-columns: auto auto auto 1fr;
      }
      .title-text {
      }

      .sender {
        margin-left: 8px;
      }

      .sender-name {
        margin-left: 8px;
        font-weight: bold;
      }

      .send-email {
        color: #999896;
        margin-left: 5px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }


      div {
        display: flex;
        align-items: center;
      }
    }

    .container {
      height: 100%;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 15px;
      .distribute {
        color: var(--el-color-info);
        background: var(--el-color-info-light-9);
        border: var(--el-color-info-light-8);
        border-radius: 4px;
        font-size: 12px;
        padding: 0 5px;
      }

      .distribute.checked {
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary) !important;
        border-radius: 4px;
      }


      .distribute:hover {
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary) !important;
        border-radius: 4px;
      }

      .item-title {
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

:deep(.el-input-tag__suffix) {
  padding-right: 4px;
}

.icon {
  cursor: pointer;
}
</style>