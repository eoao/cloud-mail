<template>
  <el-icon class="is-loading" :style="{ fontSize: `${size}px` }">
    <svg class="circular" viewBox="0 0 20 20">
      <g
          class="path2 loading-path"
          stroke-width="0"
          style="animation: none; stroke: none"
      >
        <circle r="3.375" class="dot1" rx="0" ry="0" />
        <circle r="3.375" class="dot2" rx="0" ry="0" />
        <circle r="3.375" class="dot4" rx="0" ry="0" />
        <circle r="3.375" class="dot3" rx="0" ry="0" />
      </g>
    </svg>
  </el-icon>
</template>

<script>
export default {
  props: {
    size: {
      type: Number,
      default: 30
    }
  }
}
</script>

<style scoped>
.el-select-dropdown__loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(v-bind(size) * 3.33px);
  font-size: calc(v-bind(size) * 0.67px);
}

.circular {
  display: inline;
  height: v-bind(size) + 'px';
  width: v-bind(size) + 'px';
  animation: loading-rotate 2s linear infinite;
}
.path {
  animation: loading-dash 1.5s ease-in-out infinite;
  stroke-dasharray: 90, 150;
  stroke-dashoffset: 0;
  stroke-width: 2;
  stroke: var(--el-color-primary);
  stroke-linecap: round;
}
.loading-path .dot1 {
  transform: translate(3.75px, 3.75px);
  fill: var(--el-color-primary);
  animation: custom-spin-move 1s infinite linear alternate;
  opacity: 0.3;
}
.loading-path .dot2 {
  transform: translate(calc(100% - 3.75px), 3.75px);
  fill: var(--el-color-primary);
  animation: custom-spin-move 1s infinite linear alternate;
  opacity: 0.3;
  animation-delay: 0.4s;
}
.loading-path .dot3 {
  transform: translate(3.75px, calc(100% - 3.75px));
  fill: var(--el-color-primary);
  animation: custom-spin-move 1s infinite linear alternate;
  opacity: 0.3;
  animation-delay: 1.2s;
}
.loading-path .dot4 {
  transform: translate(calc(100% - 3.75px), calc(100% - 3.75px));
  fill: var(--el-color-primary);
  animation: custom-spin-move 1s infinite linear alternate;
  opacity: 0.3;
  animation-delay: 0.8s;
}
@keyframes loading-rotate {
  to {
    transform: rotate(360deg);
  }
}
@keyframes loading-dash {
  0% {
    stroke-dasharray: 1, 200;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -40px;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -120px;
  }
}
@keyframes custom-spin-move {
  to {
    opacity: 1;
  }
}

.is-loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
