<template>
  <el-scrollbar>
    <div class="scrollbar-flex-content">
      <p v-for="item in 1000" :key="item" class="scrollbar-demo-item">
        {{ item }}
      </p>
    </div>
  </el-scrollbar>
</template>

<style scoped>
.scrollbar-flex-content {
  display: grid;
  grid-template-columns: 200px 200px 200px 200px 200px 200px 200px 200px 200px 200px 200px;
  width: 40px;
}
.scrollbar-demo-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 50px;
  marngin-bottom: 10px;
  text-align: center;
  border-radius: 4px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
</style>