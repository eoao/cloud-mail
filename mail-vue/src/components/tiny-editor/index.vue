<template>
  <div class="editor-box" :class="showLoading ? 'editor-box-loading' : ''">
    <loading class="loading" v-if="showLoading" />
    <textarea v-else style="outline: none" :id="editorId" ref="editorRef"></textarea>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, watch} from 'vue';
import loading from "@/components/loading/index.vue";
import {compressImage} from "@/utils/file-utils.js";
defineExpose({
  clearEditor
})

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: () => `editor-${Date.now()}`
  }
});


const emit = defineEmits(['change']);
const editor = ref(null);
const isInitialized = ref(false);
const editorRef = ref(null);
const showLoading = ref(false);

onMounted(() => {
  initTinyMCE();
});

onBeforeUnmount(() => {
  destroyEditor();
});

watch(() => props.modelValue, (newValue) => {
  if (editor.value && editor.value.getContent() !== newValue) {
    editor.value.setContent(newValue);
  }
});

function clearEditor() {
  if (editor.value) {
    editor.value.setContent('');
  }
}

function initTinyMCE() {
  if (window.tinymce) {
    initEditor();
  } else {
    showLoading.value = true;
    const script = document.createElement('script');
    script.src = '/tinymce/tinymce.min.js';
    script.onload = () => initEditor();
    document.head.appendChild(script);
    showLoading.value = false;
  }
}

function initEditor() {
  window.tinymce.init({
    selector: `#${props.editorId}`,
    statusbar: false,
    height: "100%",
    plugins: 'link image advlist lists  emoticons fullscreen  table preview code',
    toolbar: 'bold emoticons forecolor fontsize | alignleft aligncenter alignright alignjustify | outdent indent |  bullist numlist | link image  | table code preview fullscreen',
    toolbar_mode: 'scrolling',
    mobile: {
      toolbar: 'fullscreen bold emoticons forecolor fontsize | alignleft aligncenter alignright alignjustify | outdent indent |  bullist numlist | link image  | table code preview ',
    },
    emoticons_search: false,
    language: 'zh_CN',
    language_url: '/tinymce/langs/zh_CN.js',
    menubar: false,
    license_key: 'gpl',
    content_style: " .tox-dialog__body-content  { margin: 0 !important; } img { max-width: 100%; height: auto; }",
    setup: (ed) => {
      editor.value = ed;
      ed.on('init', () => {
        ed.setContent(props.modelValue);
        isInitialized.value = true;
      });
      ed.on('input change', () => {
        const content = ed.getContent();
        const text = ed.getContent({ format: 'text' });
        emit('change', content, text);
      });
    },
    branding: false,
    file_picker_types: 'image',
    image_dimensions: false,
    image_description: false,
    link_title: false,
    dialog_type: 'none',
    file_picker_callback:  (callback, value, meta) => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');

      input.addEventListener('change', async (e) => {
        let file = e.target.files[0];
        file = await compressImage(file);
        const reader = new FileReader();
        reader.onload = () => {
          const id = 'blobid' + (new Date()).getTime();
          const blobCache =  tinymce.activeEditor.editorUpload.blobCache;
          const base64 = reader.result.split(',')[1];
          const blobInfo = blobCache.create(id, file, base64);
          blobCache.add(blobInfo);

          callback(blobInfo.blobUri(), { title: file.name });
        }
        reader.readAsDataURL(file);
      });

      input.click();
    }
  });
}


function destroyEditor() {
  if (editor.value) {
    editor.value.destroy();
    editor.value = null;
  }
}
</script>

<style lang="scss" scoped>
.editor-box {
  height: 100%;
  width: 100%;
}

.loading {
  margin: auto;
}

.editor-box-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke) {
  width: 80px !important;
}

:deep(.tox.tox-tinymce.tox-fullscreen) {
  padding-right: 15px;
  padding-left: 15px;
  padding-bottom: 15px;
  background: #FFFFFF;
}

:deep(.tox-tinymce) {
  border: none;
  border-radius: 0;
}

:deep(.tox-toolbar__group) {
  padding-left: 0 !important;
  margin: 0 !important;
}

:deep(.tox-tbtn) {
  margin: 0 !important;
}

</style>