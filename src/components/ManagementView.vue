<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Edit3, KeyRound, Search, Trash2, UserPlus, X } from 'lucide-vue-next';
import type { Department, User } from '../types';

type UserForm = Partial<User> & {
  password?: string;
};

const emit = defineEmits<{
  (e: 'changed'): void;
}>();

const users = ref<User[]>([]);
const orgData = ref<Department[]>([]);
const searchQuery = ref('');
const isUserModalOpen = ref(false);
const editingUser = ref<UserForm | null>(null);
const isSaving = ref(false);
const errorMessage = ref('');

const fetchUsers = async () => {
  const response = await fetch('/api/users/all');
  users.value = await response.json();
};

const fetchOrg = async () => {
  const response = await fetch('/api/org');
  orgData.value = await response.json();
};

const flattenDepartments = (nodes: Department[]): Department[] =>
  nodes.flatMap((node) => [node, ...(node.children ? flattenDepartments(node.children) : [])]);

const departmentOptions = computed(() => {
  const names = flattenDepartments(orgData.value)
    .map((department) => department.name)
    .filter((name, index, list) => list.indexOf(name) === index);
  return ['未分配', ...names.filter((name) => name !== '未分配')];
});

const roleLabels: Record<User['role'], string> = {
  admin: '系统管理员',
  manager: '部门负责人',
  member: '部门成员'
};

const filteredUsers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return users.value;
  return users.value.filter((item) =>
    [item.name, item.department, item.role, item.email || ''].some((field) => field.toLowerCase().includes(query))
  );
});

onMounted(() => {
  fetchUsers();
  fetchOrg();
});

const generatePassword = () => {
  if (!editingUser.value) return;
  const suffix = Math.random().toString(36).slice(2, 8);
  editingUser.value.password = `Nova@${suffix}`;
};

const resetDefaultPassword = () => {
  if (!editingUser.value) return;
  editingUser.value.password = '123456';
};

const openUserModal = async (user?: User) => {
  await fetchOrg();
  errorMessage.value = '';
  editingUser.value = user
    ? { ...user, password: '' }
    : {
        name: '',
        role: 'member',
        department: '未分配',
        email: '',
        password: '123456',
        avatar: `https://picsum.photos/seed/${Math.random()}/128/128`
      };
  isUserModalOpen.value = true;
};

const saveUser = async () => {
  if (!editingUser.value) return;
  isSaving.value = true;
  errorMessage.value = '';

  try {
    const payload = {
      ...editingUser.value,
      email: editingUser.value.email?.trim(),
      password: editingUser.value.password?.trim()
    };
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '保存员工账号失败');

    isUserModalOpen.value = false;
    await fetchUsers();
    await fetchOrg();
    emit('changed');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存员工账号失败';
  } finally {
    isSaving.value = false;
  }
};

const deleteUser = async (id: string) => {
  if (!confirm('确定删除该员工账号吗？删除后该员工将无法登录系统。')) return;

  const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: '删除员工账号失败' }));
    alert(data.message || '删除员工账号失败');
    return;
  }

  await fetchUsers();
  await fetchOrg();
  emit('changed');
};
</script>

<template>
  <div class="h-full flex flex-col space-y-6">
    <div class="flex justify-between items-center gap-4">
      <div>
        <h3 class="text-lg font-bold text-slate-900">员工账号与权限</h3>
        <p class="text-sm text-slate-500">为每位员工维护独立登录邮箱、密码、所属部门和系统角色。</p>
      </div>
      <button
        @click="openUserModal()"
        class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
      >
        <UserPlus :size="18" />
        <span>添加员工</span>
      </button>
    </div>

    <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col flex-1">
      <div class="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" :size="16" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索员工姓名、邮箱、部门或角色..."
            class="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div class="overflow-y-auto flex-1 custom-scrollbar">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50/50 border-b border-slate-200">
              <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">员工账号</th>
              <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">部门</th>
              <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">角色权限</th>
              <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">账号状态</th>
              <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="u in filteredUsers" :key="u.id" class="hover:bg-slate-50 transition-colors">
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <img :src="u.avatar" :alt="u.name" class="w-10 h-10 rounded-full border border-slate-200" referrerpolicy="no-referrer" />
                  <div>
                    <p class="text-sm font-bold text-slate-900">{{ u.name }}</p>
                    <p class="text-xs text-slate-400">{{ u.email || `${u.id}@novaoffice.com` }}</p>
                    <p class="text-[11px] text-slate-300">ID: {{ u.id }}</p>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-slate-600">{{ u.department }}</td>
              <td class="px-6 py-4">
                <span
                  :class="[
                    'px-2 py-1 rounded text-[10px] font-bold',
                    u.role === 'admin' ? 'bg-purple-50 text-purple-600' : u.role === 'manager' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'
                  ]"
                >
                  {{ roleLabels[u.role] }}
                </span>
              </td>
              <td class="px-6 py-4">
                <span class="px-2 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600">可登录</span>
              </td>
              <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2">
                  <button title="编辑账号和密码" @click="openUserModal(u)" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                    <Edit3 :size="16" />
                  </button>
                  <button title="删除员工账号" @click="deleteUser(u.id)" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="isUserModalOpen && editingUser" class="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
      <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="font-bold text-slate-900">{{ editingUser.id ? '编辑员工账号' : '添加员工账号' }}</h3>
            <p class="text-xs text-slate-400 mt-1">保存后员工可使用登录邮箱和密码进入系统。</p>
          </div>
          <button @click="isUserModalOpen = false" class="p-2 hover:bg-white rounded-full transition-colors">
            <X :size="20" class="text-slate-400" />
          </button>
        </div>

        <div class="p-8 space-y-6">
          <div v-if="errorMessage" class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {{ errorMessage }}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">员工姓名</label>
              <input
                v-model="editingUser.name"
                class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="请输入员工姓名"
              />
            </div>

            <div class="space-y-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">登录邮箱</label>
              <input
                v-model="editingUser.email"
                type="email"
                class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="name@novaoffice.com"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">所属部门</label>
              <select
                v-model="editingUser.department"
                class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none"
              >
                <option v-for="department in departmentOptions" :key="department" :value="department">
                  {{ department }}
                </option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">系统角色</label>
              <select
                v-model="editingUser.role"
                class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none"
              >
                <option value="admin">系统管理员</option>
                <option value="manager">部门负责人</option>
                <option value="member">部门成员</option>
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {{ editingUser.id ? '重置密码' : '初始密码' }}
            </label>
            <div class="flex gap-3">
              <div class="relative flex-1">
                <KeyRound class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" :size="16" />
                <input
                  v-model="editingUser.password"
                  type="text"
                  class="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  :placeholder="editingUser.id ? '留空则不修改原密码' : '默认 123456'"
                />
              </div>
              <button @click="resetDefaultPassword" class="px-4 py-3 text-sm font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
                设为 123456
              </button>
              <button @click="generatePassword" class="px-4 py-3 text-sm font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                生成密码
              </button>
            </div>
            <p class="text-xs text-slate-400">
              新员工默认密码为 123456；编辑员工时填写该项即可重置密码，留空则保持原密码不变。
            </p>
          </div>
        </div>

        <div class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button @click="isUserModalOpen = false" class="px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-slate-600">取消</button>
          <button @click="saveUser" :disabled="isSaving" class="px-6 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 disabled:opacity-60">
            {{ isSaving ? '保存中...' : '保存账号' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
