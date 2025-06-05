import { defineStore } from 'pinia'

export const useRoleStore = defineStore('role', {
    state: () => ({
        refresh: 0,
    }),
    actions: {
        refreshSelect() {
            this.refresh ++
        }
    }
})
