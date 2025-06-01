import http from '@/axios/index.js';

export const sendByResend = (formData) => {
  return http.post('/resend/send', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${import.meta.env.VITE_RESEND_API_KEY}`
    }
  });
};

export const resendList = (params) => {
  return http.get('/resend/list', { params });
};