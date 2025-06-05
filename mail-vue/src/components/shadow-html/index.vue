<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

// 确保字体在 Shadow DOM 中可用
function loadFontInShadow() {
  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: 'HarmonyOS';
      src: url('@/assets/fonts/HarmonyOS_Sans_SC_Regular.woff2') format('woff2');
      font-display: swap;
    }
  `
  document.head.appendChild(style)
}

function updateContent() {
  if (!shadowRoot) return

  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        display: block;
        width: 100%;
        height: 100%;
        font-family: 'HarmonyOS', -apple-system, BlinkMacSystemFont,
                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #13181D;
        overflow-wrap: break-word;
      }

      .shadow-content {
        width: fit-content;
        height: fit-content;
        min-width: 100%;
      }

      img {
        max-width: 100%;
        height: auto !important;
        display: block;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
      }

      a {
        color: #409EFF !important;
      }

    </style>
    <div class="shadow-content">
      ${props.html}
    </div>
  `
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const parentHeight = parent.offsetHeight

  const childWidth = shadowContent.scrollWidth
  const childHeight = shadowContent.scrollHeight

  if (childWidth === 0 || childHeight === 0) return

  const scaleX = parentWidth / childWidth
  const scaleY = parentHeight / childHeight
  const scale = Math.min(scaleX, scaleY)

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  loadFontInShadow() // 预加载字体
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'HarmonyOS', -apple-system, BlinkMacSystemFont,
  'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>