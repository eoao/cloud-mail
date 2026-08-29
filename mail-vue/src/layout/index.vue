<template>
  <el-container class="layout">
    <el-aside
        class="aside"
        :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
      <Aside />
    </el-aside>
    <div
        :class="(uiStore.asideShow && isMobile)? 'overlay-show':'overlay-hide'"
        @click="uiStore.asideShow = false"
    ></div>
    <el-container class="main-container">
      <el-main>
        <el-header>
            <Header />
        </el-header>
        <Main />
      </el-main>
    </el-container>
  </el-container>
  <writer ref="writerRef" />

  <el-dialog v-model="shortcutsShow" :title="$t('shortcuts')" width="420">
    <div v-for="row in shortcutRows" :key="row.keys" class="shortcut-row">
      <kbd>{{ row.keys }}</kbd>
      <span>{{ $t(row.label) }}</span>
    </div>
  </el-dialog>
</template>

<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {useUiStore} from "@/store/ui.js";
import writer from '@/layout/write/index.vue'
import router from '@/router/index.js'
import {useShortcuts} from '@/composables/use-shortcuts.js'

const uiStore = useUiStore();
const shortcutsShow = ref(false)

const shortcutRows = [
  {keys: 'c', label: 'shortcutCompose'},
  {keys: '/', label: 'shortcutSearch'},
  {keys: 'i', label: 'shortcutInbox'},
  {keys: 'Esc', label: 'shortcutClose'},
  {keys: '?', label: 'shortcutHelp'}
]

useShortcuts({
  c: () => uiStore.writerRef?.value?.open?.(),
  // "/" is the near-universal focus-search binding; the inbox owns the input,
  // so the layout only asks it to focus.
  '/': () => document.querySelector('.search-wrap input')?.focus(),
  '?': () => (shortcutsShow.value = !shortcutsShow.value),
  i: () => router.push('/inbox')
})
const writerRef = ref({})
const isMobile = ref(window.innerWidth < 1025)
const handleResize = () => {
  isMobile.value = window.innerWidth < 1025
  uiStore.asideShow = window.innerWidth > 1024;
}

onMounted(() => {
  uiStore.writerRef = writerRef

  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 7px 0;

  kbd {
    min-width: 44px;
    text-align: center;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
    font-family: inherit;
    font-size: 12px;
    color: var(--el-text-color-regular);
  }

  span {
    color: var(--el-text-color-primary);
  }
}

.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: all 100ms ease;
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: all 100ms ease;
  z-index: 101;
  @media (max-width: 1025px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: auto;
  transition: all 100ms ease;
}

.layout {
  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
}

.main-container {
  min-height: 100%;
  background: var(--el-bg-color);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  padding: 0;
}

.el-header {
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--el-border-color);
  padding: 0 0 0 0;
}

.overlay-show {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  transition: all 0.3s;
}

.overlay-hide {
  display: flex;
  pointer-events: none;
  opacity: 0;
}
</style>
