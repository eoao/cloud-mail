import { defineStore } from 'pinia'

export const userDraftStore = defineStore('draft', {
    state: () => ({
        refreshList: 0,
        setDraft: {},
    })
})