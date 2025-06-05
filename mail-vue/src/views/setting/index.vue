<template>
  <div class="box">
    <div class="pass">
      <div class="title">账户与密码</div>
      <div class="pass-item">
        <div>邮箱</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="pass-item">
        <div>密码</div>
        <div>
          <el-button type="primary"  @click="pwdShow = true">修改密码</el-button>
        </div>
      </div>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">删除账户</div>
      <div style="color: #585d69;">
        此操作将永久删除您的账户及其所有数据，无法恢复
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">删除账户</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" title="修改密码" width="340">
        <div class="update-pwd">
          <el-input type="password"  placeholder="新的密码" v-model="form.password"/>
          <el-input type="password"  placeholder="确认密码" v-model="form.newPwd"/>
          <el-button type="primary" :loading="setPwdLoading"  @click="submitPwd">保存</el-button>
        </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {defineOptions} from "vue";
import {reactive, ref} from 'vue'
import {resetPassword, userDelete} from "@/request/my.js";
import {ElMessage, ElMessageBox} from "element-plus";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
const userStore = useUserStore();
const setPwdLoading = ref(false)

defineOptions({
  name: 'setting'
})

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm('确认删除当前账号及所有数据吗?', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: '删除成功',
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (!form.password) {
    ElMessage({
      message: '密码不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: '密码不能小于6位',
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: '两次密码输入不一致',
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: '修改成功',
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
.box {
  padding: 40px 40px;

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .pass {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .pass-item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      @media (max-width: 767px) {
        gap: 80px;
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
}
</style>