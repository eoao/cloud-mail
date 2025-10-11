import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
        refreshList: 0,
    }),
    actions: {
        refreshUserList() {
            loginUserInfo().then(user => {
                this.refreshList ++
            })
        },
        refreshUserInfo() {
            loginUserInfo().then(user => {
                this.user = user
            })
        }
    }
})