export interface User {
  id: string;
  name: string;
  avatar: string;
  role: 'admin' | 'manager' | 'member';
  department: string;
  email?: string;
}

export interface TaskAssignment {
  id: string;
  assigneeId: string;
  assigneeName: string;
  status: 'todo' | 'in-progress' | 'completed' | 'submitted';
  feedbackText?: string;
  attachments?: string[];
  completedAt?: string;
}

export interface TaskLog {
  action: string;
  time: string;
  user: string;
}

export interface MainTask {
  id: string;
  title: string;
  description: string;
  sourceDepartment: string;
  targetDepartment: string;
  status:
    | 'pending_source_review'
    | 'pending_target_review'
    | 'ready_for_assignment'
    | 'in_progress'
    | 'completed'
    | 'rejected';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  sourceReviewer?: string;
  targetReviewer?: string;
  assignments: TaskAssignment[];
  logs: TaskLog[];
}

export type WorkflowNodeAction =
  | 'submit'
  | 'source_review'
  | 'target_review'
  | 'assign'
  | 'feedback'
  | 'manual'
  | 'approval'
  | 'complete'
  | 'reject'
  | 'condition'
  | 'parallel'
  | 'cc'
  | 'notify'
  | 'script'
  | 'subprocess';

export type WorkflowNodeActor =
  | 'initiator'
  | 'source_manager'
  | 'target_manager'
  | 'target_member'
  | 'system'
  | 'any';

export type WorkflowNodeKind =
  | 'start'
  | 'review'
  | 'task'
  | 'gateway'
  | 'notification'
  | 'automation'
  | 'subprocess'
  | 'end';

export interface WorkflowEdgeWaypoint {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  name: string;
  action: WorkflowNodeAction;
  actor: WorkflowNodeActor;
  kind?: WorkflowNodeKind;
  description?: string;
  status?: MainTask['status'];
  x: number;
  y: number;
  nextNodeId?: string;
  rejectNodeId?: string;
  nextWaypoint?: WorkflowEdgeWaypoint;
  rejectWaypoint?: WorkflowEdgeWaypoint;
}

export interface WorkflowDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  updatedAt: string;
  updatedBy: string;
  ownerId?: string;
  ownerName?: string;
  isBuiltIn?: boolean;
  isTaskWorkflow?: boolean;
  nodes: WorkflowNode[];
}

export interface Department {
  id: string;
  name: string;
  manager: string;
  memberCount: number;
  children?: Department[];
}

export interface Approval {
  id: string;
  title: string;
  type: string;
  requester: string;
  status: 'pending' | 'approved' | 'rejected';
  description: string;
  createdAt: string;
}

export interface DepartmentLoad {
  name: string;
  val: number;
  color: string;
}

export interface WorkloadBucket {
  label: string;
  total: number;
  tasks: number;
  approvals: number;
  feedbacks: number;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface DepartmentStat {
  name: string;
  memberCount: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  completionRate: number;
}

export interface EmployeeStat {
  name: string;
  department: string;
  role: string;
  totalAssignments: number;
  completedAssignments: number;
  activeAssignments: number;
}

export interface AnalyticsResponse {
  yearlySummary: string;
  completedTasks: number;
  ongoingTasks: number;
  pendingTasks: number;
  averageCompletionRate: number;
  totalUsers: number;
  totalDepartments: number;
  pendingApprovals: number;
  companyWorkload: WorkloadBucket[];
  dailyWorkload: TrendPoint[];
  departmentLoads: DepartmentLoad[];
  departmentStats: DepartmentStat[];
  employeeStats: EmployeeStat[];
}
