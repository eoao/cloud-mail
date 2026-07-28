<template>
  <div class="content-box">
    <iframe ref="iframe" class="content-iframe" sandbox="allow-same-origin" title="email-content" @load="onLoad" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const iframe = ref(null)

const purify = DOMPurify();

function buildSrcdoc(rawHtml) {
  let html = purify.sanitize(rawHtml, {
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    WHOLE_DOCUMENT: true,
  })

  const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i
  const bodyStyleMatch = html.match(bodyStyleRegex)
  // Aplicado como atributo inline, não dentro de um bloco CSS: o style do body
  // vem do email e pode conter chaves que escapariam da regra e injetariam CSS.
  const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1].replace(/["<>]/g, '') : ''
  html = html.replace(/<\/?body[^>]*>/gi, '')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      /* A altura acompanha o conteúdo; o iframe é redimensionado por JS para
         caber a mensagem inteira, evitando uma barra de rolagem aninhada. */
      overflow-x: auto;
      overflow-y: hidden;
      font-family: Inter, -apple-system, BlinkMacSystemFont,
                  'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #13181D;
      word-break: break-word;
    }
    h1, h2, h3, h4 {
      font-size: 18px;
      font-weight: 700;
    }
    p { margin: 0; }
    a {
      text-decoration: none;
      color: #0E70DF;
    }
    .shadow-content {
      background: #FFFFFF;
      width: fit-content;
      height: fit-content;
      min-width: 100%;
    }
    img:not(table img) {
      max-width: 100% !important;
      height: auto !important;
    }
  </style>
</head>
<body>
  <div class="shadow-content" style="${bodyStyle}">
    ${html}
  </div>
</body>
</html>`
}

function updateContent() {
  if (!iframe.value) return
  const srcdoc = buildSrcdoc(props.html)
  iframe.value.srcdoc = srcdoc
}

let resizeObserver = null

// Ajusta o iframe à altura real do conteúdo, para a mensagem ocupar todo o
// espaço disponível e a rolagem ficar por conta do container externo.
function syncHeight() {
  const el = iframe.value
  const doc = el?.contentDocument
  if (!doc) return

  const height = Math.max(
    doc.documentElement?.scrollHeight || 0,
    doc.body?.scrollHeight || 0
  )
  if (!height) return

  const next = height + 'px'
  if (el.style.height !== next) {
    el.style.height = next
  }
}

function onLoad() {
  const doc = iframe.value?.contentDocument
  if (!doc) return

  syncHeight()

  // Imagens do email só têm altura conhecida depois de carregarem.
  doc.querySelectorAll('img').forEach((img) => {
    if (!img.complete) {
      img.addEventListener('load', syncHeight, { once: true })
      img.addEventListener('error', syncHeight, { once: true })
    }
  })

  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(syncHeight)
  resizeObserver.observe(doc.documentElement)
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// O iframe só existe após a montagem, por isso a carga inicial acontece aqui.
// Um watch com immediate rodaria durante o setup, quando a ref ainda é null.
onMounted(updateContent)

watch(() => props.html, () => {
  updateContent()
})
</script>

<style scoped>
.content-box {
  width: 100%;
}

.content-iframe {
  width: 100%;
  border: none;
  display: block;
}
</style>
