<template>
  <div class="percent">
    <Icon icon="line-md:loading-loop" width="18" height="18" />
    <div>
      <span>{{value}}%</span>
      <span style="margin-left: 5px">{{desc}}</span>
    </div>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
defineProps({
  value: [Number,String],
  desc: [String]
})
</script>

<style scoped lang="scss">
.percent {
  display: flex;
  gap: 10px;
}
</style>