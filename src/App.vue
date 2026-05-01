<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, watch } from 'vue';
import { 
  LayoutDashboard, 
  FileCheck, 
  ClipboardList, 
  Users, 
  User as UserIcon,
  Settings, 
  Bell, 
  Plus, 
  ChevronRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  History,
  GitBranch
} from 'lucide-vue-next';
import KanbanBoard from './components/KanbanBoard.vue';
import OrgTree from './components/OrgTree.vue';
import OrgChart from './components/OrgChart.vue';
import ManagementView from './components/ManagementView.vue';
import WorkflowDesigner from './components/WorkflowDesigner.vue';
import LoginView from './components/LoginView.vue';
import { demoAnalytics, demoApprovals, demoDepartments, demoTasks, demoUsers, demoWorkflows, getDemoUserById } from './demoData';
import type { AnalyticsResponse, Approval, Department, MainTask, User, WorkflowDefinition, WorkflowNode } from './types';

// Mock types
type View = 'dashboard' | 'approvals' | 'tasks' | 'org' | 'settings' | 'analytics' | 'management' | 'workflow';

const activeView = ref<View>('dashboard');
const orgPanel = ref<'structure' | 'staff'>('structure');
const isSidebarOpen = ref(true);
const isLoggedIn = ref(false);
const isSavingProfile = ref(false);
const isDemoMode = ref(false);
const hasShownDemoNotice = ref(false);
const user = ref<User>({
  id: 'u1',
  name: '加载中...',
  role: 'manager',
  avatar: 'https://picsum.photos/seed/manager/128/128',
  department: '',
  email: ''
});

const tasks = ref<MainTask[]>([]);
const orgData = ref<Department[]>([]);
const approvals = ref<Approval[]>([]);
const approvalFilter = ref<'all' | 'pending' | 'processed'>('all');
const allUsers = ref<User[]>([]);
const analytics = ref<AnalyticsResponse | null>(null);
const workflowDefinitions = ref<WorkflowDefinition[]>([]);
const workflowDefinition = ref<WorkflowDefinition | null>(null);
const selectedWorkflowKey = ref('task_fulfillment');
const isWorkflowFullscreen = ref(false);
const isSavingWorkflow = ref(false);
const isWorkflowModalOpen = ref(false);
const workflowDraftMeta = ref({ key: '', name: '', description: '' });
const analyticsLoadBars = computed(() => analytics.value?.departmentLoads || []);
const activeTaskWorkflow = computed(() => workflowDefinitions.value.find((workflow) => workflow.isTaskWorkflow));
const canManageCurrentWorkflow = computed(() => {
  const workflow = workflowDefinition.value;
  if (!workflow) return false;
  if (workflow.isBuiltIn) return false;
  if (!workflow.ownerId) return true;
  return workflow.ownerId === user.value.id;
});
const analyticsStatusCards = computed(() => [
  { label: '任务总量', value: tasks.value.length, hint: '数据库实时任务', color: 'bg-blue-50 text-blue-700' },
  { label: '待处理', value: analytics.value?.pendingTasks || 0, hint: '待审核 / 待指派', color: 'bg-orange-50 text-orange-700' },
  { label: '执行中', value: analytics.value?.ongoingTasks || 0, hint: '成员处理中', color: 'bg-sky-50 text-sky-700' },
  { label: '已完成', value: analytics.value?.completedTasks || 0, hint: `完成率 ${analytics.value?.averageCompletionRate || 0}%`, color: 'bg-emerald-50 text-emerald-700' },
  { label: '待审批', value: analytics.value?.pendingApprovals || 0, hint: '审批中心实时单据', color: 'bg-violet-50 text-violet-700' },
  { label: '员工 / 部门', value: `${analytics.value?.totalUsers || allUsers.value.length}/${analytics.value?.totalDepartments || 0}`, hint: '组织架构实时汇总', color: 'bg-slate-100 text-slate-700' }
]);
const analyticsMaxDailyWorkload = computed(() =>
  Math.max(1, ...(analytics.value?.dailyWorkload || []).map((item) => item.value))
);
const analyticsTopEmployees = computed(() => (analytics.value?.employeeStats || []).slice(0, 8));
const filteredApprovals = computed(() => {
  if (approvalFilter.value === 'pending') {
    return approvals.value.filter((approval) => approval.status === 'pending');
  }
  if (approvalFilter.value === 'processed') {
    return approvals.value.filter((approval) => approval.status !== 'pending');
  }
  return approvals.value;
});
const approvalFilterTabs = [
  { key: 'all' as const, label: '全部' },
  { key: 'pending' as const, label: '待处理' },
  { key: 'processed' as const, label: '已处理' }
];
const taskStatusLabelMap: Record<MainTask['status'], string> = {
  pending_source_review: '待发起部门负责人审核',
  pending_target_review: '待承接部门负责人审核',
  ready_for_assignment: '待指派部门成员',
  in_progress: '部门执行中',
  completed: '流程已完成',
  rejected: '已驳回'
};
const workflowActorLabelMap: Record<WorkflowNode['actor'], string> = {
  initiator: '发起人',
  source_manager: '发起部门负责人',
  target_manager: '承接部门负责人',
  target_member: '承接部门成员',
  system: '系统',
  any: '任意角色'
};
const roleLabelMap: Record<User['role'], string> = {
  admin: '管理员',
  manager: '部门负责人',
  member: '员工'
};

const workflowActionLabelMap: Record<WorkflowNode['action'], string> = {
  submit: '需求提交',
  source_review: '发起部门审核',
  target_review: '承接部门审核',
  assign: '部门指派',
  feedback: '成员处理反馈',
  manual: '人工任务',
  approval: '审批任务',
  complete: '流程完成',
  reject: '流程驳回',
  condition: '条件分支',
  parallel: '并行网关',
  cc: '抄送节点',
  notify: '通知节点',
  script: '脚本动作',
  subprocess: '子流程'
};

const getWorkflowNodeDisplayName = (node: WorkflowNode | null | undefined) => {
  if (!node) return '';
  if (/[\u4e00-\u9fa5]/.test(node.name)) return node.name;
  if (node.action === 'approval' && node.actor === 'source_manager') return '发起部门审核';
  if (node.action === 'approval' && node.actor === 'target_manager') return '承接部门审核';
  return workflowActionLabelMap[node.action] || node.name;
};

const getWorkflowNodeForTask = (task: MainTask | null) => {
  if (!task) return null;
  return workflowDefinition.value?.nodes.find((node) => node.status === task.status) || null;
};

const getTaskStatusLabel = (task: MainTask | null) => {
  if (!task) return '';
  return getWorkflowNodeDisplayName(getWorkflowNodeForTask(task)) || taskStatusLabelMap[task.status] || task.status;
};

const findWorkflowNodeByReadableToken = (token: string) => {
  const normalized = token.trim().replace(/^\[|\]$/g, '');
  const nodes = workflowDefinition.value?.nodes || [];
  return (
    nodes.find((node) => node.id === normalized) ||
    nodes.find((node) => node.name === normalized) ||
    null
  );
};

const translateWorkflowToken = (token: string) => {
  const node = findWorkflowNodeByReadableToken(token);
  if (node) return getWorkflowNodeDisplayName(node);
  return token.replace(/^\[|\]$/g, '');
};

const formatLogAction = (action: string) =>
  action
    .replace(/\[([^\]]+)\]/g, (_, token: string) => `「${translateWorkflowToken(token)}」`)
    .replace(/\b(manager-approve|assign-member|member-feedback|complete|reject)\b/g, (token: string) => translateWorkflowToken(token));

const getAssignmentStatusLabel = (status: string) => {
  const statusMap: Record<string, string> = {
    todo: '待处理',
    'in-progress': '处理中',
    completed: '已完成',
    submitted: '已提交'
  };
  return statusMap[status] || status;
};

const isImageAttachment = (attachment: string) => attachment.startsWith('data:image');

const isTextAttachment = (attachment: string) =>
  attachment.startsWith('data:text/') || attachment.startsWith('data:application/json');

const getAttachmentLabel = (attachment: string, index: number) => {
  if (attachment.startsWith('data:image')) return `图片附件 ${index + 1}`;
  if (attachment.startsWith('data:text/plain')) return `文本附件 ${index + 1}`;
  if (attachment.startsWith('data:application/json')) return `JSON 附件 ${index + 1}`;
  return `附件 ${index + 1}`;
};

const getAttachmentPreviewText = (attachment: string) => {
  if (!isTextAttachment(attachment)) return '';
  const commaIndex = attachment.indexOf(',');
  if (commaIndex === -1) return '';
  const meta = attachment.slice(0, commaIndex);
  const payload = attachment.slice(commaIndex + 1);
  try {
    const decoded = meta.includes(';base64')
      ? decodeURIComponent(escape(window.atob(payload)))
      : decodeURIComponent(payload);
    return decoded.slice(0, 160);
  } catch {
    return '';
  }
};

const canOperateWorkflowNode = (task: MainTask | null, node: WorkflowNode | null) => {
  if (!task || !node) return false;
  if (user.value.role === 'admin') return true;

  switch (node.actor) {
    case 'source_manager':
      return user.value.role === 'manager' && user.value.department === task.sourceDepartment;
    case 'target_manager':
      return user.value.role === 'manager' && user.value.department === task.targetDepartment;
    case 'target_member':
      return task.assignments.some((assignment) => assignment.assigneeId === user.value.id);
    case 'any':
      return (
        task.assignments.some((assignment) => assignment.assigneeId === user.value.id) ||
        user.value.department === task.sourceDepartment ||
        user.value.department === task.targetDepartment
      );
    default:
      return false;
  }
};

const createDefaultWorkflowDraft = (key: string, name: string, description: string): WorkflowDefinition => ({
  id: '',
  key,
  name,
  description,
  updatedAt: '',
  updatedBy: user.value.name || '系统管理员',
  nodes: [
    { id: 'wf_submit', name: '需求提交', description: '需求发起入口', action: 'submit', actor: 'initiator', kind: 'start', x: 140, y: 340, nextNodeId: 'wf_source_review' },
    { id: 'wf_source_review', name: '发起部门审核', description: '发起部门负责人审核需求是否合理', action: 'source_review', actor: 'source_manager', kind: 'review', status: 'pending_source_review', x: 560, y: 340, nextNodeId: 'wf_target_review', rejectNodeId: 'wf_reject' },
    { id: 'wf_target_review', name: '承接部门审核', description: '承接部门负责人确认是否接收任务', action: 'target_review', actor: 'target_manager', kind: 'review', status: 'pending_target_review', x: 980, y: 340, nextNodeId: 'wf_assign', rejectNodeId: 'wf_reject' },
    { id: 'wf_assign', name: '部门指派', description: '承接部门负责人将任务分配给成员', action: 'assign', actor: 'target_manager', kind: 'task', status: 'ready_for_assignment', x: 1400, y: 340, nextNodeId: 'wf_feedback' },
    { id: 'wf_feedback', name: '成员处理反馈', description: '成员处理任务并提交结果与附件', action: 'feedback', actor: 'target_member', kind: 'task', status: 'in_progress', x: 1820, y: 340, nextNodeId: 'wf_complete' },
    { id: 'wf_complete', name: '流程完成', description: '任务验收完成后结束流程', action: 'complete', actor: 'system', kind: 'end', status: 'completed', x: 2240, y: 340 },
    { id: 'wf_reject', name: '流程驳回', description: '审核不通过时结束流程', action: 'reject', actor: 'system', kind: 'end', status: 'rejected', x: 980, y: 700 }
  ]
});

// Sub-task states
const subAssigneeId = ref('');
const feedbackForm = ref({
  text: '',
  images: [] as string[]
});
const feedbackAssignmentId = ref('');
const selectedTask = ref<MainTask | null>(null);
const taskViewMode = ref<'kanban' | 'list' | 'gantt'>('kanban');
const orgViewMode = ref<'tree' | 'chart'>('chart');
const isCreateTaskModalOpen = ref(false);
const isEditingTask = ref(false);
const newTaskForm = ref({
  id: '',
  title: '',
  targetDepartment: '产研中心',
  priority: 'medium',
  dueDate: new Date().toISOString().split('T')[0],
  description: ''
});
const showToast = ref(false);
const toastMessage = ref('');
const isAvatarEditorOpen = ref(false);
const profileDraft = ref({
  name: '',
  email: '',
  avatar: ''
});
const AUTH_STORAGE_KEY = 'oa_user';

const readStoredUser = () => {
  if (typeof window === 'undefined') return null;
  const sessionValue = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (sessionValue) return sessionValue;

  const legacyValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (legacyValue) {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, legacyValue);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return legacyValue;
  }

  return null;
};

const writeStoredUser = (value: User) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};

const clearStoredUser = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};

const notify = (msg: string) => {
  toastMessage.value = msg;
  showToast.value = true;
  setTimeout(() => showToast.value = false, 3000);
};

const syncProfileDraft = () => {
  profileDraft.value = {
    name: user.value.name || '',
    email: user.value.email || '',
    avatar: user.value.avatar || ''
  };
};

const apiRequest = async <T>(url: string, options?: RequestInit): Promise<T> => {
  if (isDemoMode.value && options?.method && options.method !== 'GET') {
    throw new Error('当前为离线演示模式，保存和流程操作需要启动集成服务。');
  }

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: '请求失败' }));
    throw new Error(data.message || data.error || '请求失败');
  }

  return res.json();
};

const handleCreateTask = async () => {
  if (!newTaskForm.value.title) return notify('请输入任务标题');
  
  try {
    const payload = {
      ...newTaskForm.value,
      editorId: user.value.id,
      editorName: user.value.name,
      editorRole: user.value.role,
      editorDepartment: user.value.department,
    };
    const res = await apiRequest<MainTask>(isEditingTask.value ? `/api/tasks/${newTaskForm.value.id}` : '/api/tasks', {
      method: isEditingTask.value ? 'PATCH' : 'POST',
      body: JSON.stringify(
        isEditingTask.value
          ? payload
          : {
              ...payload,
              creator: user.value.name,
              creatorRole: user.value.role,
              sourceDepartment: user.value.department,
            }
      )
    });
    
    if (res) {
      isCreateTaskModalOpen.value = false;
      const nextStepLabel = getTaskStatusLabel(res);
      notify(
        isEditingTask.value
          ? '任务已更新'
          : nextStepLabel
            ? `需求已提交，当前进入「${nextStepLabel}」`
            : '需求已提交'
      );
      await fetchAllData(user.value.id);
      // Reset form
      newTaskForm.value = {
        id: '',
        title: '',
        targetDepartment: '产研中心',
        priority: 'medium',
        dueDate: new Date().toISOString().split('T')[0],
        description: ''
      };
      isEditingTask.value = false;
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : isEditingTask.value ? '任务保存失败' : '任务发布失败');
  }
};

const updateTaskStatus = async (taskId: string, status: string) => {
  try {
    const updated = await apiRequest<MainTask>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, user: user.value.name })
    });
    if (updated) {
      notify(`任务状态已更新为 ${status}`);
      selectedTask.value = updated;
      await fetchAllData(user.value.id);
    }
  } catch (error) {
    notify('状态更新失败');
  }
};

const handleApproval = async (id: string, status: 'approved' | 'rejected') => {
  const approval = await apiRequest<Approval>(`/api/approvals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  if (approval) {
    notify(status === 'approved' ? '审批已通过' : '审批已驳回');
  }
};

const handleApprovalPersist = async (id: string, status: 'approved' | 'rejected') => {
  try {
    const approval = await apiRequest<Approval>(`/api/approvals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    const approvalIndex = approvals.value.findIndex((item) => item.id === id);
    if (approvalIndex !== -1) {
      approvals.value[approvalIndex] = approval;
    }
    notify(status === 'approved' ? '审批已通过' : '审批已驳回');
  } catch (error) {
    notify(error instanceof Error ? error.message : '审批处理失败');
  }
};

const isOrgModalOpen = ref(false);
const editingDept = ref<{ id?: string, name: string, manager: string, memberCount: number, parentId?: string }>({ name: '', manager: '', memberCount: 0 });
const orgSearchQuery = ref('');
const emptyDepartmentForm = () => ({ name: '', manager: '', memberCount: 0 });

const availableAssignees = computed(() => {
  if (!selectedTask.value) return [] as User[];
  const inDepartment = allUsers.value.filter((item) => item.department === selectedTask.value?.targetDepartment);
  const members = inDepartment.filter((item) => item.role === 'member');
  return members.length > 0 ? members : inDepartment;
});

const canUserViewTask = (task: MainTask, viewer: User) => {
  if (viewer.role === 'admin') return true;

  const isSourceDepartment = task.sourceDepartment === viewer.department;
  const isTargetDepartment = task.targetDepartment === viewer.department;
  const isAssignedToMe = task.assignments.some((assignment) => assignment.assigneeId === viewer.id);

  if (viewer.role === 'manager') {
    return isSourceDepartment || isTargetDepartment || isAssignedToMe;
  }

  return isAssignedToMe;
};

const visibleTasks = computed(() => {
  const related = tasks.value.filter((task) => canUserViewTask(task, user.value));

  return [...related].sort((left, right) => {
    const leftMine = left.sourceDepartment === user.value.department ? 1 : 0;
    const rightMine = right.sourceDepartment === user.value.department ? 1 : 0;
    if (leftMine !== rightMine) return rightMine - leftMine;
    return (right.logs.length || 0) - (left.logs.length || 0);
  });
});

const visibleWorkflowSteps = computed(() => {
  const nodes = workflowDefinition.value?.nodes || [];
  const startNode =
    nodes.find((node) => node.kind === 'start') ||
    nodes.find((node) => node.action === 'submit') ||
    nodes[0];

  if (!startNode) return [];

  const ordered: WorkflowNode[] = [];
  const visited = new Set<string>();
  let current: WorkflowNode | undefined = startNode;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.action !== 'reject') ordered.push(current);
    current = nodes.find((node) => node.id === current?.nextNodeId);
  }

  return ordered;
});

const currentWorkflowNode = computed(() => {
  return getWorkflowNodeForTask(selectedTask.value);
});

const isWorkflowStepDone = (step: WorkflowNode, task: MainTask) => {
  if (task.status === 'rejected') {
    return step.action === 'submit';
  }

  const ordered = visibleWorkflowSteps.value;
  const currentIndex = ordered.findIndex((item) => item.status === task.status);
  const stepIndex = ordered.findIndex((item) => item.id === step.id);

  if (currentIndex === -1) {
    return task.status === 'completed';
  }

  return stepIndex <= currentIndex;
};

const workflowStepMeta = (step: WorkflowNode, task: MainTask) => {
  if (step.action === 'source_review') return task.sourceReviewer || '待处理';
  if (step.action === 'target_review') return task.targetReviewer || '待处理';
  if (step.action === 'assign') return task.assignments.length ? `已指派 ${task.assignments.length} 人` : '待处理';
  if (step.actor === 'target_member') return task.assignments.some((item) => item.feedbackText || item.attachments?.length) ? '持续处理中' : '待处理';
  return workflowActorLabelMap[step.actor];
};

const canApproveCurrentNode = computed(() => {
  if (!selectedTask.value || !currentWorkflowNode.value) return false;
  if (!canOperateWorkflowNode(selectedTask.value, currentWorkflowNode.value)) return false;
  if (currentWorkflowNode.value.action === 'assign') return false;
  if (currentWorkflowNode.value.actor === 'target_member') return false;
  if (currentWorkflowNode.value.actor === 'system') return false;
  return currentWorkflowNode.value.action !== 'complete' && currentWorkflowNode.value.action !== 'reject';
});

const canRejectCurrentNode = computed(() => {
  if (!selectedTask.value || !currentWorkflowNode.value) return false;
  return canApproveCurrentNode.value && Boolean(currentWorkflowNode.value.rejectNodeId);
});

const currentApproveLabel = computed(() => {
  if (!currentWorkflowNode.value) return '提交';
  if (['source_review', 'target_review', 'approval'].includes(currentWorkflowNode.value.action) || currentWorkflowNode.value.kind === 'review') {
    return `${currentWorkflowNode.value.name}通过`;
  }
  return `完成「${currentWorkflowNode.value.name}」`;
});

const canAssignMembers = computed(() => {
  if (!selectedTask.value || !currentWorkflowNode.value) return false;
  return (
    currentWorkflowNode.value.action === 'assign' &&
    canOperateWorkflowNode(selectedTask.value, currentWorkflowNode.value)
  );
});

const availableFeedbackAssignments = computed(() => {
  if (!selectedTask.value || !currentWorkflowNode.value || currentWorkflowNode.value.actor !== 'target_member') return [];
  if (!canOperateWorkflowNode(selectedTask.value, currentWorkflowNode.value)) return [];
  return selectedTask.value.assignments.filter((assignment) => user.value.role === 'admin' || assignment.assigneeId === user.value.id);
});

const handleTaskWorkflowAction = async (taskId: string, action: 'approve' | 'reject') => {
  try {
    const updated = await apiRequest<MainTask>(`/api/tasks/${taskId}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        userId: user.value.id,
        userName: user.value.name,
        userRole: user.value.role,
        userDepartment: user.value.department
      })
    });
    selectedTask.value = updated;
    notify(action === 'approve' ? '流程步骤已处理并继续流转' : '流程已驳回');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '审核失败');
  }
};

const handleAssignSubTask = async (taskId: string) => {
  const assignee = availableAssignees.value.find((item) => item.id === subAssigneeId.value);
  if (!assignee) return notify('请选择部门成员');

  try {
    const updated = await apiRequest<MainTask>(`/api/tasks/${taskId}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'assign',
        userId: user.value.id,
        userName: user.value.name,
        userRole: user.value.role,
        userDepartment: user.value.department,
        assigneeId: assignee.id,
        assigneeName: assignee.name
      })
    });
    selectedTask.value = updated;
    subAssigneeId.value = '';
    notify(`已指派给 ${assignee.name}`);
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '任务指派失败');
  }
};

const handleFeedbackFilesChange = async (event: Event) => {
  const input = event.target as HTMLInputElement | null;
  const files = Array.from(input?.files || []);

  try {
    feedbackForm.value.images = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
              }
              reject(new Error('附件读取失败'));
            };
            reader.onerror = () => reject(new Error('附件读取失败'));
            reader.readAsDataURL(file);
          })
      )
    );
  } catch (error) {
    notify(error instanceof Error ? error.message : '附件读取失败');
  } finally {
    if (input) input.value = '';
  }
};

const handleSubmitFeedback = async (taskId: string, assignmentId: string) => {
  if (!assignmentId) return notify('请选择反馈成员');
  if (!feedbackForm.value.text.trim() && feedbackForm.value.images.length === 0) {
    return notify('请填写反馈内容或上传附件');
  }

  try {
    const updated = await apiRequest<MainTask>(`/api/tasks/${taskId}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'feedback',
        userId: user.value.id,
        userName: user.value.name,
        userRole: user.value.role,
        userDepartment: user.value.department,
        assigneeId: assignmentId,
        feedbackText: feedbackForm.value.text,
        attachments: feedbackForm.value.images
      })
    });
    selectedTask.value = updated;
    feedbackForm.value = { text: '', images: [] };
    notify('反馈已提交');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '反馈提交失败');
  }
};

const canManageSelectedTask = computed(() => {
  if (!selectedTask.value) return false;
  if (user.value.role === 'admin') return true;
  return (
    user.value.role === 'manager' &&
    [selectedTask.value.sourceDepartment, selectedTask.value.targetDepartment].includes(user.value.department)
  );
});

const canEditSelectedTask = computed(() => {
  if (!selectedTask.value || !canManageSelectedTask.value) return false;
  return !['completed', 'rejected'].includes(selectedTask.value.status);
});

const canDeleteSelectedTask = computed(() => {
  if (!selectedTask.value || !canManageSelectedTask.value) return false;
  return selectedTask.value.status !== 'completed' && selectedTask.value.assignments.length === 0;
});

const openEditTask = () => {
  if (!selectedTask.value) return;
  newTaskForm.value = {
    id: selectedTask.value.id,
    title: selectedTask.value.title,
    targetDepartment: selectedTask.value.targetDepartment,
    priority: selectedTask.value.priority,
    dueDate: selectedTask.value.dueDate,
    description: selectedTask.value.description,
  };
  isEditingTask.value = true;
  isCreateTaskModalOpen.value = true;
};

const handleDeleteTask = async () => {
  if (!selectedTask.value) return;
  if (!confirm(`确认删除任务「${selectedTask.value.title}」吗？`)) return;
  try {
    await apiRequest(`/api/tasks/${selectedTask.value.id}`, {
      method: 'DELETE',
      body: JSON.stringify({
        userId: user.value.id,
        userName: user.value.name,
        userRole: user.value.role,
        userDepartment: user.value.department
      })
    });
    selectedTask.value = null;
    notify('任务已删除');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '任务删除失败');
  }
};

const filterDepartments = (nodes: Department[], query: string): Department[] => {
  if (!query) return nodes;

  return nodes.reduce<Department[]>((result, node) => {
    const filteredChildren = filterDepartments(node.children || [], query);
    const departmentMatches = [node.name, node.manager].some((value) => value.toLowerCase().includes(query));
    const employeeMatches = allUsers.value.some(
      (employee) => employee.department === node.name && employee.name.toLowerCase().includes(query)
    );

    if (departmentMatches || employeeMatches || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren
      });
    }

    return result;
  }, []);
};

const stripSpecialDepartments = (nodes: Department[]): Department[] =>
  nodes
    .filter((node) => node.name !== '未分配')
    .map((node) => ({
      ...node,
      children: stripSpecialDepartments(node.children || [])
    }));

const flattenDepartmentNames = (nodes: Department[]): string[] =>
  nodes.flatMap((node) => [node.name, ...flattenDepartmentNames(node.children || [])]);

const visibleOrgData = computed(() => stripSpecialDepartments(orgData.value));

const filteredOrgData = computed(() => visibleOrgData.value);
const departmentNames = computed(() =>
  flattenDepartmentNames(visibleOrgData.value)
    .filter((name, index, list) => list.indexOf(name) === index && name !== 'NovaOffice 集团')
);

const findDepartmentById = (nodes: Department[], id?: string): Department | null => {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const childMatch = findDepartmentById(node.children || [], id);
    if (childMatch) return childMatch;
  }
  return null;
};

const openAddDepartment = (parentId?: string) => {
  const defaultParentId = parentId || orgData.value.find((node) => node.name !== '未分配')?.id;
  editingDept.value = {
    ...emptyDepartmentForm(),
    parentId: defaultParentId
  };
  isOrgModalOpen.value = true;
};

const openEditDepartment = (department: Department) => {
  editingDept.value = {
    id: department.id,
    name: department.name,
    manager: department.manager,
    memberCount: department.memberCount
  };
  isOrgModalOpen.value = true;
};

const saveDepartment = async () => {
  if (!editingDept.value.name.trim() || !editingDept.value.manager.trim()) {
    return notify('请填写部门名称和负责人');
  }

  try {
    await apiRequest('/api/org', {
      method: 'POST',
      body: JSON.stringify(editingDept.value)
    });
    isOrgModalOpen.value = false;
    editingDept.value = emptyDepartmentForm();
    notify('组织架构已更新');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '组织架构保存失败');
  }
};

const deleteDepartment = async (departmentId: string) => {
  if (!confirm('确认删除该部门及其下级部门吗？关联员工将转入未分配。')) return;

  try {
    await apiRequest(`/api/org/${departmentId}`, {
      method: 'DELETE'
    });
    notify('部门已删除');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除部门失败');
  }
};

const stats = ref([
  { label: '待办任务', value: '0', trend: '+2 较昨日', color: 'orange', icon: Clock },
  { label: '待我指派', value: '0', trend: '急需分流', color: 'blue', icon: TrendingUp },
  { label: '待我审批', value: '0', trend: '流程中', color: 'red', icon: FileCheck },
  { label: '团队成员', value: '2500', trend: '全公司规模', color: 'purple', icon: Users },
]);

const applyDataSnapshot = (
  userData: User,
  tasksData: MainTask[],
  orgRawData: Department[],
  approvalsData: Approval[],
  usersAllData: User[],
  analyticsData: AnalyticsResponse,
  workflowsData: WorkflowDefinition[]
) => {
  user.value = userData;
  tasks.value = tasksData;
  orgData.value = orgRawData;
  approvals.value = approvalsData;
  allUsers.value = usersAllData;
  analytics.value = analyticsData;
  workflowDefinitions.value = workflowsData;

  const selectedRemoteWorkflow =
    workflowsData.find((workflow: WorkflowDefinition) => workflow.key === selectedWorkflowKey.value) ||
    workflowsData.find((workflow: WorkflowDefinition) => workflow.isTaskWorkflow) ||
    workflowsData[0] ||
    null;
  const isEditingWorkflow = activeView.value === 'workflow' || isWorkflowFullscreen.value;
  const shouldPreserveLocalWorkflow =
    isEditingWorkflow &&
    workflowDefinition.value &&
    workflowDefinition.value.key === selectedWorkflowKey.value;

  if (!shouldPreserveLocalWorkflow) {
    workflowDefinition.value = selectedRemoteWorkflow ? JSON.parse(JSON.stringify(selectedRemoteWorkflow)) : null;
    if (workflowDefinition.value) {
      selectedWorkflowKey.value = workflowDefinition.value.key;
    }
  }

  if (selectedTask.value) {
    selectedTask.value = tasksData.find((task: MainTask) => task.id === selectedTask.value?.id) || null;
  }
  if (!selectedTask.value) {
    feedbackAssignmentId.value = '';
  } else if (!availableFeedbackAssignments.value.some((assignment) => assignment.id === feedbackAssignmentId.value)) {
    feedbackAssignmentId.value = availableFeedbackAssignments.value[0]?.id || '';
  }

  const relatedTasks = tasksData.filter((task: MainTask) => canUserViewTask(task, userData));

  stats.value[0].value = relatedTasks.filter((t: any) => t.status !== 'completed' && t.status !== 'rejected').length.toString();
  stats.value[1].value = relatedTasks.filter((t: any) => ['ready_for_assignment', 'in_progress'].includes(t.status) && t.targetDepartment === userData.department).length.toString();
  stats.value[2].value = approvalsData.filter((a: any) => a.status === 'pending').length.toString();
  stats.value[3].value = usersAllData.length.toString();
};

const loadDemoData = (userId: string) => {
  isDemoMode.value = true;
  const demoUser = getDemoUserById(userId);
  applyDataSnapshot(
    demoUser,
    demoTasks,
    demoDepartments,
    demoApprovals,
    demoUsers,
    demoAnalytics,
    demoWorkflows
  );
  syncProfileDraft();
  writeStoredUser(demoUser);
  if (!hasShownDemoNotice.value) {
    notify('当前为离线演示模式，展示数据来自本地快照。');
    hasShownDemoNotice.value = true;
  }
};

const fetchAllData = async (userId: string = user.value.id) => {
  try {
    const [userRes, tasksRes, orgRes, approvalsRes, allUsersRes, analyticsRes, workflowsRes] = await Promise.all([
      fetch(`/api/user?id=${userId}`),
      fetch('/api/tasks'),
      fetch('/api/org'),
      fetch('/api/approvals'),
      fetch('/api/users/all'),
      fetch('/api/analytics'),
      fetch('/api/workflows')
    ]);
    
    const userData = await userRes.json();
    const tasksData = await tasksRes.json();
    const orgRawData = await orgRes.json();
    const approvalsData = await approvalsRes.json();
    const usersAllData = await allUsersRes.json();
    const analyticsData = await analyticsRes.json();
    const workflowsData = await workflowsRes.json();
    isDemoMode.value = false;
    applyDataSnapshot(userData, tasksData, orgRawData, approvalsData, usersAllData, analyticsData, workflowsData);
    syncProfileDraft();
  } catch (err) {
    console.error("Failed to fetch data:", err);
    loadDemoData(userId);
  }
};

const saveProfile = async () => {
  try {
    isSavingProfile.value = true;
    const updatedUser = await apiRequest<User>('/api/settings/profile', {
      method: 'POST',
      body: JSON.stringify({
        id: user.value.id,
        name: profileDraft.value.name.trim(),
        email: profileDraft.value.email.trim(),
        avatar: profileDraft.value.avatar.trim()
      })
    });
    user.value = updatedUser;
    syncProfileDraft();
    writeStoredUser(updatedUser);
    isAvatarEditorOpen.value = false;
    notify('个人设置已保存');
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存失败');
  } finally {
    isSavingProfile.value = false;
  }
};

const saveWorkflowDefinition = async (workflow: WorkflowDefinition) => {
  if (!canManageCurrentWorkflow.value) {
    notify(workflowDefinition.value?.isBuiltIn ? '默认流程不可直接修改，请先新建自己的流程' : '只能修改自己创建的流程');
    return;
  }
  try {
    isSavingWorkflow.value = true;
    const saved = await apiRequest<WorkflowDefinition>(`/api/workflows/${workflow.key}`, {
      method: 'POST',
      body: JSON.stringify({
        ...workflow,
        updatedBy: user.value.name,
        updatedById: user.value.id
      })
    });
    workflowDefinitions.value = workflowDefinitions.value.map((item) =>
      item.key === saved.key ? saved : item
    );
    workflowDefinition.value = JSON.parse(JSON.stringify(saved));
    selectedWorkflowKey.value = saved.key;
    notify('流程定义已保存并立即生效');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '流程保存失败');
  } finally {
    isSavingWorkflow.value = false;
  }
};

const activateWorkflowDefinition = async () => {
  if (!workflowDefinition.value) return;

  try {
    isSavingWorkflow.value = true;
    const activated = await apiRequest<WorkflowDefinition>(`/api/workflows/${workflowDefinition.value.key}/activate`, {
      method: 'POST',
      body: JSON.stringify({ updatedBy: user.value.name })
    });
    workflowDefinitions.value = workflowDefinitions.value.map((item) => ({
      ...item,
      isTaskWorkflow: item.key === activated.key
    }));
    workflowDefinition.value = {
      ...workflowDefinition.value,
      isTaskWorkflow: true
    };
    notify('已将该流程应用为任务看板的当前业务流程');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '启用流程失败');
  } finally {
    isSavingWorkflow.value = false;
  }
};

const deleteWorkflowDefinition = async () => {
  if (!workflowDefinition.value) return;
  if (!canManageCurrentWorkflow.value) {
    notify(workflowDefinition.value.isBuiltIn ? '默认流程不可删除，请先新建自己的流程' : '只能删除自己创建的流程');
    return;
  }
  if (workflowDefinition.value.isTaskWorkflow) {
    notify('当前任务看板正在使用这套流程，请先应用其他流程后再删除');
    return;
  }
  if (!confirm(`确认删除流程「${workflowDefinition.value.name}」吗？删除后不会再出现在流程列表中。`)) return;

  try {
    isSavingWorkflow.value = true;
    const deletingKey = workflowDefinition.value.key;
    await apiRequest(`/api/workflows/${deletingKey}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: user.value.id, userName: user.value.name })
    });
    workflowDefinitions.value = workflowDefinitions.value.filter((item) => item.key !== deletingKey);
    const nextWorkflow =
      workflowDefinitions.value.find((item) => item.isTaskWorkflow) ||
      workflowDefinitions.value[0] ||
      null;
    workflowDefinition.value = nextWorkflow ? JSON.parse(JSON.stringify(nextWorkflow)) : null;
    selectedWorkflowKey.value = nextWorkflow?.key || '';
    notify('流程已删除');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '流程删除失败');
  } finally {
    isSavingWorkflow.value = false;
  }
};

const openNewWorkflowModal = () => {
  workflowDraftMeta.value = {
    key: `workflow_${Date.now()}`,
    name: '新业务流程',
    description: '请补充这套流程的适用业务场景。'
  };
  isWorkflowModalOpen.value = true;
};

const createWorkflowDefinition = async () => {
  const key = workflowDraftMeta.value.key.trim();
  const name = workflowDraftMeta.value.name.trim();
  const description = workflowDraftMeta.value.description.trim();

  if (!key || !name) {
    return notify('请填写流程键和流程名称');
  }
  if (workflowDefinitions.value.some((item) => item.key === key)) {
    return notify('流程键已存在，请更换后再保存');
  }

  try {
    isSavingWorkflow.value = true;
    const draft = createDefaultWorkflowDraft(key, name, description || '请补充这套流程的适用业务场景。');
    const saved = await apiRequest<WorkflowDefinition>(`/api/workflows/${key}`, {
      method: 'POST',
      body: JSON.stringify({
        ...draft,
        updatedBy: user.value.name,
        updatedById: user.value.id
      })
    });

    workflowDefinitions.value = [...workflowDefinitions.value, saved];
    workflowDefinition.value = JSON.parse(JSON.stringify(saved));
    selectedWorkflowKey.value = saved.key;
    isWorkflowModalOpen.value = false;
    activeView.value = 'workflow';
    notify('新流程已创建并保存到数据库');
    await fetchAllData(user.value.id);
  } catch (error) {
    notify(error instanceof Error ? error.message : '流程创建失败');
  } finally {
    isSavingWorkflow.value = false;
  }
};

const downloadAnalytics = async () => {
  try {
    const response = await fetch('/api/analytics/export');
    if (!response.ok) throw new Error('导出失败');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `novaoffice-analytics-${today}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify('Excel 报表已生成');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Excel 导出失败');
  }
};

let pollInterval: any = null;

onMounted(() => {
  // Restore the last authenticated employee account.
  const savedUser = readStoredUser();
  if (savedUser) {
    const u = JSON.parse(savedUser);
    isLoggedIn.value = true;
    user.value = {
      ...user.value,
      ...u
    };
    syncProfileDraft();
    fetchAllData(u.id);
  } else {
    syncProfileDraft();
  }

  // Start polling for "real-time" sync
  pollInterval = setInterval(() => {
    if (isLoggedIn.value) fetchAllData(user.value.id);
  }, 5000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

watch(selectedWorkflowKey, (key) => {
  const matched = workflowDefinitions.value.find((workflow) => workflow.key === key);
  if (matched) {
    workflowDefinition.value = JSON.parse(JSON.stringify(matched));
  }
});

const handleLoginSuccess = (userData: any) => {
  isLoggedIn.value = true;
  user.value = userData;
  syncProfileDraft();
  writeStoredUser(userData);
  fetchAllData(userData.id);
};

const handleLogout = () => {
  isLoggedIn.value = false;
  syncProfileDraft();
  clearStoredUser();
};

// RBAC Permissions helper
const hasAccess = (module: string) => {
  const permissions: Record<string, string[]> = {
    'admin': ['dashboard', 'tasks', 'org', 'analytics', 'settings', 'management', 'workflow'],
    'manager': ['dashboard', 'tasks', 'org', 'analytics'],
    'member': ['dashboard', 'tasks']
  };
  return permissions[user.value.role]?.includes(module) || false;
};

watch(activeView, (view) => {
  if (view === 'approvals') {
    activeView.value = hasAccess('workflow') ? 'workflow' : 'dashboard';
  }
});

const setView = (view: View) => {
  if (view === 'management') {
    if (hasAccess('management')) {
      activeView.value = 'org';
      orgPanel.value = 'staff';
    }
    return;
  }

  if (view === 'org') {
    if (hasAccess('org')) {
      activeView.value = 'org';
      orgPanel.value = 'structure';
    }
    return;
  }

  if (hasAccess(view)) {
    activeView.value = view;
  }
};

const leaveWorkflowWorkspace = () => {
  setView(hasAccess('dashboard') ? 'dashboard' : 'tasks');
};

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};

const showTaskDetail = (task: any) => {
  selectedTask.value = task;
  isEditingTask.value = false;
  subAssigneeId.value = '';
  feedbackForm.value = { text: '', images: [] };
  const accessibleAssignments = task.assignments.filter((assignment: any) => user.value.role !== 'member' || assignment.assigneeId === user.value.id);
  feedbackAssignmentId.value = accessibleAssignments[0]?.id || '';
};
</script>

<template>
  <LoginView v-if="!isLoggedIn" @login="handleLoginSuccess" />
  <div v-else class="flex h-screen overflow-hidden bg-slate-50 font-sans">
    <!-- Toast Notification -->
    <div v-if="showToast" class="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4 duration-300">
       <div class="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
          <CheckCircle2 :size="18" class="text-green-400" />
          <span class="text-sm font-bold">{{ toastMessage }}</span>
       </div>
    </div>

    <!-- Task Detail Modal -->
    <div v-if="selectedTask" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
       <div class="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div class="p-8 border-b border-slate-100 flex justify-between items-start">
             <div>
                <span class="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase tracking-widest mb-2 inline-block">
                  {{ selectedTask.id }} | {{ selectedTask.sourceDepartment }} -> {{ selectedTask.targetDepartment }}
                </span>
                <h3 class="text-2xl font-bold text-slate-900">{{ selectedTask.title }}</h3>
             </div>
             <button @click="selectedTask = null" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X :size="24" class="text-slate-400" />
             </button>
          </div>

          <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
             <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">任务详情</h4>
                <p class="text-slate-600 leading-relaxed">{{ selectedTask.description }}</p>
             </div>

             <div class="rounded-2xl bg-slate-50 p-5 space-y-4">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">流程状态</p>
                    <p class="mt-1 text-lg font-bold text-slate-900">{{ getTaskStatusLabel(selectedTask) }}</p>
                  </div>
                  <span class="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600">
                    {{ selectedTask.sourceDepartment }} -> {{ selectedTask.targetDepartment }}
                  </span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div
                    v-for="(step, stepIndex) in visibleWorkflowSteps"
                    :key="step.id"
                    :class="[
                      'rounded-2xl border px-4 py-3',
                      isWorkflowStepDone(step, selectedTask) ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                    ]"
                  >
                    <p class="text-[10px] font-bold text-slate-400 uppercase">{{ stepIndex + 1 }}</p>
                    <p class="mt-1 text-sm font-bold text-slate-900">{{ getWorkflowNodeDisplayName(step) }}</p>
                    <p class="mt-1 text-xs text-slate-500">{{ workflowStepMeta(step, selectedTask) }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-3">
                  <template v-if="canApproveCurrentNode">
                    <button @click="handleTaskWorkflowAction(selectedTask.id, 'approve')" class="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">{{ currentApproveLabel }}</button>
                    <button v-if="canRejectCurrentNode" @click="handleTaskWorkflowAction(selectedTask.id, 'reject')" class="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700">驳回流程</button>
                  </template>
                </div>
             </div>

             <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="space-y-4">
                   <div class="flex items-center justify-between">
                      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">执行成员</h4>
                      <span class="text-[10px] text-slate-400 font-bold">{{ selectedTask.assignments.length }} 人</span>
                   </div>
                   <div v-if="selectedTask.assignments.length" class="space-y-3">
                      <div v-for="as in selectedTask.assignments" :key="as.id" class="bg-slate-50 p-4 rounded-2xl space-y-3">
                         <div class="flex items-start justify-between gap-3">
                            <div class="flex items-center gap-3">
                               <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                                  <UserIcon :size="20" class="text-slate-400" />
                               </div>
                               <div>
                                  <p class="text-sm font-bold text-slate-900">{{ as.assigneeName }}</p>
                                  <p class="text-[10px] text-blue-600 font-bold uppercase">{{ getAssignmentStatusLabel(as.status) }}</p>
                               </div>
                            </div>
                            <span v-if="as.completedAt" class="text-[10px] text-slate-400">{{ as.completedAt }}</span>
                         </div>
                         <p v-if="as.feedbackText" class="text-sm text-slate-600 leading-relaxed">{{ as.feedbackText }}</p>
                         <div v-if="as.attachments?.length" class="space-y-3">
                            <div
                              v-for="(attachment, fileIndex) in as.attachments"
                              :key="attachment + fileIndex"
                              class="rounded-xl border border-slate-200 bg-white p-3"
                            >
                              <div class="flex items-center gap-3">
                                <img
                                  v-if="isImageAttachment(attachment)"
                                  :src="attachment"
                                  class="h-14 w-14 rounded-lg object-cover border border-slate-200"
                                />
                                <div class="min-w-0 flex-1">
                                  <p class="text-xs font-bold text-slate-900">{{ getAttachmentLabel(attachment, fileIndex) }}</p>
                                  <p v-if="isTextAttachment(attachment)" class="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-3">
                                    {{ getAttachmentPreviewText(attachment) }}
                                  </p>
                                </div>
                                <a
                                  :href="attachment"
                                  target="_blank"
                                  :download="getAttachmentLabel(attachment, fileIndex)"
                                  class="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                >
                                  打开
                                </a>
                              </div>
                            </div>
                         </div>
                      </div>
                   </div>
                   <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
                      当前还没有指派到具体成员。
                   </div>

                   <div v-if="canAssignMembers" class="space-y-3 border-t border-slate-100 pt-4">
                      <h5 class="text-xs font-bold text-slate-400 uppercase tracking-widest">指派到部门成员</h5>
                      <div class="flex flex-col sm:flex-row gap-3">
                         <select v-model="subAssigneeId" class="flex-1 px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">选择 {{ selectedTask.targetDepartment }} 成员</option>
                            <option v-for="member in availableAssignees" :key="member.id" :value="member.id">
                              {{ member.name }} / {{ member.department }}
                            </option>
                         </select>
                         <button @click="handleAssignSubTask(selectedTask.id)" class="px-5 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800">
                            指派成员
                         </button>
                      </div>
                   </div>
                </div>

                <div class="space-y-4">
                   <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">任务信息</h4>
                   <div class="rounded-2xl bg-slate-50 p-4 space-y-4">
                      <div class="flex items-center justify-between">
                         <span class="text-xs text-slate-400 font-bold uppercase">截止日期</span>
                         <div class="flex items-center gap-2 text-slate-900 font-bold">
                            <Clock :size="18" class="text-orange-500" />
                            {{ selectedTask.dueDate }}
                         </div>
                      </div>
                      <div class="flex items-center justify-between">
                         <span class="text-xs text-slate-400 font-bold uppercase">任务状态</span>
                         <span class="text-sm font-bold text-slate-900">{{ getTaskStatusLabel(selectedTask) }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                         <span class="text-xs text-slate-400 font-bold uppercase">发起部门</span>
                         <span class="text-sm text-slate-600">{{ selectedTask.sourceDepartment }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                         <span class="text-xs text-slate-400 font-bold uppercase">承接部门</span>
                         <span class="text-sm text-slate-600">{{ selectedTask.targetDepartment }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                         <span class="text-xs text-slate-400 font-bold uppercase">发起审核</span>
                         <span class="text-sm text-slate-600">{{ selectedTask.sourceReviewer || '待处理' }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                         <span class="text-xs text-slate-400 font-bold uppercase">承接审核</span>
                         <span class="text-sm text-slate-600">{{ selectedTask.targetReviewer || '待处理' }}</span>
                      </div>
                   </div>
                </div>
             </div>

             <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">成员反馈</h4>
                <div v-if="availableFeedbackAssignments.length" class="rounded-2xl bg-slate-50 p-4 space-y-4">
                   <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="space-y-2">
                         <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">反馈成员</label>
                         <select v-model="feedbackAssignmentId" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">请选择反馈成员</option>
                            <option v-for="assignment in availableFeedbackAssignments" :key="assignment.id" :value="assignment.id">
                              {{ assignment.assigneeName }}
                            </option>
                         </select>
                      </div>
                      <div class="space-y-2">
                         <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">上传附件</label>
                         <input type="file" multiple @change="handleFeedbackFilesChange" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none" />
                      </div>
                   </div>
                   <textarea v-model="feedbackForm.text" placeholder="填写处理结果、风险说明或补充进展..." class="w-full min-h-[120px] px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500"></textarea>
                   <div v-if="feedbackForm.images.length" class="flex flex-wrap gap-3">
                      <div v-for="(file, index) in feedbackForm.images" :key="index" class="w-20">
                         <img v-if="file.startsWith('data:image')" :src="file" class="h-20 w-20 rounded-xl object-cover border border-slate-200" />
                         <a v-else :href="file" target="_blank" class="flex h-20 w-20 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-[10px] text-slate-500">
                            附件 {{ index + 1 }}
                         </a>
                      </div>
                   </div>
                   <div class="flex justify-end">
                      <button @click="handleSubmitFeedback(selectedTask.id, feedbackAssignmentId)" class="px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100">
                         提交反馈
                      </button>
                   </div>
                </div>
                <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
                   当前没有可提交反馈的成员分派记录。
                </div>
             </div>

             <div class="space-y-4">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">操作日志 (Traceability)</h4>
                <div class="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                   <div v-for="(log, idx) in selectedTask.logs" :key="idx" class="relative flex items-center gap-4 group">
                      <div class="w-10 h-10 rounded-full bg-white border-4 border-slate-50 flex items-center justify-center z-10 shadow-sm shrink-0">
                         <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                      </div>
                      <div class="flex-1 bg-slate-50 p-4 rounded-2xl group-hover:bg-blue-50 transition-colors">
                         <p class="text-sm font-bold text-slate-900">{{ formatLogAction(log.action) }}</p>
                         <div class="flex justify-between items-center mt-1">
                            <span class="text-[10px] text-slate-400 font-medium">操作人: {{ log.user }}</span>
                            <span class="text-[10px] text-slate-400 font-medium">{{ log.time }}</span>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
             <button v-if="canDeleteSelectedTask" @click="handleDeleteTask" class="px-5 py-3 text-sm font-bold text-red-600 hover:bg-white rounded-2xl transition-colors border border-red-200">删除任务</button>
             <button v-if="canEditSelectedTask" @click="openEditTask" class="px-5 py-3 text-sm font-bold text-slate-700 hover:bg-white rounded-2xl transition-colors border border-slate-200">编辑任务</button>
             <button @click="selectedTask = null" class="px-8 py-3 text-sm font-bold text-slate-600 hover:bg-white rounded-2xl transition-colors border border-slate-200">关闭详情</button>
          </div>
       </div>
    </div>

    <!-- Create Task Modal -->
    <div v-if="isCreateTaskModalOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
       <div class="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div class="p-8 border-b border-slate-100 flex justify-between items-center">
             <h3 class="text-xl font-bold text-slate-900">{{ isEditingTask ? '编辑任务' : '指派新任务' }}</h3>
             <button @click="isCreateTaskModalOpen = false" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X :size="20" class="text-slate-400" />
             </button>
          </div>
          <div class="p-8 space-y-6">
             <div class="space-y-2">
                <label class="text-xs font-bold text-slate-400 uppercase">任务标题</label>
                <input v-model="newTaskForm.title" placeholder="请输入清晰的任务描述..." class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
             <div class="space-y-2">
                <label class="text-xs font-bold text-slate-400 uppercase">任务说明</label>
                <textarea v-model="newTaskForm.description" placeholder="补充详细执行要求..." class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500 min-h-[100px]"></textarea>
             </div>
             <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                   <label class="text-xs font-bold text-slate-400 uppercase">执行部门</label>
                   <select v-model="newTaskForm.targetDepartment" class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500 appearance-none">
                      <option v-for="department in departmentNames" :key="department" :value="department">{{ department }}</option>
                   </select>
                </div>
                <div class="space-y-2">
                   <label class="text-xs font-bold text-slate-400 uppercase">优先级</label>
                   <select v-model="newTaskForm.priority" class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500 appearance-none">
                      <option value="low">普通</option>
                      <option value="medium">较高</option>
                      <option value="high">紧急</option>
                   </select>
                </div>
             </div>
             <div class="space-y-2">
                <label class="text-xs font-bold text-slate-400 uppercase">截止日期</label>
                <input v-model="newTaskForm.dueDate" type="date" class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500" />
             </div>
          </div>
          <div class="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
             <button @click="isCreateTaskModalOpen = false; isEditingTask = false" class="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl">取消</button>
             <button @click="handleCreateTask" class="px-6 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">{{ isEditingTask ? '保存修改' : '立即发布' }}</button>
          </div>
       </div>
    </div>
    <div v-if="isOrgModalOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
       <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div class="p-6 border-b border-slate-100 flex justify-between items-center">
             <div>
                <h3 class="text-lg font-bold text-slate-900">{{ editingDept.id ? '编辑部门' : '新增部门' }}</h3>
                <p class="text-xs text-slate-400 mt-1" v-if="editingDept.parentId">上级部门：{{ findDepartmentById(orgData, editingDept.parentId)?.name }}</p>
             </div>
             <button @click="isOrgModalOpen = false" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X :size="20" class="text-slate-400" />
             </button>
          </div>
          <div class="p-6 space-y-4">
             <div class="space-y-2">
                <label class="text-xs font-bold text-slate-400 uppercase">部门名称</label>
                <input v-model="editingDept.name" class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="请输入部门名称" />
             </div>
             <div class="space-y-2">
                <label class="text-xs font-bold text-slate-400 uppercase">负责人</label>
                <input v-model="editingDept.manager" class="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="请输入负责人姓名" />
             </div>
             <div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                成员数量由员工归属实时汇总，保存后树状列表和架构图会同步刷新。</div>
          </div>
          <div class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
             <button @click="isOrgModalOpen = false" class="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl">取消</button>
             <button @click="saveDepartment" class="px-6 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100">保存</button>
          </div>
       </div>
    </div>

    <div v-if="isWorkflowModalOpen" class="fixed inset-0 z-[180] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
      <div class="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden">
        <div class="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 class="text-lg font-bold text-slate-900">新建业务流程</h3>
            <p class="text-sm text-slate-500 mt-1">创建一套新的流程草稿，保存后将持久化到数据库。</p>
          </div>
          <button @click="isWorkflowModalOpen = false" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X :size="20" class="text-slate-400" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">流程键</label>
            <input v-model="workflowDraftMeta.key" class="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-1 focus:ring-blue-500" placeholder="例如 demand_to_delivery" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">流程名称</label>
            <input v-model="workflowDraftMeta.name" class="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-1 focus:ring-blue-500" placeholder="例如 需求交付流程" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">流程说明</label>
            <textarea v-model="workflowDraftMeta.description" class="w-full min-h-[100px] px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-1 focus:ring-blue-500" placeholder="说明这套流程适用于哪些业务单据或业务场景"></textarea>
          </div>
        </div>
        <div class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button @click="isWorkflowModalOpen = false" class="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl">取消</button>
          <button
            @click="createWorkflowDefinition"
            :disabled="isSavingWorkflow"
            class="px-6 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 disabled:opacity-60"
          >
            {{ isSavingWorkflow ? '创建中...' : '创建并保存' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="isWorkflowFullscreen" class="fixed inset-0 z-[130] bg-slate-50 flex flex-col">
      <div class="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div>
          <h3 class="text-lg font-bold text-slate-900">流程全屏编辑</h3>
          <p class="text-xs text-slate-500">{{ workflowDefinition?.name }} / {{ workflowDefinition?.key }}</p>
        </div>
        <div class="flex items-center gap-3">
          <select
            v-model="selectedWorkflowKey"
            class="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600 outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option v-for="workflow in workflowDefinitions" :key="workflow.key" :value="workflow.key">
              {{ workflow.name }} / {{ workflow.key }}
            </option>
          </select>
          <button @click="openNewWorkflowModal" class="px-4 py-2 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-50">
            新建流程
          </button>
          <button
            @click="deleteWorkflowDefinition"
            :disabled="!workflowDefinition || !canManageCurrentWorkflow || workflowDefinition.isTaskWorkflow || isSavingWorkflow"
            class="px-4 py-2 bg-white border border-red-100 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            删除流程
          </button>
          <button
            @click="activateWorkflowDefinition"
            :disabled="!workflowDefinition || workflowDefinition.isTaskWorkflow || isSavingWorkflow"
            class="px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60 disabled:hover:bg-blue-50"
          >
            {{ workflowDefinition?.isTaskWorkflow ? '当前任务流程' : '应用到任务看板' }}
          </button>
          <button @click="isWorkflowFullscreen = false" class="px-4 py-2 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800">
            退出全屏
          </button>
          </div>
        </div>
        <div class="flex-1 overflow-hidden p-4">
          <WorkflowDesigner
            class="h-full"
            :workflow="workflowDefinition"
            :saving="isSavingWorkflow"
          @save="saveWorkflowDefinition"
        />
      </div>
    </div>

    <!-- Sidebar -->
    <aside 
      v-if="isSidebarOpen && activeView !== 'workflow'"
      class="w-[260px] bg-white border-r border-slate-200 flex flex-col z-50 overflow-y-auto"
    >
      <div class="p-6">
        <div class="flex items-center gap-3 mb-8">
          <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <LayoutDashboard :size="24" />
          </div>
          <h1 class="text-xl font-bold text-slate-900 tracking-tight">NovaOffice</h1>
        </div>

        <nav class="space-y-1">
          <button @click="setView('dashboard')" :class="['nav-item', activeView === 'dashboard' ? 'active' : '']">
            <LayoutDashboard :size="20" />
            <span>仪表盘</span>
          </button>
          <button 
            v-if="hasAccess('tasks')" 
            @click="setView('tasks')" 
            :class="['nav-item', activeView === 'tasks' ? 'active' : '']"
          >
            <ClipboardList :size="20" />
            <span>任务看板</span>
          </button>
          <button 
            v-if="hasAccess('org')" 
            @click="setView('org')" 
            :class="['nav-item', activeView === 'org' ? 'active' : '']"
          >
            <Users :size="20" />
            <span>组织架构</span>
          </button>
        </nav>

        <div class="mt-8 pt-8 border-t border-slate-100">
          <h3 class="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">个人应用</h3>
          <nav class="space-y-1">
            <button 
              v-if="hasAccess('analytics')" 
              @click="setView('analytics')" 
              :class="['nav-item', activeView === 'analytics' ? 'active' : '']"
            >
              <TrendingUp :size="20" />
              <span>数据分析</span>
            </button>
            <button 
              v-if="hasAccess('settings')" 
              @click="setView('settings')" 
              :class="['nav-item', activeView === 'settings' ? 'active' : '']"
            >
              <Settings :size="20" />
              <span>系统设置</span>
            </button>
            <button
              v-if="hasAccess('workflow')"
              @click="setView('workflow')"
              class="nav-item"
            >
              <GitBranch :size="20" />
              <span>流程设计</span>
            </button>
            <button @click="handleLogout" class="nav-item group hover:text-red-600">
               <LogOut :size="20" class="group-hover:text-red-500" />
               <span>退出登录</span>
            </button>
          </nav>
        </div>
      </div>

      <div class="mt-auto p-6 relative">
        <div class="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
          <img 
            :src="user.avatar" 
            :alt="user.name" 
            class="w-10 h-10 rounded-full border-2 border-white shadow-sm"
            referrerpolicy="no-referrer"
          />
          <div class="flex-1 overflow-hidden">
            <p class="text-sm font-semibold truncate">{{ user.name }}</p>
            <p class="text-xs text-slate-500 truncate flex items-center gap-1">
               <span class="px-1 bg-blue-100 text-blue-600 rounded-sm text-[10px] font-bold">{{ roleLabelMap[user.role] }}</span>
               {{ user.department }}
            </p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col relative overflow-hidden">
      <!-- Topbar -->
      <header v-if="activeView !== 'workflow'" class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 sticky top-0 z-40">
        <div class="flex items-center gap-4">
          <button 
            @click="toggleSidebar"
            class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <X v-if="isSidebarOpen" :size="20" />
            <Menu v-else :size="20" />
          </button>
        </div>

        <div class="flex items-center gap-3">
          <button class="p-2 hover:bg-slate-100 rounded-full text-slate-500 relative">
            <Bell :size="20" />
            <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
          <div class="h-6 w-px bg-slate-200 mx-2"></div>
          <button @click="isCreateTaskModalOpen = true" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-200">
            <Plus :size="18" />
            <span>{{ user.role === 'member' ? '提交需求' : '新建任务指派' }}</span>
          </button>
        </div>
      </header>

      <!-- View Content -->
      <div :class="activeView === 'workflow' ? 'flex-1 h-full' : 'flex-1 overflow-y-auto p-8 scroll-smooth h-full'">
        <!-- Dashboard View -->
        <div v-if="activeView === 'dashboard'" class="max-w-6xl mx-auto space-y-8">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="text-2xl font-bold text-slate-900">下午好，{{ user.name }}</h2>
              <p class="text-slate-500">
                <span v-if="user.role === 'admin'">您当前拥有系统最高管理权限。</span>
                <span v-else-if="user.role === 'manager'">您正在管理 {{ user.department }} 的日常运营。</span>
                <span v-else>您今天有 {{ visibleTasks.filter(t => t.status !== 'completed').length }} 项待处理的任务。</span>
              </p>
            </div>
            <div class="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-400">
               <History :size="16" />
               最近登录 {{ new Date().toLocaleDateString() }}
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div 
              v-for="stat in stats" 
              :key="stat.label"
              :class="['stat-card', stat.color]"
            >
              <div class="flex justify-between items-start mb-4">
                <div class="p-3 bg-white rounded-2xl shadow-sm">
                  <component :is="stat.icon" class="w-5 h-5" :class="'text-'+stat.color+'-500'" />
                </div>
                <span class="text-xs font-semibold text-slate-400">{{ stat.trend }}</span>
              </div>
              <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{{ stat.label }}</p>
                <p class="text-4xl font-bold text-slate-900 tracking-tighter">{{ stat.value }}</p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-6">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle :size="20" class="text-orange-500" />
                  待办任务追踪
                </h3>
              </div>
              <div class="space-y-4">
                <div v-for="task in visibleTasks" :key="task.id" @click="showTaskDetail(task)" class="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-200 transition-all cursor-pointer group">
                  <div class="flex justify-between items-start mb-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-400">
                      {{ task.id }} | {{ task.sourceDepartment }} -> {{ task.targetDepartment }}
                    </span>
                    <span class="text-xs text-slate-400">{{ task.dueDate }}</span>
                  </div>
                  <h4 class="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{{ task.title }}</h4>
                  <div class="mt-4 p-3 bg-slate-50 rounded-xl">
                     <p class="text-xs font-bold text-slate-400 uppercase mb-2">最新动态</p>
                     <div v-if="task.logs.length > 0" class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span class="text-xs text-slate-600 font-medium">{{ task.logs[task.logs.length-1].action }}</span>
                        <span class="text-[10px] text-slate-400">by {{ task.logs[task.logs.length-1].user }}</span>
                     </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="space-y-6">
              <div class="bg-slate-900 rounded-3xl p-6 text-white overflow-hidden relative">
                 <h3 class="text-lg font-bold mb-4">RBAC 权限说明</h3>
                 <p class="text-sm text-slate-400 leading-relaxed mb-4">
                   系统根据 <b>Admin/Manager/Member</b> 角色自动过滤功能模块与 API 权限。</p>
                 <div class="space-y-2">
                    <div class="flex items-center gap-2 text-xs">
                       <CheckCircle2 :size="14" class="text-green-500" />
                       <span>跨部门任务指派 (Manager+)</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs">
                       <CheckCircle2 :size="14" class="text-green-500" />
                       <span>组织架构树展示 (Admin/Manager)</span>
                    </div>
                 </div>
              </div>
              
              <div class="bg-blue-600 rounded-3xl p-6 text-white relative overflow-hidden group">
                 <div class="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform">
                   <TrendingUp :size="160" />
                 </div>
                 <h3 class="text-lg font-bold mb-2">年度效能分析</h3>
                 <p class="text-xs text-blue-100 mb-6">已生成 2026 年度部门达成率报告</p>
                 <button class="w-full bg-white text-blue-600 py-3 rounded-2xl text-sm font-bold hover:bg-blue-50 transition-colors">
                     查看报告
                 </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tasks Kanban View -->
        <div v-else-if="activeView === 'tasks'" class="h-full flex flex-col space-y-6">
          <div class="max-w-6xl w-full mx-auto shrink-0">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-2xl font-bold text-slate-900">任务看板</h2>
                <p class="text-slate-500">多级追踪：上级指派 -> 团队接收 -> 成员执行</p>
              </div>
              <div class="flex items-center gap-3">
                 <div class="flex bg-white border border-slate-200 rounded-xl p-1">
                    <button 
                      @click="taskViewMode = 'kanban'" 
                      :class="['px-4 py-1.5 text-xs font-bold rounded-lg transition-all', taskViewMode === 'kanban' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600']"
                    >看板</button>
                    <button 
                      @click="taskViewMode = 'list'" 
                      :class="['px-4 py-1.5 text-xs font-bold rounded-lg transition-all', taskViewMode === 'list' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600']"
                    >列表</button>
                    <button 
                      @click="taskViewMode = 'gantt'" 
                      :class="['px-4 py-1.5 text-xs font-bold rounded-lg transition-all', taskViewMode === 'gantt' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600']"
                    >甘特图</button>
                 </div>
              </div>
            </div>
          </div>
          
          <div class="max-w-full w-full mx-auto flex-1 min-h-0">
             <div v-if="taskViewMode === 'kanban'" class="h-full">
                <KanbanBoard :tasks="visibleTasks" @card-click="showTaskDetail" />
             </div>
             
             <!-- List View -->
             <div v-else-if="taskViewMode === 'list'" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm h-full flex flex-col">
                <div class="overflow-y-auto flex-1 custom-scrollbar">
                   <table class="w-full text-left border-collapse">
                     <thead>
                       <tr class="bg-slate-50/50 border-bottom border-slate-200">
                         <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">任务名称</th>
                         <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">责任部门</th>
                         <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">截止日期</th>
                         <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">优先级</th>
                       </tr>
                     </thead>
                     <tbody class="divide-y divide-slate-100 font-sans">
                       <tr v-for="task in visibleTasks" :key="task.id" @click="showTaskDetail(task)" class="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                         <td class="px-6 py-4">
                           <div class="flex items-center gap-3">
                             <div :class="['w-2 h-2 rounded-full', task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-orange-500' : 'bg-blue-500']"></div>
                             <span class="text-sm font-bold text-slate-900">{{ task.title }}</span>
                           </div>
                         </td>
                         <td class="px-6 py-4 text-sm text-slate-500">{{ task.targetDepartment }}</td>
                         <td class="px-6 py-4 text-sm text-slate-500">{{ task.dueDate }}</td>
                         <td class="px-6 py-4 text-right">
                            <span :class="['px-2 py-1 rounded text-[10px] font-bold uppercase', 
                             task.priority === 'high' ? 'bg-red-50 text-red-600' : task.priority === 'medium' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600']">
                              {{ task.priority === 'high' ? '紧急' : task.priority === 'medium' ? '较高' : '普通' }}
                            </span>
                         </td>
                       </tr>
                     </tbody>
                   </table>
                </div>
             </div>

             <!-- Simple Gantt View Placeholder -->
             <div v-else-if="taskViewMode === 'gantt'" class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm h-full overflow-hidden flex flex-col">
                <div class="flex-1 overflow-auto custom-scrollbar">
                   <div class="min-w-[800px] space-y-6">
                      <div class="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-4">
                         <div class="w-48">任务名称</div>
                         <div class="flex-1 grid grid-cols-7 gap-1 text-center">
                            <div v-for="d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="d">{{ d }}</div>
                         </div>
                      </div>
                      <div v-for="(task, i) in visibleTasks" :key="task.id" class="flex items-center gap-4">
                         <div class="w-48 text-sm font-bold text-slate-700 truncate">{{ task.title }}</div>
                         <div class="flex-1 grid grid-cols-7 gap-1 h-6">
                            <div 
                              class="bg-blue-600 rounded-full shadow-sm shadow-blue-200"
                              :style="{ gridColumn: `${(i % 5) + 1} / span 3` }"
                            ></div>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>

        <!-- Org Workspace -->
        <div v-else-if="activeView === 'org'" class="max-w-6xl mx-auto space-y-8 h-full flex flex-col">
          <div class="flex justify-between items-center shrink-0 gap-4 flex-wrap">
            <div>
              <h2 class="text-2xl font-bold text-slate-900">{{ orgPanel === 'staff' ? '员工管理' : '数字化组织架构' }}</h2>
              <p class="text-slate-500">{{ orgPanel === 'staff' ? '统一管理员工信息、部门归属与角色权限。' : '组织维护、部门管理和员工管理在同一个工作区完成。' }}</p>
            </div>
            <div class="flex items-center gap-3 flex-wrap justify-end">
              <template v-if="orgPanel === 'structure'">
                <div class="flex bg-white border border-slate-200 rounded-xl p-1">
                   <button 
                     @click="orgViewMode = 'chart'" 
                     :class="['px-4 py-1.5 text-xs font-bold rounded-lg transition-all', orgViewMode === 'chart' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600']"
                   >架构图</button>
                   <button 
                     @click="orgViewMode = 'tree'" 
                     :class="['px-4 py-1.5 text-xs font-bold rounded-lg transition-all', orgViewMode === 'tree' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600']"
                   >树状列表</button>
                </div>
                <button v-if="user.role === 'admin'" @click="openAddDepartment()" class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                  新增部门
                </button>
                <button v-if="user.role === 'admin'" @click="orgPanel = 'staff'" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800">
                  管理员工
                </button>
              </template>
              <template v-else>
                <button @click="orgPanel = 'structure'" class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                  返回组织架构
                </button>
              </template>
            </div>
          </div>

          <div v-if="orgPanel === 'staff'" class="flex-1 min-h-0">
            <ManagementView @changed="fetchAllData(user.id)" />
          </div>

          <div v-else class="flex-1 min-h-0 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div v-if="filteredOrgData.length === 0" class="flex-1 flex items-center justify-center text-sm text-slate-400">
              暂无可展示的组织或员工数据。
            </div>
            <div v-else-if="orgViewMode === 'tree'" class="p-8 overflow-y-auto custom-scrollbar h-full">
              <OrgTree 
                v-for="root in filteredOrgData" 
                :key="root.id" 
                :node="root" 
                :level="0" 
                :adminMode="user.role === 'admin'"
                @add="openAddDepartment"
                @edit="openEditDepartment"
                @delete="deleteDepartment"
              />
            </div>
            <div v-else class="h-full bg-slate-50/30">
              <OrgChart :data="filteredOrgData" />
            </div>
          </div>
        </div>

        <div v-else-if="activeView === 'workflow'" class="h-full flex flex-col overflow-hidden">
          <WorkflowDesigner
            class="flex-1 min-h-0 overflow-hidden"
            :workflow="workflowDefinition"
            :saving="isSavingWorkflow"
            header-title="流程设计"
            :header-subtitle="`当前任务看板使用：${activeTaskWorkflow?.name || '跨部门任务流程'}`"
            @save="saveWorkflowDefinition"
          >
            <template #header-actions>
              <button @click="leaveWorkflowWorkspace" class="px-4 py-2 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                返回工作台
              </button>
              <select
                v-model="selectedWorkflowKey"
                class="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option v-for="workflow in workflowDefinitions" :key="workflow.key" :value="workflow.key">
                  {{ workflow.name }} / {{ workflow.key }}
                </option>
              </select>
              <button @click="openNewWorkflowModal" class="px-4 py-2 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                新建流程
              </button>
              <button
                @click="deleteWorkflowDefinition"
                :disabled="!workflowDefinition || !canManageCurrentWorkflow || workflowDefinition.isTaskWorkflow || isSavingWorkflow"
                class="px-4 py-2 bg-white border border-red-100 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                删除流程
              </button>
              <button
                @click="activateWorkflowDefinition"
                :disabled="!workflowDefinition || workflowDefinition.isTaskWorkflow || isSavingWorkflow"
                class="px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60 disabled:hover:bg-blue-50"
              >
                {{ workflowDefinition?.isTaskWorkflow ? '当前任务流程' : '应用到任务看板' }}
              </button>
            </template>
          </WorkflowDesigner>
        </div>

        <!-- Analytics View -->
        <div v-else-if="activeView === 'analytics'" class="max-w-7xl mx-auto space-y-6">
          <div class="flex justify-between items-center gap-4 flex-wrap">
            <div>
              <h2 class="text-2xl font-bold text-slate-900">数据分析与报表</h2>
              <p class="text-slate-500">{{ analytics?.yearlySummary || '2026 年度研发效能与跨部门协同分析。' }}</p>
            </div>
            <button @click="downloadAnalytics" class="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
               <FileCheck :size="18" />
               导出 Excel
            </button>
          </div>

          <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div v-for="card in analyticsStatusCards" :key="card.label" class="bg-white border border-slate-200 rounded-3xl p-5">
              <p class="text-xs font-bold text-slate-400 mb-3">{{ card.label }}</p>
              <div :class="['inline-flex px-3 py-1 rounded-2xl text-2xl font-black', card.color]">{{ card.value }}</div>
              <p class="mt-3 text-xs text-slate-500">{{ card.hint }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
             <div class="xl:col-span-2 bg-white p-6 rounded-3xl border border-slate-200">
                <div class="flex items-center justify-between mb-6">
                  <div>
                    <h3 class="text-lg font-bold">近 7 日工作量</h3>
                    <p class="text-xs text-slate-400">按任务截止日期、审批创建时间实时汇总</p>
                  </div>
                  <span class="text-sm font-bold text-green-600">完成率 {{ analytics?.averageCompletionRate || 0 }}%</span>
                </div>
                <div class="h-64 flex items-end gap-3 border-b border-slate-100 pb-4">
                  <div v-for="point in analytics?.dailyWorkload || []" :key="point.label" class="flex-1 flex flex-col items-center gap-2">
                    <div class="w-full rounded-t-2xl bg-blue-500/90 min-h-[8px] transition-all" :style="{ height: `${Math.max(8, (point.value / analyticsMaxDailyWorkload) * 210)}px` }"></div>
                    <span class="text-[11px] font-bold text-slate-400">{{ point.label }}</span>
                    <span class="text-xs font-black text-slate-700">{{ point.value }}</span>
                  </div>
                </div>
             </div>

             <div class="bg-white p-6 rounded-3xl border border-slate-200">
                <h3 class="text-lg font-bold mb-1">部门负载分布</h3>
                <p class="text-xs text-slate-400 mb-6">按任务归属部门实时计算</p>
                <div class="grid grid-cols-1 gap-4">
                   <div v-for="d in analyticsLoadBars" :key="d.name" class="space-y-2">
                      <div class="flex justify-between text-xs font-bold">
                        <span>{{ d.name }}</span>
                        <span>{{ d.val }}%</span>
                      </div>
                      <div class="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div :class="['h-full rounded-full transition-all duration-1000', d.color]" :style="{ width: d.val + '%' }"></div>
                      </div>
                   </div>
                   <p v-if="!analyticsLoadBars.length" class="text-sm text-slate-400">暂无部门任务负载。</p>
                </div>
             </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <div class="p-6 border-b border-slate-100">
                <h3 class="text-lg font-bold">部门实时统计</h3>
                <p class="text-xs text-slate-400">成员数、任务量、完成率来自数据库</p>
              </div>
              <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-xs text-slate-400">
                  <tr>
                    <th class="px-5 py-3">部门</th>
                    <th class="px-5 py-3">成员</th>
                    <th class="px-5 py-3">任务</th>
                    <th class="px-5 py-3">进行中</th>
                    <th class="px-5 py-3">完成率</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="dept in analytics?.departmentStats || []" :key="dept.name">
                    <td class="px-5 py-4 font-bold text-slate-800">{{ dept.name }}</td>
                    <td class="px-5 py-4">{{ dept.memberCount }}</td>
                    <td class="px-5 py-4">{{ dept.totalTasks }}</td>
                    <td class="px-5 py-4">{{ dept.activeTasks }}</td>
                    <td class="px-5 py-4 font-bold text-blue-600">{{ dept.completionRate }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <div class="p-6 border-b border-slate-100">
                <h3 class="text-lg font-bold">员工工作量</h3>
                <p class="text-xs text-slate-400">按任务指派记录实时汇总</p>
              </div>
              <div class="divide-y divide-slate-100">
                <div v-for="employee in analyticsTopEmployees" :key="`${employee.name}-${employee.department}`" class="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p class="font-bold text-slate-800">{{ employee.name }}</p>
                    <p class="text-xs text-slate-400">{{ employee.department }} / {{ employee.role }}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-black text-slate-900">{{ employee.totalAssignments }} 项</p>
                    <p class="text-xs text-slate-400">完成 {{ employee.completedAssignments }} / 进行 {{ employee.activeAssignments }}</p>
                  </div>
                </div>
                <p v-if="!analyticsTopEmployees.length" class="p-6 text-sm text-slate-400">暂无员工指派数据。</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Approvals View -->
        <div v-else-if="activeView === 'approvals'" class="max-w-6xl mx-auto space-y-6">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="text-2xl font-bold text-slate-900">流程中心</h2>
              <p class="text-slate-500">统一处理请假、报销、行政申请。当前显示 {{ filteredApprovals.length }} 条记录。</p>
            </div>
            <div class="flex bg-white border border-slate-200 rounded-xl p-1">
               <button
                 v-for="tab in approvalFilterTabs"
                 :key="tab.key"
                 @click="approvalFilter = tab.key"
                 :class="[
                   'px-4 py-1.5 text-xs font-bold rounded-lg transition-colors',
                   approvalFilter === tab.key ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'
                 ]"
               >
                 {{ tab.label }}
               </button>
            </div>
          </div>

          <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50/50 border-bottom border-slate-200">
                  <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">标题 / 类型</th>
                  <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">申请人</th>
                  <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">提交日期</th>
                  <th class="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">处理状态</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-sans">
                <tr v-for="approval in filteredApprovals" :key="approval.id" class="hover:bg-slate-50/50 transition-colors group">
                  <td class="px-6 py-5">
                    <div class="flex items-center gap-3">
                       <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {{ approval.type[0] }}
                       </div>
                       <div>
                         <p class="text-sm font-bold text-slate-900">{{ approval.title }}</p>
                         <p class="text-xs text-slate-400">{{ approval.type }}申请</p>
                       </div>
                    </div>
                  </td>
                  <td class="px-6 py-5 text-sm font-medium text-slate-600">{{ approval.requester }}</td>
                  <td class="px-6 py-5 text-sm text-slate-400">{{ approval.createdAt }}</td>
                  <td class="px-6 py-5 text-right">
                    <div class="flex items-center justify-end gap-2">
                       <template v-if="approval.status === 'pending'">
                          <button @click="handleApprovalPersist(approval.id, 'approved')" class="px-3 py-1.5 text-[10px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">同意</button>
                          <button @click="handleApprovalPersist(approval.id, 'rejected')" class="px-3 py-1.5 text-[10px] font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">驳回</button>
                       </template>
                      <span v-else :class="['px-2 py-1 rounded text-[10px] font-bold uppercase', 
                       approval.status === 'approved' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600']">
                        {{ approval.status === 'approved' ? '已通过' : '已驳回' }}
                      </span>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredApprovals.length === 0">
                  <td colspan="4" class="px-6 py-12 text-center text-sm text-slate-400">
                    当前筛选条件下暂无审批记录。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Settings View -->
        <div v-else-if="activeView === 'settings'" class="max-w-2xl mx-auto space-y-8 pb-12">
          <div class="text-center py-6">
             <div class="relative inline-block">
                <img :src="profileDraft.avatar || user.avatar" class="w-24 h-24 rounded-3xl border-4 border-white shadow-2xl mx-auto object-cover" />
                <button @click="isAvatarEditorOpen = !isAvatarEditorOpen" class="absolute -bottom-2 -right-2 bg-blue-600 text-white p-2 rounded-xl shadow-lg">
                   <Plus :size="16" />
                </button>
             </div>
             <h2 class="mt-4 text-xl font-bold text-slate-900">{{ user.name }}</h2>
             <p class="text-slate-400 text-sm">{{ user.role }} | {{ user.department }}</p>
          </div>

          <div class="bg-white rounded-3xl border border-slate-200 p-8 space-y-6 shadow-sm">
             <h3 class="text-lg font-bold border-b border-slate-100 pb-4">基础设置</h3>
             <div v-if="isAvatarEditorOpen" class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <label class="text-xs font-bold text-slate-500 uppercase">头像地址</label>
                <input
                  v-model="profileDraft.avatar"
                  type="url"
                  placeholder="https://example.com/avatar.png"
                  class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p class="text-xs text-slate-400">支持可公开访问的图片 URL。保存修改后立即生效。</p>
             </div>
             <div class="grid grid-cols-2 gap-6">
                <div class="space-y-2">
                   <label class="text-xs font-bold text-slate-400 uppercase">中文姓名</label>
                   <input v-model="profileDraft.name" class="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div class="space-y-2">
                   <label class="text-xs font-bold text-slate-400 uppercase">所属部门</label>
                   <input v-model="user.department" disabled class="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm text-slate-400" />
                </div>
                <div class="space-y-2 col-span-2">
                   <label class="text-xs font-bold text-slate-400 uppercase">联系邮箱</label>
                   <input v-model="profileDraft.email" type="email" placeholder="example@novaoffice.com" class="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
             </div>
             <div class="pt-6 flex justify-end gap-3">
                <button @click="saveProfile" :disabled="isSavingProfile" class="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-60">{{ isSavingProfile ? '保存中...' : '保存修改' }}</button>
             </div>
          </div>
        </div>

        <!-- Coming Soon -->
        <div v-else class="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-6 transition-transform hover:scale-110">
            <Settings :size="40" />
          </div>
          <h2 class="text-3xl font-bold text-slate-900 mb-2">{{ activeView }} 模块</h2>
          <p class="text-slate-500 max-w-sm">正在开发中，敬请期待。</p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@import "tailwindcss";

.nav-item {
  @apply w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900;
}
.nav-item.active {
  @apply bg-blue-50 text-blue-600 font-semibold shadow-sm shadow-blue-50;
}
.nav-item.active :deep(svg) {
  @apply text-blue-600;
}
.badge {
  @apply bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center;
}
.stat-card {
  @apply p-6 rounded-3xl border border-white hover:shadow-xl hover:-translate-y-0.5 transition-all bg-gradient-to-br from-slate-50 to-white;
}
.stat-card.orange { @apply from-orange-50 border-orange-100; }
.stat-card.blue { @apply from-blue-50 border-blue-100; }
.stat-card.green { @apply from-green-50 border-green-100; }
.stat-card.purple { @apply from-purple-50 border-purple-100; }

.text-orange-500 { color: #f97316; }
.text-blue-500 { color: #3b82f6; }
.text-green-500 { color: #22c55e; }
.text-purple-500 { color: #a855f7; }
</style>


