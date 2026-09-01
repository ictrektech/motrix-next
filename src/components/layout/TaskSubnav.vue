<script setup lang="ts">
/** @fileoverview Task scope navigation backed by the central task store. */
import { computed, onMounted, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { PlayOutline, AlertCircleOutline, CheckmarkDoneOutline, ListOutline } from '@vicons/ionicons5'
import SubnavPane, { type SubnavPaneItem } from '@/components/layout/SubnavPane.vue'
import { isEngineReady } from '@/api/aria2'
import { useAppStore } from '@/stores/app'
import { usePreferenceStore } from '@/stores/preference'
import { useTaskStore } from '@/stores/task'
import type { TaskScope } from '@/composables/useTaskSort'
import type { I18nKey } from '@shared/i18nTypes'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()

const items: { key: TaskScope; labelKey: I18nKey; icon: Component; route: string }[] = [
  { key: 'all', labelKey: 'task.scope-all', icon: ListOutline, route: '/task/all' },
  { key: 'progress', labelKey: 'task.scope-progress', icon: PlayOutline, route: '/task/progress' },
  { key: 'failed', labelKey: 'task.scope-failed', icon: AlertCircleOutline, route: '/task/failed' },
  { key: 'completed', labelKey: 'task.scope-completed', icon: CheckmarkDoneOutline, route: '/task/completed' },
]

const subnavItems = computed<SubnavPaneItem[]>(() =>
  items.map((item) => {
    const label = t(item.labelKey) || item.key
    const count = preferenceStore.config.sidebarTaskCounts ? taskStore.taskCounts[item.key] : undefined
    return {
      ...item,
      label,
      count,
      ariaLabel: count === undefined ? label : `${label} ${count}`,
      active: isActive(item.key),
    }
  }),
)

onMounted(() => {
  if (preferenceStore.config.sidebarTaskCounts && isEngineReady()) void taskStore.refreshTaskCounts()
})

watch(
  () => `${appStore.stat.numActive}:${appStore.stat.numWaiting}`,
  () => {
    if (preferenceStore.config.sidebarTaskCounts && isEngineReady()) void taskStore.refreshTaskCounts()
  },
)

watch(
  () => preferenceStore.config.sidebarTaskCounts,
  (enabled) => {
    if (enabled && isEngineReady()) void taskStore.refreshTaskCounts()
  },
)

function nav(path: string) {
  router.push({ path }).catch(() => {
    /* duplicate navigation */
  })
}

function isActive(key: TaskScope) {
  return route.path.includes(key)
}
</script>

<template>
  <SubnavPane :title="t('subnav.task-list') || 'Tasks'" :items="subnavItems" @navigate="nav" />
</template>
