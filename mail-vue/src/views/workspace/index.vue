<template>
  <div class="ws-container">
    <el-tabs v-model="tab" class="ws-tabs">

      <!-- Contacts -->
      <el-tab-pane :label="$t('contacts')" name="contacts">
        <div class="ws-toolbar">
          <el-input v-model="contactKeyword" :placeholder="$t('searchPlaceholder')" clearable
                    style="max-width: 260px" @keyup.enter="loadContacts" @clear="loadContacts"/>
          <el-button :loading="loading" @click="loadContacts">{{ $t('search') }}</el-button>
          <el-button type="primary" @click="openContact()">{{ $t('add') }}</el-button>
        </div>

        <el-table :data="contacts" size="small" v-loading="loading">
          <el-table-column prop="name" :label="$t('username')" min-width="140" show-overflow-tooltip/>
          <el-table-column prop="email" :label="$t('emailAccount')" min-width="200" show-overflow-tooltip/>
          <el-table-column prop="company" :label="$t('contactCompany')" min-width="140" show-overflow-tooltip/>
          <el-table-column prop="groupName" :label="$t('contactGroup')" width="120" show-overflow-tooltip/>
          <el-table-column prop="useCount" :label="$t('contactUseCount')" width="100"/>
          <el-table-column width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="writeTo(row)">{{ $t('send') }}</el-button>
              <el-button size="small" type="primary" @click="openContact(row)">{{ $t('edit') }}</el-button>
              <el-button size="small" type="danger" @click="removeContact(row)">{{ $t('delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Calendar -->
      <el-tab-pane :label="$t('calendar')" name="calendar">
        <div class="ws-toolbar">
          <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD"
                          :start-placeholder="$t('searchSince')" :end-placeholder="$t('searchUntil')"
                          @change="loadEvents"/>
          <el-button :loading="loading" @click="loadEvents">{{ $t('refresh') }}</el-button>
        </div>

        <div v-if="!events.length" class="ws-empty">{{ $t('calendarEmpty') }}</div>

        <div v-for="event in events" :key="event.eventId" class="event"
             :class="event.status === 'cancelled' ? 'cancelled' : ''">
          <div class="event-when">
            <div class="event-date">{{ event.startAt?.slice(0, 10) }}</div>
            <div class="event-time">{{ event.allDay ? $t('calendarAllDay') : event.startAt?.slice(11, 16) }}</div>
          </div>
          <div class="event-body">
            <div class="event-title">
              {{ event.title }}
              <el-tag v-if="event.status === 'cancelled'" size="small" type="danger">{{ $t('calendarCancelled') }}</el-tag>
              <el-tag v-else-if="event.response" size="small" :type="responseTag(event.response)">
                {{ $t('calendar' + capitalize(event.response)) }}
              </el-tag>
            </div>
            <div class="event-meta">
              <span v-if="event.location">{{ event.location }}</span>
              <span v-if="event.organizer">{{ event.organizer }}</span>
              <span v-if="event.attendees?.length">{{ $t('calendarAttendees', {count: event.attendees.length}) }}</span>
            </div>
          </div>
          <div class="event-actions" v-if="event.status !== 'cancelled'">
            <el-button size="small" type="success" @click="respond(event, 'accepted')">{{ $t('calendarAccept') }}</el-button>
            <el-button size="small" @click="respond(event, 'tentative')">{{ $t('calendarTentative') }}</el-button>
            <el-button size="small" type="danger" @click="respond(event, 'declined')">{{ $t('calendarDecline') }}</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tasks -->
      <el-tab-pane :label="$t('tasks')" name="tasks">
        <div class="ws-toolbar">
          <el-input v-model="newTask" :placeholder="$t('taskPlaceholder')" style="max-width: 340px"
                    @keyup.enter="addTask"/>
          <el-date-picker v-model="newTaskDue" type="datetime" value-format="YYYY-MM-DD HH:mm:ss"
                          :placeholder="$t('taskDue')" style="width: 200px"/>
          <el-button type="primary" @click="addTask">{{ $t('add') }}</el-button>
          <el-checkbox v-model="showDone" @change="loadTasks">{{ $t('taskShowDone') }}</el-checkbox>
        </div>

        <div v-if="!tasks.length" class="ws-empty">{{ $t('taskEmpty') }}</div>

        <div v-for="item in tasks" :key="item.taskId" class="task" :class="item.done ? 'task-done' : ''">
          <el-checkbox :model-value="!!item.done" @change="toggleTask(item)"/>
          <div class="task-title">{{ item.title }}</div>
          <div class="task-due" v-if="item.dueAt" :class="overdue(item) ? 'overdue' : ''">
            {{ item.dueAt.slice(0, 16) }}
          </div>
          <el-button size="small" type="danger" @click="removeTask(item)">{{ $t('delete') }}</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="contactShow" :title="$t('contact')" width="440">
      <el-input v-model="contactForm.name" :placeholder="$t('username')" style="margin-bottom: 10px"/>
      <el-input v-model="contactForm.email" :placeholder="$t('emailAccount')" style="margin-bottom: 10px"/>
      <el-input v-model="contactForm.company" :placeholder="$t('contactCompany')" style="margin-bottom: 10px"/>
      <el-input v-model="contactForm.phone" :placeholder="$t('contactPhone')" style="margin-bottom: 10px"/>
      <el-input v-model="contactForm.groupName" :placeholder="$t('contactGroup')" style="margin-bottom: 10px"/>
      <el-input v-model="contactForm.notes" type="textarea" :rows="3" :placeholder="$t('description')"
                style="margin-bottom: 12px"/>
      <el-button type="primary" :loading="loading" @click="saveContact">{{ $t('save') }}</el-button>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, onMounted, reactive, ref} from "vue";
import {useI18n} from 'vue-i18n';
import {useUiStore} from "@/store/ui.js";
import {
  contactList, contactSet, contactDelete,
  calendarList, calendarRespond,
  taskList, taskSet, taskDelete
} from "@/request/contact.js";

defineOptions({
  name: 'workspace'
})

const {t} = useI18n()
const uiStore = useUiStore()

const tab = ref('contacts')
const loading = ref(false)
const contacts = ref([])
const contactKeyword = ref('')
const contactShow = ref(false)
const contactForm = reactive({contactId: null, name: '', email: '', company: '', phone: '', groupName: '', notes: ''})

const events = ref([])
const range = ref([])

const tasks = ref([])
const newTask = ref('')
const newTaskDue = ref('')
const showDone = ref(false)

const capitalize = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)

function responseTag(response) {
  return {accepted: 'success', declined: 'danger', tentative: 'warning'}[response] ?? 'info'
}

function overdue(item) {
  return !item.done && item.dueAt && item.dueAt < new Date().toISOString().slice(0, 19).replace('T', ' ')
}

// ---- contacts -----------------------------------------------------------

async function loadContacts() {
  loading.value = true
  try {
    contacts.value = await contactList({keyword: contactKeyword.value || undefined})
  } finally {
    loading.value = false
  }
}

function openContact(row) {
  Object.assign(contactForm, {
    contactId: row?.contactId ?? null,
    name: row?.name ?? '',
    email: row?.email ?? '',
    company: row?.company ?? '',
    phone: row?.phone ?? '',
    groupName: row?.groupName ?? '',
    notes: row?.notes ?? ''
  })
  contactShow.value = true
}

async function saveContact() {
  loading.value = true
  try {
    await contactSet({...contactForm})
    contactShow.value = false
    await loadContacts()
  } finally {
    loading.value = false
  }
}

async function removeContact(row) {
  await ElMessageBox.confirm(t('deleteConfirm'), {type: 'warning'})
  await contactDelete(row.contactId)
  await loadContacts()
}

// The writer is a global overlay owned by the layout, so it is reachable from
// any view through the ui store.
function writeTo(row) {
  const writer = uiStore.writerRef?.value
  if (!writer) return
  writer.open()
  writer.form ? (writer.form.receiveEmail = [row.email]) : null
}

// ---- calendar -----------------------------------------------------------

async function loadEvents() {
  loading.value = true
  try {
    const [since, until] = range.value ?? []
    events.value = await calendarList({since: since || undefined, until: until || undefined})
  } finally {
    loading.value = false
  }
}

async function respond(event, response) {
  await calendarRespond(event.eventId, response)
  event.response = response
}

// ---- tasks --------------------------------------------------------------

async function loadTasks() {
  loading.value = true
  try {
    tasks.value = await taskList(showDone.value)
  } finally {
    loading.value = false
  }
}

async function addTask() {
  if (!newTask.value.trim()) return
  await taskSet({title: newTask.value, dueAt: newTaskDue.value || ''})
  newTask.value = ''
  newTaskDue.value = ''
  await loadTasks()
}

async function toggleTask(item) {
  await taskSet({...item, done: item.done ? 0 : 1})
  await loadTasks()
}

async function removeTask(item) {
  await taskDelete(item.taskId)
  await loadTasks()
}

onMounted(() => {
  loadContacts()
  loadEvents()
  loadTasks()
})
</script>

<style scoped lang="scss">
.ws-container {
  height: 100%;
  overflow-y: auto;
  padding: 12px 16px;
}

.ws-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.ws-empty {
  padding: 24px 4px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.event {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &.cancelled .event-title {
    text-decoration: line-through;
    color: var(--el-text-color-secondary);
  }
}

.event-when {
  flex-shrink: 0;
  width: 96px;
  text-align: center;

  .event-date {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .event-time {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.event-body {
  flex: 1;
  min-width: 0;
}

.event-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.event-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.event-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.task {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &.task-done .task-title {
    text-decoration: line-through;
    color: var(--el-text-color-secondary);
  }
}

.task-title {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-due {
  font-size: 12px;
  color: var(--el-text-color-secondary);

  &.overdue {
    color: var(--el-color-danger);
  }
}
</style>
