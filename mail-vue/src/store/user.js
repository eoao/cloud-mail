import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
    }),
    actions: {
        refreshUserInfo() {
            loginUserInfo().then(user => {
                this.user = user
            })
        }
    }
})