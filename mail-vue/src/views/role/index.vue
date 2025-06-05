<template>
  <div class="perm-box">
    <div class="header-actions">
      <Icon class="icon" icon="ion:add-outline" width="23" height="23"  @click="openAddRole" />
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh" />
    </div>
    <div class="loading" v-if="tableLoading">
      <loading/>
    </div>
    <el-scrollbar v-else class="perm-scrollbar">
      <div>
        <el-table
            :data="roles"
            style="width: 100%;"
        >
          <el-table-column  width="10" />
          <el-table-column label="身份名称" prop="name" :min-width="roleWidth">
            <template #default="props">
              <div class="role-name">
                <span >{{props.row.name}}</span>
                <span v-if="props.row.isDefault"><el-tag class="def-tag" type="success">默认</el-tag></span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="排序" :width="sortWidth" prop="sort"/>
          <el-table-column v-if="desShow" label="描述" min-width="200" prop="description" >
            <template #default="props">
              <div class="description">
                <span >{{props.row.description}}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="settingWidth">
            <template #default="props">
              <el-dropdown trigger="click">
                <el-button size="small" type="primary">操作</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openRoleSet(props.row)">修改</el-dropdown-item>
                    <el-dropdown-item @click="setDef(props.row)">默认</el-dropdown-item>
                    <el-dropdown-item @click="delRole(props.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-scrollbar>
    <el-dialog class="dialog" v-model="roleFormShow" :title="dialogType.title" @closed="resetForm">
      <div class="dialog-box">
        <el-input class="dialog-input" v-model="form.name" type="text" :maxlength="12" placeholder="身份名称" autocomplete="off" />
        <el-input class="dialog-input" v-model="form.description" :maxlength="30" type="text" placeholder="描述" autocomplete="off" />
        <div class="dialog-input">
          <el-input-number placeholder="排序" :min="0" :max="9999" v-model.number="form.sort" controls-position="right" autocomplete="off" />
        </div>
        <el-segmented size="small" class="perm-expand" @change="expandChange" v-model="expand" :options="options" />
        <el-tree
            :expand-on-click-node="false"
            :check-on-click-node="false"
            ref="tree"
            :data="treeList"
            show-checkbox
            node-key="permId"
            :default-expand-all="expand"
            :props="{
              label: 'name'
            }"
        >
          <template #default="{ node, data }">
            <div>
              <span>{{node.label}}</span>
              <span class="send-num" v-if="data.permKey === 'email:send'" @click.stop>
                <el-input-number  v-model="form.sendCount" controls-position="right" :min="0" :max="99999" size="small" placeholder="数量" >
                </el-input-number>
                  <el-select v-model="form.sendType" placeholder="Select" size="small" style="width: 60px;margin-left: 5px;">
                    <el-option label="总数" value="count" />
                    <el-option label="每天" value="day" />
                  </el-select>
              </span>
              <span class="send-num" v-if="data.permKey === 'account:add'" @click.stop>
                <el-input-number  v-model="form.accountCount" controls-position="right" :min="0" :max="99999" size="small" placeholder="数量" >
                </el-input-number>
              </span>
            </div>
          </template>
        </el-tree>
        <el-button class="btn" type="primary" :loading="permLoading" @click="roleFormClick"
        >保存
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {defineOptions, nextTick, reactive, ref} from "vue";
import {roleAdd, roleDelete, rolePermTree, roleRoleList, roleSet, roleSetDef} from "@/request/role.js";
import {ElMessage, ElMessageBox} from "element-plus";
import loading from '@/components/loading/index.vue';
import {useRoleStore} from "@/store/role.js";

defineOptions({
  name: 'role'
})

const roleStore = useRoleStore();
const roleFormShow = ref(false)
const treeList = reactive([])
const roles = ref([])
const tree = ref({})
const permLoading = ref(false)
const tableLoading = ref(false)
const desShow = ref(true)
const settingWidth = ref(null)
const sortWidth = ref(null)
const roleWidth = ref(200)

const dialogType = reactive({
  title: '',
  type: ''
})

const form = reactive({
  name: null,
  description: null,
  sendType: 'count',
  sendCount: '',
  accountCount: '',
  sort: 0,
  isDefault: 0,
})

const expand = ref(false)

const options = [{ label: '展开',value: true }, { label:'收起',value: false}]

let chooseRole = {}

refresh()

rolePermTree().then(tree => {
  treeList.push(...tree)
})

function roleFormClick() {
  if (dialogType.type === 'add') {
    addRole()
  } else {
    setRole()
  }
}

function setDef(role) {
  roleSetDef(role.roleId).then(() => {
    ElMessage({
      message: "设置成功",
      type: "success",
      plain: true
    })
    getRoleList()
  })
}

function delRole(role) {
  ElMessageBox.confirm(`确认删除 ${role.name} 吗?`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    roleDelete(role.roleId).then(() => {
      ElMessage({
        message: "删除成功",
        type: "success",
        plain: true
      })
      getRoleList()
      roleStore.refreshSelect()
    })
  });
}

function expandChange(e) {
  if (e) {
    const nodes = tree.value?.store.nodesMap;
    for (const key in nodes) {
      nodes[key].expanded = true;
    }
  } else {
    const nodes = tree.value?.store.nodesMap;
    for (const key in nodes) {
      nodes[key].expanded = false;
    }
  }

}

function setRole() {

  if (!form.name) {
    ElMessage({
      message: "身份名不能为空",
      type: "error",
      plain: true
    })
    return
  }

  const params = {...form,roleId: chooseRole.roleId}
  const checkedId = tree.value.getCheckedKeys()
  const halfId = tree.value.getHalfCheckedKeys()
  params.permIds = [...checkedId, ...halfId]

  permLoading.value = true
  roleSet(params).then(() => {
    ElMessage({
      message: "修改成功",
      type: "success",
      plain: true
    })
    roleFormShow.value = false
    getRoleList()
  }).finally(() => {
    permLoading.value = false
  })
}

function resetForm() {
  form.name = null
  form.description = null
  form.sort = 0
  form.sendType = 'count'
  form.sendCount = ''
  form.accountCount = ''
  tree.value.setCheckedKeys([])
}

function openRoleSet(role) {
  chooseRole = role
  dialogType.title = '修改身份'
  dialogType.type = 'set'
  roleFormShow.value = true
  form.sort = role.sort
  form.name = role.name
  form.description = role.description
  form.sendType = role.sendType
  form.sendCount = role.sendCount
  form.accountCount = role.accountCount
  nextTick(() => {
    tree.value.setCheckedKeys(role.permIds)
  })
}


function openAddRole() {
  dialogType.title = '添加身份'
  dialogType.type = 'add'
  roleFormShow.value = true
}

function addRole() {
  const params = {...form}
  const checkedId = tree.value.getCheckedKeys()
  const halfId = tree.value.getHalfCheckedKeys()
  params.permIds = [...checkedId, ...halfId]

  permLoading.value = true
  roleAdd(params).then(() => {
    ElMessage({
      message: "添加成功",
      type: "success",
      plain: true
    })
    roleFormShow.value = false
    getRoleList()
    roleStore.refreshSelect()
  }).finally(() => {
    permLoading.value = false
  })
}


function refresh() {
  tableLoading.value = true
  roles.length = 0
  getRoleList()
}

function getRoleList() {
  roleRoleList().then(list => {
    roles.value = list
  }).finally(() => {
    tableLoading.value = false
  })
}

function adjustWidth() {
  desShow.value = window.innerWidth > 767
  settingWidth.value = window.innerWidth < 480 ? 75 : null
  sortWidth.value = window.innerWidth < 480 ? 75 : null
  roleWidth.value = window.innerWidth < 480 ? 180 : 200
}

adjustWidth()

window.onresize = () => {
  adjustWidth()
};


</script>
<style scoped lang="scss">

.perm-box {
  height: 100%;
  overflow: hidden;
  width: 100%;
  .perm-scrollbar {
    height: 100%;
  }
}

.send-num {
  margin-left: 10px;
  .el-input-number {
    width: 95px;
  }
}

.def-tag {
  margin-left: 10px;
  height: 20px;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);
  font-size: 18px;
  .search {
    :deep(.el-input-group) {
      height: 28px;
    }
    :deep(.el-input__inner) {
      height: 28px;
    }
  }
  .icon {
    cursor: pointer;
  }
}

:deep(.description) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.role-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.description {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}


:deep(.el-segmented--small .el-segmented__item) {
  border-radius: 8px !important;
  overflow: hidden;
}

.dialog-box {
  .dialog-input {
    margin-bottom: 15px !important;
  }
}

.perm-expand  {
  margin-bottom: 10px;
  --el-border-radius-base: 8px;
}

:deep(.el-dialog) {
  margin-top: 15vh !important;
  margin-bottom: 20px !important;
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;

  }
}
.btn {
  width: 100%;
  margin-top: 15px;
}
</style>