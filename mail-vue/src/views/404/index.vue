<script setup>
import router from "@/router/index.js";
</script>

<template>
<div class="box-404">
  <el-empty class="empty" description="404错误, 找不到页面" >
    <el-button type="primary" @click="router.replace({name: 'layout'})">返回首页</el-button>
  </el-empty>
</div>
</template>

<style scoped lang="scss">
.box-404 {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>