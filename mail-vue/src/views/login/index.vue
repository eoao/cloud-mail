<template>
  <div id="login-box">
    <!-- 移除动态背景条件判断，直接渲染静态背景图 -->
    <div :style="background"></div>

    <!-- 保留原有表单内容 -->
    <div class="form-wrapper">
      <div class="container">
        <!-- 标题 -->
        <span class="form-title">{{ settingStore.settings.title }}</span>

        <!-- 登录/注册描述 -->
        <span class="form-desc" v-if="show === 'login'">
          请输入你的账号信息以开始使用邮箱系统
        </span>
        <span class="form-desc" v-else>
          请输入你的账号密码以开始注册邮箱系统
        </span>

        <!-- 登录表单 -->
        <div v-if="show === 'login'">
          <el-input class="email-input" v-model="form.email" type="text" placeholder="邮箱" autocomplete="off">
            <template #append>
              <div @click.stop="openSelect">
                <el-select ref="mySelect" v-model="suffix" placeholder="请选择" class="select">
                  <el-option v-for="item in domainList" :key="item" :label="item" :value="item" />
                </el-select>
                <div style="color: #333">
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20" />
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="form.password" placeholder="密码" type="password" autocomplete="off" />
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading">
            登录
          </el-button>
        </div>

        <!-- 注册表单 -->
        <div v-else>
          <el-input class="email-input" v-model="registerForm.email" type="text" placeholder="邮箱" autocomplete="off">
            <template #append>
              <div @click.stop="openSelect">
                <el-select ref="mySelect" v-model="suffix" placeholder="请选择" class="select">
                  <el-option v-for="item in domainList" :key="item" :label="item" :value="item" />
                </el-select>
                <div style="color: #333">
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20" />
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.password" placeholder="密码" type="password" autocomplete="off" />
          <el-input v-model="registerForm.confirmPassword" placeholder="确认密码" type="password" autocomplete="off" />
          <div v-show="verifyShow" class="register-turnstile" :data-sitekey="settingStore.settings.siteKey" data-callback="onTurnstileSuccess" />
          <el-button class="btn" type="primary" @click="submitRegister" :loading="registerLoading">
            注册
          </el-button>
        </div>

        <!-- 切换登录/注册按钮 -->
        <div class="switch" @click="show = 'register'" v-if="show === 'login'">
          还有没有账号? <span>创建账号</span>
        </div>
        <div class="switch" @click="show = 'login'" v-else>
          已有账号? <span>去登录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import { computed, reactive, ref } from "vue";
import { login, register } from "@/request/login.js";
import { ElMessage } from "element-plus";
import { isEmail } from "@/utils/verify-utils.js";
import { useSettingStore } from "@/store/setting.js";
import { useAccountStore } from "@/store/account.js";
import { useUserStore } from "@/store/user.js";
import { Icon } from "@iconify/vue";

// 引入原逻辑中的状态变量
const accountStore = useAccountStore();
const userStore = useUserStore();
const settingStore = useSettingStore();
const loginLoading = ref(false);
const show = ref("login");
const form = reactive({ email: "", password: "" });
const mySelect = ref();
const suffix = ref("");
const registerForm = reactive({ email: "", password: "", confirmPassword: "" });
const domainList = settingStore.domainList;
const registerLoading = ref(false);
suffix.value = domainList[0];
const verifyShow = ref(false);
let verifyToken = "";
let turnstileId = "";

// 验证码回调函数
window.onTurnstileSuccess = (token) => {
  verifyToken = token;
  setTimeout(() => {
    verifyShow.value = false;
  }, 2000);
};

// 计算属性：设置静态背景图
const background = computed(() => ({
  // 直接使用雨云图片URL，移除cvtR2Url转换
  backgroundImage: `url(https://wwwaaa123122.cn-nb1.rains3.com/img/Image_1748831276428.png)`,
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover", // 可调整为contain避免裁剪
  backgroundPosition: "center",
  width: "100%",
  height: "100vh",
  position: "fixed",
  zIndex: "-1", // 确保背景在表单下方
}));

// 其他功能函数（登录/注册逻辑保持不变）
const openSelect = () => {
  mySelect.value.toggleMenu();
};

const submit = () => {
  // 原登录验证逻辑...
};

function submitRegister() {
  // 原注册验证逻辑...
}
</script>

<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>

<style lang="scss" scoped>
.form-wrapper {
  /* 原样式保持不变 */
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  // ...（其他响应式样式）
}

.container {
  /* 原样式保持不变 */
  background: v-bind(loginOpacity);
  // ...（其他盒模型样式）
}

/* 移除动态背景相关样式 */
#background-wrap,
.cloud {
  display: none !important; // 强制隐藏动态云朵背景
}

#login-box {
  background: none !important; // 清除默认渐变背景
  min-height: 100vh; // 确保背景撑满视口
}
</style>
