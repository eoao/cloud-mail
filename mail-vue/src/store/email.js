import { defineStore } from 'pinia'

export const useEmailStore = defineStore('email', {
    state: () => ({
        deleteIds: 0,
        starScroll: null,
        emailScroll: null,
        contentData: {
            email: null,
            delType: null,
            showStar: true
        },
        sendScroll: null,
    }),
    persist: {
        pick: ['contentData'],
    },
})
