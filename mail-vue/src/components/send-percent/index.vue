<template>
  <div class="percent">
    <Icon icon="line-md:loading-loop" width="18" height="18" />
    <div>
      <span>{{value}}%</span>
      <span style="margin-left: 5px">邮件正在发送中</span>
    </div>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";

defineProps({
  value: [Number,String]
})
</script>

<style scoped lang="scss">
.percent {
  display: flex;
  gap: 10px;
}
</style>