<script setup lang="ts">
import { computed } from 'vue';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  MoreVertical,
  User,
} from 'lucide-vue-next';
import type { MainTask } from '../types';

const props = defineProps<{
  tasks: MainTask[];
}>();

const emit = defineEmits<{
  (e: 'card-click', task: MainTask): void;
}>();

const columns = [
  {
    id: 'pending',
    title: '需求待审',
    icon: AlertCircle,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    statuses: ['pending_source_review', 'pending_target_review', 'ready_for_assignment']
  },
  {
    id: 'processing',
    title: '处理中',
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    statuses: ['in_progress']
  },
  {
    id: 'completed',
    title: '已结办',
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50',
    statuses: ['completed']
  },
];

const statusLabelMap: Record<MainTask['status'], string> = {
  pending_source_review: '待发起部门审核',
  pending_target_review: '待承接部门审核',
  ready_for_assignment: '待指派成员',
  in_progress: '执行中',
  completed: '已完成',
  rejected: '已驳回'
};

const groupedTasks = computed(() =>
  columns.map((column) => ({
    ...column,
    tasks: props.tasks.filter((task) => column.statuses.includes(task.status))
  }))
);
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-8">
    <div v-for="col in groupedTasks" :key="col.id" class="flex flex-col min-h-0 min-w-0">
      <div class="flex items-center justify-between mb-4 px-2">
        <div class="flex items-center gap-2">
          <div :class="['p-2 rounded-lg', col.bg, col.color]">
            <component :is="col.icon" :size="18" />
          </div>
          <h3 class="font-bold text-slate-900">{{ col.title }}</h3>
          <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
            {{ col.tasks.length }}
          </span>
        </div>
        <button class="text-slate-400 hover:text-slate-600">
          <MoreVertical :size="18" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-4 px-1 custom-scrollbar">
        <div
          v-for="task in col.tasks"
          :key="task.id"
          @click="emit('card-click', task)"
          class="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div
            :class="[
              'absolute top-0 left-0 w-1 h-full',
              task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-orange-500' : 'bg-blue-500'
            ]"
          ></div>

          <div class="flex justify-between items-start mb-3 gap-3">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
              {{ task.sourceDepartment }} -> {{ task.targetDepartment }}
            </span>
            <span class="text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded">
              {{ statusLabelMap[task.status] }}
            </span>
          </div>

          <h4 class="font-bold text-slate-900 group-hover:text-blue-600 transition-colors mb-2 leading-tight">
            {{ task.title }}
          </h4>

          <p class="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">
            {{ task.description }}
          </p>

          <div v-if="task.assignments.length > 0" class="flex items-center gap-2 mb-4 bg-slate-50 p-2 rounded-xl">
            <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] border border-slate-200">
              <User :size="12" class="text-slate-400" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-bold text-slate-700 truncate">{{ task.assignments[0].assigneeName }}</p>
              <p class="text-[9px] text-slate-400 uppercase">{{ task.assignments[0].status }}</p>
            </div>
          </div>

          <div v-else class="mb-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            暂无具体执行成员
          </div>

          <div class="flex items-center justify-between pt-4 border-t border-slate-50 mt-auto">
            <div class="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Clock :size="14" />
              {{ task.dueDate }}
            </div>
            <div class="flex items-center gap-1 text-xs text-slate-400">
              <History :size="14" />
              {{ task.logs.length }} 条记录
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
</style>
