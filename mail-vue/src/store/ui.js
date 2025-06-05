import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 1024,
        accountShow: false,
        backgroundLoading: true,
        writerRef: null,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    persist: {
        pick: ['accountShow'],
    },
})