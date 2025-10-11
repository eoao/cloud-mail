import { defineStore } from 'pinia'

export const useSendStore = defineStore('send', {
    state: () => ({
        deleteId: 0
    })
})
