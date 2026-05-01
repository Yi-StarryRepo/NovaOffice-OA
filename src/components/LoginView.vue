<script setup lang="ts">
import { ref } from 'vue';
import {
  ArrowRight,
  Building2,
  Image as ImageIcon,
  LayoutDashboard,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
} from 'lucide-vue-next';
import { findDemoUserByCredentials } from '../demoData';
import type { User } from '../types';

const emit = defineEmits<{
  login: [user: User];
}>();

const email = ref('');
const password = ref('');
const isLoading = ref(false);
const errorMessage = ref('');

const portalCapabilities = [
  { title: '企业 Logo', description: '管理员可统一维护系统标识与门户形象。', icon: ImageIcon },
  { title: '系统标题', description: '支持按企业名称配置浏览器标题和登录页标题。', icon: Building2 },
  { title: '登录页主题', description: '登录页文案、背景和主色由系统设置集中管理。', icon: Palette },
  { title: '账号安全', description: '员工账号、密码和角色权限由管理员统一分配。', icon: ShieldCheck },
];

const handleLogin = async () => {
  if (!email.value.trim() || !password.value) {
    errorMessage.value = '请输入登录邮箱和密码';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: '登录失败' }));
      throw new Error(data.message || '登录失败');
    }

    const user = await res.json();
    emit('login', user);
  } catch (error) {
    if (error instanceof TypeError) {
      const demoUser = findDemoUserByCredentials(email.value, password.value);
      if (demoUser) {
        emit('login', demoUser);
        return;
      }
      errorMessage.value = '登录服务未启动。可使用演示账号 admin@novaoffice.com / 123456 进入离线预览。';
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : '登录失败';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
    <div class="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
      <div class="hidden lg:block space-y-8 p-8">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200">
            <LayoutDashboard :size="32" />
          </div>
          <h1 class="text-3xl font-bold text-slate-900">NovaOffice OA</h1>
        </div>

        <div class="space-y-6">
          <h2 class="text-5xl font-bold text-slate-900 leading-tight">
            企业专属门户<br />
            <span class="text-blue-600">统一配置与账号安全</span>
          </h2>
          <p class="text-slate-500 text-lg leading-relaxed">
            这里是正式员工登录入口。员工账号、初始密码、角色权限和部门归属均由管理员在系统管理中统一维护。
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 mt-12">
          <div
            v-for="item in portalCapabilities"
            :key="item.title"
            class="flex gap-4 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm"
          >
            <div class="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <component :is="item.icon" :size="24" />
            </div>
            <div>
              <h4 class="font-bold text-slate-900">{{ item.title }}</h4>
              <p class="text-sm text-slate-500">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white p-8 lg:p-12 rounded-[40px] shadow-2xl shadow-slate-200 border border-white relative overflow-hidden">
        <div class="relative">
          <div class="mb-10">
            <h3 class="text-3xl font-bold text-slate-900 mb-2">账号登录</h3>
            <p class="text-slate-400 font-medium">请输入管理员分配的员工邮箱和密码</p>
          </div>

          <form @submit.prevent="handleLogin" class="space-y-6">
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">登录邮箱</label>
              <div class="relative">
                <Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" :size="18" />
                <input
                  v-model="email"
                  type="email"
                  autocomplete="username"
                  class="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="name@novaoffice.com"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">登录密码</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" :size="18" />
                <input
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  class="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="请输入密码"
                />
              </div>
            </div>

            <div v-if="errorMessage" class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {{ errorMessage }}
            </div>

            <button
              type="submit"
              :disabled="isLoading"
              class="w-full group bg-slate-900 hover:bg-blue-600 text-white py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200 active:scale-[0.98]"
            >
              <span v-if="isLoading" class="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
              <span v-else>立即登录</span>
              <ArrowRight v-if="!isLoading" :size="18" class="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div class="mt-8 rounded-3xl bg-slate-50 border border-slate-100 p-5">
            <p class="text-sm font-bold text-slate-900 mb-2">账号说明</p>
            <p class="text-sm text-slate-500 leading-relaxed">
              所有员工都应使用自己的独立账号登录。忘记密码或需要重置账号时，请联系管理员在“组织架构 -> 员工管理”中维护。
            </p>
            <p class="mt-3 text-xs text-slate-400">
              本地预览建议运行 `npm run app:preview`，它会同时提供页面和登录接口。
            </p>
            <p class="mt-2 text-xs text-slate-400">
              离线演示账号：`admin@novaoffice.com` / `123456`
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
