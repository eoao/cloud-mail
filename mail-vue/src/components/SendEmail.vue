<template>
  <div class="email-form">
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>收件人</label>
        <input v-model="formData.to" type="email" required>
      </div>
      <div class="form-group">
        <label>主题</label>
        <input v-model="formData.subject" required>
      </div>
      <div class="form-group">
        <label>正文</label>
        <textarea v-model="formData.html" rows="5"></textarea>
      </div>
      <div class="form-group">
        <label>附件</label>
        <input type="file" multiple @change="handleFileUpload">
      </div>
      <button type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? '发送中...' : '立即发送' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { sendByResend } from '@/request/resend.js';

const formData = ref({
  to: '',
  subject: '',
  html: '',
  attachments: []
});

const isSubmitting = ref(false);

const handleFileUpload = (e) => {
  formData.value.attachments = Array.from(e.target.files);
};

const handleSubmit = async () => {
  try {
    isSubmitting.value = true;
    const form = new FormData();
    form.append('to', formData.value.to);
    form.append('subject', formData.value.subject);
    form.append('html', formData.value.html);
    formData.value.attachments.forEach(file => {
      form.append('attachments', file);
    });

    await sendByResend(form);
    alert('邮件发送成功！');
    formData.value = { /* 重置表单 */ };
  } catch (error) {
    console.error('发送失败:', error);
    alert('发送失败，请检查控制台');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<style scoped>
.email-form {
  max-width: 600px;
  margin: 2rem auto;
  padding: 1rem;
}
.form-group {
  margin-bottom: 1rem;
}
input, textarea {
  width: 100%;
  padding: 0.5rem;
}
button {
  background: #007bff;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
}
</style>