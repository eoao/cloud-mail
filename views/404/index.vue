<template>
<div class="box-404">
  <el-empty :image-size="isPhone ? 120 : 0" class="empty" :description="$t('error404')" >
    <el-button  type="primary" @click="router.replace({name: 'layout'})">{{$t('home')}}</el-button>
  </el-empty>
</div>
</template>

<script lang="js" setup>
import router from "@/router/index.js";

let isPhone = window.innerWidth < 1025
</script>

<style scoped lang="scss">
.box-404 {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>