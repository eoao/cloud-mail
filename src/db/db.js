import Dexie from "dexie";
import {useUserStore} from "@/store/user.js"
import { watch, shallowRef } from "vue";

const userStore = useUserStore();


let db =  shallowRef({})

function createDB() {
    db.value = new Dexie(userStore.user.email);
    db.value.version(1).stores({
        draft: '++draftId,createTime'
    })

    db.value.version(1).stores({
        att: 'draftId'
    })
}

createDB()

watch(() => userStore.user.email,() => createDB())

export default db;