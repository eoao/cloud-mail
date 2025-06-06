<template>
  <div id="login-box">
    <!-- 静态背景容器，使用固定定位覆盖整个视口 -->
    <div class="static-background"></div>

    <!-- 原登录表单内容，保持不变 -->
    <div class="form-wrapper">
      <div class="container">
        <!-- 标题 -->
        <span class="form-title">{{settingStore.settings.title}}</span>

        <!-- 登录/注册描述 -->
        <span class="form-desc" v-if="show === 'login'">请输入你的账号信息以开始使用邮箱系统</span>
        <span class="form-desc" v-else>请输入你的账号密码以开始注册邮箱系统</span>

        <!-- 登录表单 -->
        <div v-if="show === 'login'">
          <el-input class="email-input" v-model="form.email" type="text" placeholder="邮箱" autocomplete="off">
            <template #append>
              <div @click.stop="openSelect">
                <el-select
                    ref="mySelect"
                    v-model="suffix"
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
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="form.password" placeholder="密码" type="password" autocomplete="off"></el-input>
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading">登录</el-button>
        </div>

        <!-- 注册表单 -->
        <div v-else>
          <el-input class="email-input" v-model="registerForm.email" type="text" placeholder="邮箱" autocomplete="off">
            <template #append>
              <div @click.stop="openSelect">
                <el-select
                    ref="mySelect"
                    v-model="suffix"
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
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.password" placeholder="密码" type="password" autocomplete="off" />
          <el-input v-model="registerForm.confirmPassword" placeholder="确认密码" type="password" autocomplete="off" />
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
          ></div>
          <el-button class="btn" type="primary" @click="submitRegister" :loading="registerLoading">注册</el-button>
        </div>

        <!-- 切换登录/注册按钮 -->
        <div class="switch" @click="show = 'register'" v-if="show === 'login'">还有没有账号? <span>创建账号</span></div>
        <div class="switch" @click="show = 'login'" v-else>已有账号? <span>去登录</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 引入原有依赖（保持不变）
import router from "@/router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {ElMessage} from 'element-plus'
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/utils/perm.js";

// 状态变量（保持不变）
const accountStore = useAccountStore();
const userStore = useUserStore();
const settingStore = useSettingStore();
const loginLoading = ref(false);
const show = ref('login');
const form = reactive({ email: '', password: '' });
const mySelect = ref();
const suffix = ref('');
const registerForm = reactive({ email: '', password: '', confirmPassword: '' });
const domainList = settingStore.domainList;
const registerLoading = ref(false);
suffix.value = domainList[0];
const verifyShow = ref(false);
let verifyToken = '';
let turnstileId = '';

// 验证码回调（保持不变）
window.onTurnstileSuccess = (token) => {
  verifyToken = token;
  setTimeout(() => {
    verifyShow.value = false;
  }, 2000);
};

// 打开邮箱后缀选择框（保持不变）
const openSelect = () => {
  mySelect.value.toggleMenu();
};

// 登录逻辑（保持不变）
const submit = () => {
  if (!form.email) {
    ElMessage({ message: '邮箱不能为空', type: 'error', plain: true });
    return;
  }
  if (!isEmail(form.email + suffix.value)) {
    ElMessage({ message: '输入的邮箱不合法', type: 'error', plain: true });
    return;
  }
  if (!form.password) {
    ElMessage({ message: '密码不能为空', type: 'error', plain: true });
    return;
  }
  loginLoading.value = true;
  login(form.email + suffix.value, form.password).then(async (data) => {
    localStorage.setItem('token', data.token);
    const user = await loginUserInfo();
    accountStore.currentAccountId = user.accountId;
    userStore.user = user;
    const routers = permsToRouter(user.permKeys);
    routers.forEach((routerData) => {
      router.addRoute('layout', routerData);
    });
    await router.replace({ name: 'layout' });
  }).finally(() => {
    loginLoading.value = false;
  });
};

// 注册逻辑（保持不变）
function submitRegister() {
  if (!registerForm.email) {
    ElMessage({ message: '邮箱不能为空', type: 'error', plain: true });
    return;
  }
  if (!isEmail(registerForm.email + suffix.value)) {
    ElMessage({ message: '输入的邮箱不合法', type: 'error', plain: true });
    return;
  }
  if (!registerForm.password) {
    ElMessage({ message: '密码不能为空', type: 'error', plain: true });
    return;
  }
  if (registerForm.password.length < 6) {
    ElMessage({ message: '密码最少六位', type: 'error', plain: true });
    return;
  }
  if (registerForm.password !== registerForm.confirmPassword) {
    ElMessage({ message: '两次密码输入不一致', type: 'error', plain: true });
    return;
  }
  if (!verifyToken && settingStore.settings.registerVerify === 0) {
    verifyShow.value = true;
    if (!turnstileId) {
      nextTick(() => {
        turnstileId = window.turnstile.render('.register-turnstile');
      });
    } else {
      nextTick(() => {
        window.turnstile.reset(turnstileId);
      });
    }
    return;
  }
  registerLoading.value = true;
  register({ email: registerForm.email + suffix.value, password: registerForm.password, token: verifyToken }).then(() => {
    show.value = 'login';
    registerForm.email = '';
    registerForm.password = '';
    registerForm.confirmPassword = '';
    registerLoading.value = false;
    verifyToken = '';
    ElMessage({ message: '注册成功', type: 'success', plain: true });
  }).catch((res) => {
    if (res.code === 400) {
      verifyToken = '';
      window.turnstile.reset(turnstileId);
      verifyShow.value = true;
    }
    registerLoading.value = false;
  });
}

// 背景图片路径（可直接修改此处测试）
const BACKGROUND_IMAGE_URL = 'https://wwwaaa123122.cn-nb1.rains3.com/img/Image_1748831276428.png';
</script>


<style>
/* 全局样式重置（避免外部样式干扰） */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 静态背景样式（强制覆盖所有层级） */
.static-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw; /* 视口宽度 */
  height: 100vh; /* 视口高度 */
  background-image: url('https://wwwaaa123122.cn-nb1.rains3.com/img/Image_1748831276428.png');
  background-repeat: no-repeat;
  background-size: cover; /* 覆盖整个容器，可能裁剪图片 */
  /* background-size: contain; 不裁剪，完整显示图片 */
  background-position: center center;
  z-index: -999; /* 确保在所有内容下方 */
  opacity: 1; /* 透明度100% */

  /* 调试用边框（若背景未显示，取消注释可看到红色边框） */
  /* border: 5px solid red; */
  /* outline: 5px solid blue; */
}

/* 原登录盒子样式调整（移除默认背景） */
#login-box {
  background: transparent !important; /* 强制透明 */
  min-height: 100vh; /* 确保内容撑满视口 */
}

/* 彻底移除动态背景相关元素 */
#background-wrap,
.cloud {
  display: none !important; /* 强制隐藏 */
  visibility: hidden !important;
}

/* 表单容器样式（保持不变） */
.form-wrapper {
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 767px) {
    width: 100%;
  }
}

/* 其他表单样式（保持不变） */
.container {
  background: v-bind(loginOpacity);
  padding-left: 40px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: 100%;
  border: 1px solid #e4e7ed;
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    border-radius: 6px;
    width: 384px;
    margin-left: 18px;
  }
  @media (max-width: 767px) {
    padding: 20px 18px;
    border-radius: 6px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }
  /* 省略重复的表单内样式... */
}
</style>
          >登录
          </el-button>
        </div>
        <div v-else>
          <el-input class="email-input" v-model="registerForm.email" type="text" placeholder="邮箱" autocomplete="off">
            <template #append>
              <div @click.stop="openSelect">
                <el-select
                    ref="mySelect"
                    v-model="suffix"
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
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.password" placeholder="密码" type="password" autocomplete="off" />
          <el-input v-model="registerForm.confirmPassword" placeholder="确认密码" type="password" autocomplete="off" />
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
          ></div>
          <el-button class="btn" type="primary" @click="submitRegister" :loading="registerLoading"
          >注册
          </el-button>
        </div>
        <div class="switch" @click="show = 'register'" v-if="show === 'login'">还有没有账号? <span>创建账号</span></div>
        <div class="switch" @click="show = 'login'" v-else>已有账号? <span>去登录</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {ElMessage} from 'element-plus'
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/utils/perm.js";

const accountStore = useAccountStore();
const userStore = useUserStore();
const settingStore = useSettingStore();
const loginLoading = ref(false)
const show = ref('login')
const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: ''
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = ''


window.onTurnstileSuccess = (token) => {
  verifyToken = token;
  setTimeout(() => {
    verifyShow.value = false
  }, 2000)
};

// 新增静态背景样式
const background = {
  backgroundImage: `url(https://wwwaaa123122.cn-nb1.rains3.com/img/Image_1748831276428.png)`,
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  width: '100%',
  height: '100vh',
  position: 'fixed',
  zIndex: '-1',
  overflow: 'hidden'
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}


const submit = () => {

  if (!form.email) {
    ElMessage({
      message: '邮箱不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(form.email + suffix.value)) {
    ElMessage({
      message: '输入的邮箱不合法',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: '密码不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  loginLoading.value = true
  login(form.email + suffix.value, form.password).then(async data => {
    localStorage.setItem('token', data.token)
    const user = await loginUserInfo();
    accountStore.currentAccountId = user.accountId;
    userStore.user = user;
    const routers = permsToRouter(user.permKeys);
    routers.forEach(routerData => {
      router.addRoute('layout', routerData);
    });
    await router.replace({name: 'layout'})
  }).finally(() => {
    loginLoading.value = false
  })
}


function submitRegister() {

  if (!registerForm.email) {
    ElMessage({
      message: '邮箱不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(registerForm.email + suffix.value)) {
    ElMessage({
      message: '输入的邮箱不合法',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!registerForm.password) {
    ElMessage({
      message: '密码不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password.length < 6) {
    ElMessage({
      message: '密码最少六位',
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    ElMessage({
      message: '两次密码输入不一致',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!verifyToken && settingStore.settings.registerVerify === 0) {
    verifyShow.value = true
    if (!turnstileId) {
      nextTick(() => {
        turnstileId = window.turnstile.render('.register-turnstile')
      })
    } else {
      nextTick(() => {
        window.turnstile.reset(turnstileId);
      })
    }
    return;
  }

  registerLoading.value = true
  register({email: registerForm.email + suffix.value, password: registerForm.password, token: verifyToken}).then(() => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerLoading.value = false
    verifyToken = ''
    ElMessage({
      message: '注册成功',
      type: 'success',
      plain: true,
    })
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      window.turnstile.reset(turnstileId)
      verifyShow.value = true
    }
    registerLoading.value = false
  });
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
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 767px) {
    width: 100%;
  }
}

.container {
  background: v-bind(loginOpacity);
  padding-left: 40px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: 100%;
  border: 1px solid #e4e7ed;
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    border-radius: 6px;
    width: 384px;
    margin-left: 18px;
  }
  @media (max-width: 767px) {
    padding: 20px 18px;
    border-radius: 6px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }
  .btn {
    height: 36px;
    width: 100%;
    border-radius: 6px;
  }

  .form-desc {
    margin-top: 5px;
    margin-bottom: 18px;
    color: #71717a;
  }

  .form-title {
    font-weight: bold;
    font-size: 22px !important;
  }

  .switch {
    margin-top: 20px;
    text-align: center;
    span {
      color: #006be6;
      cursor: pointer;
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
  }

  .email-input :deep(.el-input__wrapper){
    border-radius: 6px 0 0 6px;
  }

  .el-input {
    height: 38px;
    width: 100%;
    margin-bottom: 18px;
    :deep(.el-input__inner) {
      height: 36px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  padding-right: 4px !important;
  background: #FFFFFF;
  border-radius: 0 8px 8px 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 6px;
  width: 180px;
}



#login-box {
  color: #333;
  font: 100% Arial, sans-serif;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
  background: none; /* 清除原渐变背景 */
}


#background-wrap {
  display: none; /* 隐藏原动态背景容器 */
}

@keyframes animateCloud {
  0% {
    margin-left: -500px;
  }

  100% {
    margin-left: 100%;
  }
}

.x1 {
  animation: animateCloud 30s linear infinite;
  transform: scale(0.65);
}

.x2 {
  animation: animateCloud 15s linear infinite;
  transform: scale(0.3);
}

.x3 {
  animation: animateCloud 25s linear infinite;
  transform: scale(0.5);
}

.x4 {
  animation: animateCloud 13s linear infinite;
  transform: scale(0.4);
}

.x5 {
  animation: animateCloud 20s linear infinite;
  transform: scale(0.55);
}

.cloud {
  background: linear-gradient(to bottom, #fff 5%, #f1f1f1 100%);
  border-radius: 100px;
  box-shadow: 0 8px 5px rgba(0, 0, 0, 0.1);
  height: 120px;
  width: 350px;
  position: relative;
}

.cloud:after,
.cloud:before {
  content: "";
  position: absolute;
  background: #fff;
  z-index: -1;
}

.cloud:after {
  border-radius: 100px;
  height: 100px;
  left: 50px;
  top: -50px;
  width: 100px;
}

.cloud:before {
  border-radius: 200px;
  height: 180px;
  width: 180px;
  right: 50px;
  top: -90px;
}

</style>
                </div>
              </template>
            </el-input>
            <el-input v-model="form.password" placeholder="密码" type="password" autocomplete="off">
            </el-input>
            <el-button class="btn" type="primary" @click="submit" :loading="loginLoading"
            >登录
            </el-button>
          </div>
          <div v-else>
            <el-input class="email-input" v-model="registerForm.email" type="text" placeholder="邮箱" autocomplete="off">
              <template #append>
                <div @click.stop="openSelect">
                  <el-select
                      ref="mySelect"
                      v-model="suffix"
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
                    <span>{{ suffix }}</span>
                    <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                  </div>
                </div>
              </template>
            </el-input>
            <el-input v-model="registerForm.password" placeholder="密码" type="password" autocomplete="off" />
            <el-input v-model="registerForm.confirmPassword" placeholder="确认密码" type="password" autocomplete="off" />
            <div v-show="verifyShow"
                class="register-turnstile"
                :data-sitekey="settingStore.settings.siteKey"
                data-callback="onTurnstileSuccess"
            ></div>
            <el-button class="btn" type="primary" @click="submitRegister" :loading="registerLoading"
            >注册
            </el-button>
          </div>
          <div class="switch" @click="show = 'register'" v-if="show === 'login'">还有没有账号? <span>创建账号</span></div>
          <div class="switch" @click="show = 'login'" v-else>已有账号? <span>去登录</span></div>
        </div>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {ElMessage} from 'element-plus'
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/utils/perm.js";

const accountStore = useAccountStore();
const userStore = useUserStore();
const settingStore = useSettingStore();
const loginLoading = ref(false)
const show = ref('login')
const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: ''
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = ''


window.onTurnstileSuccess = (token) => {
  verifyToken = token;
  setTimeout(() => {
    verifyShow.value = false
  }, 2000)
};


const loginOpacity = computed(() => {
  return `rgba(255, 255, 255, ${settingStore.settings.loginOpacity})`
})

const background = computed(() => {

  return settingStore.settings.background ? {
    'background-image': `url(${cvtR2Url(settingStore.settings.background)})`,
    'background-repeat': 'no-repeat',
    'background-size': 'cover',
    'background-position': 'center'
  } : ''
})


const openSelect = () => {
  mySelect.value.toggleMenu()
}


const submit = () => {

  if (!form.email) {
    ElMessage({
      message: '邮箱不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(form.email + suffix.value)) {
    ElMessage({
      message: '输入的邮箱不合法',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: '密码不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  loginLoading.value = true
  login(form.email + suffix.value, form.password).then(async data => {
    localStorage.setItem('token', data.token)
    const user = await loginUserInfo();
    accountStore.currentAccountId = user.accountId;
    userStore.user = user;
    const routers = permsToRouter(user.permKeys);
    routers.forEach(routerData => {
      router.addRoute('layout', routerData);
    });
    await router.replace({name: 'layout'})
  }).finally(() => {
    loginLoading.value = false
  })
}


function submitRegister() {

  if (!registerForm.email) {
    ElMessage({
      message: '邮箱不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(registerForm.email + suffix.value)) {
    ElMessage({
      message: '输入的邮箱不合法',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!registerForm.password) {
    ElMessage({
      message: '密码不能为空',
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password.length < 6) {
    ElMessage({
      message: '密码最少六位',
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    ElMessage({
      message: '两次密码输入不一致',
      type: 'error',
      plain: true,
    })
    return
  }

  if (!verifyToken && settingStore.settings.registerVerify === 0) {
    verifyShow.value = true
    if (!turnstileId) {
      nextTick(() => {
        turnstileId = window.turnstile.render('.register-turnstile')
      })
    } else {
      nextTick(() => {
        window.turnstile.reset(turnstileId);
      })
    }
    return;
  }

  registerLoading.value = true
  register({email: registerForm.email + suffix.value, password: registerForm.password, token: verifyToken}).then(() => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerLoading.value = false
    verifyToken = ''
    ElMessage({
      message: '注册成功',
      type: 'success',
      plain: true,
    })
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      window.turnstile.reset(turnstileId)
      verifyShow.value = true
    }
    registerLoading.value = false
  });
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
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 767px) {
    width: 100%;
  }
}

.container {
  background: v-bind(loginOpacity);
  padding-left: 40px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: 100%;
  border: 1px solid #e4e7ed;
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    border-radius: 6px;
    width: 384px;
    margin-left: 18px;
  }
  @media (max-width: 767px) {
    padding: 20px 18px;
    border-radius: 6px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }
  .btn {
    height: 36px;
    width: 100%;
    border-radius: 6px;
  }

  .form-desc {
    margin-top: 5px;
    margin-bottom: 18px;
    color: #71717a;
  }

  .form-title {
    font-weight: bold;
    font-size: 22px !important;
  }

  .switch {
    margin-top: 20px;
    text-align: center;
    span {
      color: #006be6;
      cursor: pointer;
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
  }

  .email-input :deep(.el-input__wrapper){
    border-radius: 6px 0 0 6px;
  }

  .el-input {
    height: 38px;
    width: 100%;
    margin-bottom: 18px;
    :deep(.el-input__inner) {
      height: 36px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  padding-right: 4px !important;
  background: #FFFFFF;
  border-radius: 0 8px 8px 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 6px;
  width: 180px;
}



#login-box {
  background: linear-gradient(to bottom, #2980b9, #6dd5fa, #fff);
  color: #333;
  font: 100% Arial, sans-serif;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
}


#background-wrap {
  height: 100%;
  z-index: 0;
}

@keyframes animateCloud {
  0% {
    margin-left: -500px;
  }

  100% {
    margin-left: 100%;
  }
}

.x1 {
  animation: animateCloud 30s linear infinite;
  transform: scale(0.65);
}

.x2 {
  animation: animateCloud 15s linear infinite;
  transform: scale(0.3);
}

.x3 {
  animation: animateCloud 25s linear infinite;
  transform: scale(0.5);
}

.x4 {
  animation: animateCloud 13s linear infinite;
  transform: scale(0.4);
}

.x5 {
  animation: animateCloud 20s linear infinite;
  transform: scale(0.55);
}

.cloud {
  background: linear-gradient(to bottom, #fff 5%, #f1f1f1 100%);
  border-radius: 100px;
  box-shadow: 0 8px 5px rgba(0, 0, 0, 0.1);
  height: 120px;
  width: 350px;
  position: relative;
}

.cloud:after,
.cloud:before {
  content: "";
  position: absolute;
  background: #fff;
  z-index: -1;
}

.cloud:after {
  border-radius: 100px;
  height: 100px;
  left: 50px;
  top: -50px;
  width: 100px;
}

.cloud:before {
  border-radius: 200px;
  height: 180px;
  width: 180px;
  right: 50px;
  top: -90px;
}

</style>
