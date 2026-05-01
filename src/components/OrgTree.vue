<script setup lang="ts">
import { ChevronRight, Edit3, Plus, ShieldCheck, Trash2, Users } from 'lucide-vue-next';
import { ref } from 'vue';
import type { Department } from '../types';

defineOptions({ name: 'OrgTree' });

const props = defineProps<{
  node: Department;
  level: number;
  adminMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'add', id: string): void;
  (e: 'edit', node: Department): void;
  (e: 'delete', id: string): void;
}>();

const isOpen = ref(props.level < 2);

const toggle = () => {
  if ((props.node.children || []).length > 0) {
    isOpen.value = !isOpen.value;
  }
};
</script>

<template>
  <div class="org-node" :style="{ marginLeft: `${level * 20}px` }">
    <div
      @click="toggle"
      class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group border border-transparent hover:border-slate-200"
    >
      <div v-if="node.children && node.children.length > 0" class="w-5 h-5 flex items-center justify-center">
        <ChevronRight
          :size="16"
          class="text-slate-400 group-hover:text-blue-500 transition-transform"
          :class="{ 'rotate-90': isOpen }"
        />
      </div>
      <div v-else class="w-5 h-5"></div>

      <div class="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
        <Users :size="18" />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-900 truncate">{{ node.name }}</span>
          <span class="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase font-bold">
            {{ node.memberCount }} 人
          </span>
        </div>
        <div class="flex items-center gap-3 mt-1 text-xs text-slate-400">
          <span class="flex items-center gap-1">
            <ShieldCheck :size="12" />
            负责人: {{ node.manager }}
          </span>
        </div>
      </div>

      <div v-if="adminMode" class="hidden group-hover:flex items-center gap-1">
        <button
          @click.stop="emit('add', node.id)"
          class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
          title="新增子部门"
        >
          <Plus :size="14" />
        </button>
        <button
          @click.stop="emit('edit', node)"
          class="p-1.5 text-slate-400 hover:text-green-600 hover:bg-white rounded-lg transition-all"
          title="编辑部门"
        >
          <Edit3 :size="14" />
        </button>
        <button
          @click.stop="emit('delete', node.id)"
          class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
          title="删除部门"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>

    <div v-if="isOpen && node.children && node.children.length > 0" class="node-children">
      <OrgTree
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :adminMode="adminMode"
        @add="(id) => emit('add', id)"
        @edit="(node) => emit('edit', node)"
        @delete="(id) => emit('delete', id)"
      />
    </div>
  </div>
</template>

<style scoped>
.node-children {
  position: relative;
}

.node-children::before {
  content: '';
  position: absolute;
  left: 31px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #e2e8f0;
}
</style>
