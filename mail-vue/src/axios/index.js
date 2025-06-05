import axios from "axios";
import router from "@/router";
import {ElMessage} from 'element-plus';

let http = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL
});

http.interceptors.request.use(config => {
    config.headers.Authorization = `${localStorage.getItem('token')}`
    return config
})

http.interceptors.response.use((res) => {

        return new Promise((resolve, reject) => {

            const showMsg = res.config.noMsg;
            const data = res.data

            if (showMsg) {

                data.code === 200 ? resolve(data.data) : reject(data)

            } else if (data.code === 401) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                })
                localStorage.removeItem('token')
                router.push('/login')
                reject(data)
            } else if (data.code === 403) {
                ElMessage({
                    message: data.message,
                    type: 'warning',
                    plain: true,
                })
                reject(data)
            } else if (data.code !== 200) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                })

                reject(data)
            }
            resolve(data.data)
        })
    },
    (error) => {

        const showMsg = error.config.noMsg;

        if (showMsg) {
            return Promise.reject(error)
        } else if (error.message.includes('Network Error')) {
            ElMessage({
                message: '网络错误,请检查网络连接',
                type: 'error',
                plain: true,
            })
        } else if (error.code === 'ECONNABORTED') {
            ElMessage({
                message: '请求超时,请稍后重试',
                type: 'error',
                plain: true,
            })
            ElMessage.error('')
        } else if (error.response) {
            ElMessage({
                message: `服务器繁忙`,
                type: 'error',
                plain: true,
            })
        } else {
            ElMessage({
                message: '请求失败,请稍后再试',
                type: 'error',
                plain: true,
            })
        }
        return Promise.reject(error)
    })

export default http


