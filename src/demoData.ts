import type { AnalyticsResponse, Approval, Department, MainTask, User, WorkflowDefinition } from './types';

export const demoUsers: User[] = [
  {
    id: 'u2',
    name: 'CEO',
    role: 'admin',
    department: '董事会',
    avatar: 'https://picsum.photos/seed/admin/128/128',
    email: 'admin@novaoffice.com'
  },
  {
    id: 'u1',
    name: '张经理',
    role: 'manager',
    department: '运维部',
    avatar: 'https://picsum.photos/seed/manager/128/128',
    email: 'manager@novaoffice.com'
  },
  {
    id: 'u6',
    name: '李主管',
    role: 'manager',
    department: '开发部',
    avatar: 'https://picsum.photos/seed/dev-manager/128/128',
    email: 'dev-manager@novaoffice.com'
  },
  {
    id: 'u3',
    name: '运维张三',
    role: 'member',
    department: '运维部',
    avatar: 'https://picsum.photos/seed/m1/128/128',
    email: 'ops1@novaoffice.com'
  },
  {
    id: 'u4',
    name: '运维李四',
    role: 'member',
    department: '运维部',
    avatar: 'https://picsum.photos/seed/m2/128/128',
    email: 'ops2@novaoffice.com'
  },
  {
    id: 'u5',
    name: '开发小王',
    role: 'member',
    department: '开发部',
    avatar: 'https://picsum.photos/seed/m3/128/128',
    email: 'dev1@novaoffice.com'
  }
];

export const demoTasks: MainTask[] = [
  {
    id: 'mt_demo_001',
    title: 'Q2 云服务器环境扩容',
    description: '开发部申请运维部完成负载均衡扩容与主机组变更。',
    sourceDepartment: '开发部',
    targetDepartment: '运维部',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-04-30',
    sourceReviewer: '李主管',
    targetReviewer: '张经理',
    assignments: [
      {
        id: 'as_demo_001',
        assigneeId: 'u3',
        assigneeName: '运维张三',
        status: 'in-progress',
        feedbackText: '已完成机器清单确认，准备执行变更。',
        attachments: []
      }
    ],
    logs: [
      { action: '需求提交，待发起部门负责人审核', time: '2026/4/23 09:10:00', user: '开发小王' },
      { action: '发起部门负责人审核通过', time: '2026/4/23 09:30:00', user: '李主管' },
      { action: '承接部门负责人审核通过', time: '2026/4/23 10:00:00', user: '张经理' },
      { action: '指派给 运维张三', time: '2026/4/23 10:10:00', user: '张经理' }
    ]
  },
  {
    id: 'mt_demo_002',
    title: 'OA 系统 SQL 性能优化',
    description: '对审批查询和任务列表进行索引整理与 SQL 优化。',
    sourceDepartment: '董事会',
    targetDepartment: '开发部',
    status: 'ready_for_assignment',
    priority: 'medium',
    dueDate: '2026-05-06',
    sourceReviewer: 'CEO',
    targetReviewer: '李主管',
    assignments: [],
    logs: [
      { action: '需求提交，待发起部门负责人审核', time: '2026/4/24 11:00:00', user: 'CEO' },
      { action: '发起部门负责人审核通过', time: '2026/4/24 11:05:00', user: 'CEO' },
      { action: '承接部门负责人审核通过', time: '2026/4/24 11:20:00', user: '李主管' }
    ]
  },
  {
    id: 'mt_demo_003',
    title: '运维知识库补录',
    description: '补齐监控告警处理 SOP 与故障切换流程文档。',
    sourceDepartment: '运维部',
    targetDepartment: '运维部',
    status: 'pending_source_review',
    priority: 'low',
    dueDate: '2026-05-10',
    assignments: [],
    logs: [
      { action: '需求提交，待发起部门负责人审核', time: '2026/4/25 14:00:00', user: '运维李四' }
    ]
  },
  {
    id: 'mt_demo_004',
    title: '移动端审批页样式修整',
    description: '修复小屏下表头溢出和按钮换行问题。',
    sourceDepartment: '开发部',
    targetDepartment: '开发部',
    status: 'in_progress',
    priority: 'medium',
    dueDate: '2026-05-02',
    sourceReviewer: '李主管',
    targetReviewer: '李主管',
    assignments: [
      {
        id: 'as_demo_004',
        assigneeId: 'u5',
        assigneeName: '开发小王',
        status: 'todo',
        attachments: []
      }
    ],
    logs: [
      { action: '需求提交，待发起部门负责人审核', time: '2026/4/25 15:00:00', user: '开发小王' },
      { action: '发起部门负责人审核通过', time: '2026/4/25 15:30:00', user: '李主管' },
      { action: '承接部门负责人审核通过', time: '2026/4/25 15:31:00', user: '李主管' },
      { action: '指派给 开发小王', time: '2026/4/25 15:40:00', user: '李主管' }
    ]
  }
];

export const demoDepartments: Department[] = [
  {
    id: 'd_root',
    name: 'NovaOffice 集团',
    manager: 'CEO',
    memberCount: 6,
    children: [
      { id: 'd_board', name: '董事会', manager: 'CEO', memberCount: 1, children: [] },
      { id: 'd_ops', name: '运维部', manager: '张经理', memberCount: 3, children: [] },
      { id: 'd_dev', name: '开发部', manager: '李主管', memberCount: 2, children: [] },
      { id: 'd_market', name: '市场部', manager: '陈八', memberCount: 0, children: [] }
    ]
  },
  {
    id: 'unassigned',
    name: '未分配',
    manager: '系统',
    memberCount: 0,
    children: []
  }
];

export const demoApprovals: Approval[] = [
  {
    id: 'ap_demo_001',
    title: 'Q2 差旅费报销',
    type: '报销',
    requester: '运维张三',
    status: 'pending',
    description: '差旅费用共计 1200 元。',
    createdAt: '2026-04-26'
  },
  {
    id: 'ap_demo_002',
    title: '年度调休申请',
    type: '请假',
    requester: '开发小王',
    status: 'pending',
    description: '申请 2 天调休，用于版本上线后补休。',
    createdAt: '2026-04-25'
  },
  {
    id: 'ap_demo_003',
    title: '办公设备采购申请',
    type: '行政',
    requester: '张经理',
    status: 'approved',
    description: '申请采购 2 台开发测试笔记本。',
    createdAt: '2026-04-22'
  }
];

export const demoWorkflows: WorkflowDefinition[] = [
  {
    id: 'wf_task_demo',
    key: 'task_fulfillment',
    name: '跨部门任务流程',
    description: '默认跨部门任务流转与指派流程。',
    updatedAt: '2026-04-27 16:40:00',
    updatedBy: '系统管理员',
    isTaskWorkflow: true,
    nodes: [
      { id: 'wf_submit', name: '需求提交', description: '需求发起入口', action: 'submit', actor: 'initiator', kind: 'start', x: 140, y: 340, nextNodeId: 'wf_source_review' },
      { id: 'wf_source_review', name: '发起部门审核', description: '发起部门负责人审核需求是否合理', action: 'source_review', actor: 'source_manager', kind: 'review', status: 'pending_source_review', x: 560, y: 340, nextNodeId: 'wf_target_review', rejectNodeId: 'wf_reject' },
      { id: 'wf_target_review', name: '承接部门审核', description: '承接部门负责人确认是否接收任务', action: 'target_review', actor: 'target_manager', kind: 'review', status: 'pending_target_review', x: 980, y: 340, nextNodeId: 'wf_assign', rejectNodeId: 'wf_reject' },
      { id: 'wf_assign', name: '部门指派', description: '承接部门负责人将任务分配给成员', action: 'assign', actor: 'target_manager', kind: 'task', status: 'ready_for_assignment', x: 1400, y: 340, nextNodeId: 'wf_feedback' },
      { id: 'wf_feedback', name: '成员处理反馈', description: '成员处理任务并提交结果与附件', action: 'feedback', actor: 'target_member', kind: 'task', status: 'in_progress', x: 1820, y: 340, nextNodeId: 'wf_complete' },
      { id: 'wf_complete', name: '流程完成', description: '任务验收完成后结束流程', action: 'complete', actor: 'system', kind: 'end', status: 'completed', x: 2240, y: 340 },
      { id: 'wf_reject', name: '流程驳回', description: '审核不通过时结束流程', action: 'reject', actor: 'system', kind: 'end', status: 'rejected', x: 980, y: 700 }
    ]
  }
];

export const demoAnalytics: AnalyticsResponse = {
  yearlySummary: '当前为离线演示模式，展示 4 个任务、3 条审批、6 名员工和 5 个部门节点。',
  completedTasks: 0,
  ongoingTasks: 2,
  pendingTasks: 2,
  averageCompletionRate: 0,
  totalUsers: 6,
  totalDepartments: 5,
  pendingApprovals: 2,
  companyWorkload: [
    { label: '任务总量', total: 4, tasks: 4, approvals: 0, feedbacks: 0 },
    { label: '审批总量', total: 3, tasks: 0, approvals: 3, feedbacks: 0 },
    { label: '成员反馈', total: 1, tasks: 0, approvals: 0, feedbacks: 1 }
  ],
  dailyWorkload: [
    { label: '4/21', value: 0 },
    { label: '4/22', value: 1 },
    { label: '4/23', value: 1 },
    { label: '4/24', value: 2 },
    { label: '4/25', value: 2 },
    { label: '4/26', value: 1 },
    { label: '4/27', value: 0 }
  ],
  departmentLoads: [
    { name: '开发部', val: 50, color: 'bg-blue-500' },
    { name: '运维部', val: 50, color: 'bg-purple-500' }
  ],
  departmentStats: [
    { name: '开发部', memberCount: 2, totalTasks: 2, activeTasks: 2, completedTasks: 0, completionRate: 0 },
    { name: '运维部', memberCount: 3, totalTasks: 2, activeTasks: 2, completedTasks: 0, completionRate: 0 },
    { name: '董事会', memberCount: 1, totalTasks: 1, activeTasks: 1, completedTasks: 0, completionRate: 0 },
    { name: 'NovaOffice 集团', memberCount: 6, totalTasks: 0, activeTasks: 0, completedTasks: 0, completionRate: 0 },
    { name: '市场部', memberCount: 0, totalTasks: 0, activeTasks: 0, completedTasks: 0, completionRate: 0 }
  ],
  employeeStats: [
    { name: '运维张三', department: '运维部', role: 'member', totalAssignments: 1, completedAssignments: 0, activeAssignments: 1 },
    { name: '开发小王', department: '开发部', role: 'member', totalAssignments: 1, completedAssignments: 0, activeAssignments: 1 },
    { name: '张经理', department: '运维部', role: 'manager', totalAssignments: 0, completedAssignments: 0, activeAssignments: 0 },
    { name: '李主管', department: '开发部', role: 'manager', totalAssignments: 0, completedAssignments: 0, activeAssignments: 0 },
    { name: 'CEO', department: '董事会', role: 'admin', totalAssignments: 0, completedAssignments: 0, activeAssignments: 0 },
    { name: '运维李四', department: '运维部', role: 'member', totalAssignments: 0, completedAssignments: 0, activeAssignments: 0 }
  ]
};

export const findDemoUserByCredentials = (email: string, password: string) => {
  if (password !== '123456') return null;
  return demoUsers.find((user) => user.email?.toLowerCase() === email.trim().toLowerCase()) || null;
};

export const getDemoUserById = (id: string) => demoUsers.find((user) => user.id === id) || demoUsers[0];

