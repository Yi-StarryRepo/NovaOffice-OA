import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type UserRole = "admin" | "manager" | "member";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type TaskStatus =
  | "pending_source_review"
  | "pending_target_review"
  | "ready_for_assignment"
  | "in_progress"
  | "completed"
  | "rejected";
export type TaskAssignmentStatus = "todo" | "in-progress" | "completed" | "submitted";

export type WorkflowNodeAction =
  | "submit"
  | "source_review"
  | "target_review"
  | "assign"
  | "feedback"
  | "manual"
  | "approval"
  | "complete"
  | "reject"
  | "condition"
  | "parallel"
  | "cc"
  | "notify"
  | "script"
  | "subprocess";

export type WorkflowNodeActor =
  | "initiator"
  | "source_manager"
  | "target_manager"
  | "target_member"
  | "system"
  | "any";

export type WorkflowNodeKind =
  | "start"
  | "review"
  | "task"
  | "gateway"
  | "notification"
  | "automation"
  | "subprocess"
  | "end";

export type WorkflowEdgeWaypoint = {
  x: number;
  y: number;
};

export type UserRecord = {
  id: string;
  name: string;
  role: UserRole;
  department: string;
  avatar: string;
  email: string;
  password: string;
};

export type TaskAssignment = {
  id: string;
  assigneeId: string;
  assigneeName: string;
  status: TaskAssignmentStatus;
  feedbackText?: string;
  attachments?: string[];
  completedAt?: string;
};

export type TaskLog = {
  action: string;
  time: string;
  user: string;
};

export type MainTask = {
  id: string;
  title: string;
  description: string;
  sourceDepartment: string;
  targetDepartment: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  dueDate: string;
  sourceReviewer?: string;
  targetReviewer?: string;
  assignments: TaskAssignment[];
  logs: TaskLog[];
};

export type Department = {
  id: string;
  name: string;
  manager: string;
  memberCount: number;
  children?: Department[];
};

export type Approval = {
  id: string;
  title: string;
  type: string;
  requester: string;
  status: ApprovalStatus;
  description: string;
  createdAt: string;
};

export type WorkflowNode = {
  id: string;
  name: string;
  action: WorkflowNodeAction;
  actor: WorkflowNodeActor;
  kind?: WorkflowNodeKind;
  description?: string;
  status?: TaskStatus;
  x: number;
  y: number;
  nextNodeId?: string;
  rejectNodeId?: string;
  nextWaypoint?: WorkflowEdgeWaypoint;
  rejectWaypoint?: WorkflowEdgeWaypoint;
};

export type WorkflowDefinition = {
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
};

export type TaskWorkflowAction =
  | "approve"
  | "reject"
  | "assign"
  | "feedback"
  | "complete";

export type ExecuteTaskActionPayload = {
  action?: TaskWorkflowAction;
  userId?: string;
  userName: string;
  userRole?: UserRole;
  userDepartment?: string;
  assigneeId?: string;
  assigneeName?: string;
  feedbackText?: string;
  attachments?: string[];
};

export type SaveTaskPayload = Partial<MainTask> & {
  editorId?: string;
  editorName?: string;
  editorRole?: UserRole;
  editorDepartment?: string;
};

export type DeleteTaskPayload = {
  userId?: string;
  userName: string;
  userRole?: UserRole;
  userDepartment?: string;
};

type DepartmentRow = {
  id: string;
  name: string;
  manager: string;
  parent_id: string | null;
  sort_order: number;
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  source_department: string;
  target_department: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  due_date: string;
  source_reviewer: string | null;
  target_reviewer: string | null;
  created_at: string;
  updated_at: string;
};

type WorkflowDefinitionRow = {
  id: string;
  workflow_key: string;
  name: string;
  description: string;
  nodes_json: string;
  is_active: number;
  updated_at: string;
  updated_by: string;
  owner_id: string | null;
  owner_name: string | null;
  is_builtin: number;
};

const ZH = {
  system: "\u7cfb\u7edf",
  unassigned: "\u672a\u5206\u914d",
  group: "NovaOffice \u96c6\u56e2",
  board: "\u8463\u4e8b\u4f1a",
  ops: "\u8fd0\u7ef4\u90e8",
  dev: "\u5f00\u53d1\u90e8",
  manager: "\u5f20\u7ecf\u7406",
  admin: "\u738b\u4e3b\u7ba1",
  opsMember1: "\u8fd0\u7ef4\u5f20\u4e09",
  opsMember2: "\u8fd0\u7ef4\u674e\u56db",
  devMember: "\u5f00\u53d1\u5c0f\u738b",
  sourceReview: "\u53d1\u8d77\u90e8\u95e8\u5ba1\u6838",
  targetReview: "\u627f\u63a5\u90e8\u95e8\u5ba1\u6838",
  assign: "\u90e8\u95e8\u6307\u6d3e",
  feedback: "\u6210\u5458\u5904\u7406\u53cd\u9988",
  complete: "\u6d41\u7a0b\u5b8c\u6210",
  reject: "\u6d41\u7a0b\u9a73\u56de",
  submit: "\u9700\u6c42\u63d0\u4ea4",
} as const;

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "novaoffice.db");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const now = () => new Date().toLocaleString("zh-CN", { hour12: false });
const today = () => new Date().toISOString().slice(0, 10);
const randomId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const getTableColumns = (tableName: string) =>
  db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;

const resolveAppSettingsKeyColumn = () => {
  const columns = getTableColumns("app_settings").map((column) => column.name);
  if (columns.includes("key")) return "key";
  if (columns.includes("setting_key")) return "setting_key";
  return "key";
};

const appSettingsKeyColumn = resolveAppSettingsKeyColumn();

const statusLabelMap: Record<TaskStatus, string> = {
  pending_source_review: "\u5f85\u53d1\u8d77\u90e8\u95e8\u8d1f\u8d23\u4eba\u5ba1\u6838",
  pending_target_review: "\u5f85\u627f\u63a5\u90e8\u95e8\u8d1f\u8d23\u4eba\u5ba1\u6838",
  ready_for_assignment: "\u5f85\u6307\u6d3e\u90e8\u95e8\u6210\u5458",
  in_progress: "\u90e8\u95e8\u6267\u884c\u4e2d",
  completed: "\u6d41\u7a0b\u5df2\u5b8c\u6210",
  rejected: "\u6d41\u7a0b\u5df2\u9a73\u56de",
};

const publicUser = (user: UserRecord) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const parseAttachments = (value: string | null) => {
  if (!value) return [] as string[];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
};

const parseDateValue = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/\./g, "-").replace(/\//g, "-").replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const runInTransaction = <T>(work: () => T): T => {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const WORKFLOW_CARD_WIDTH = 300;
const WORKFLOW_CARD_HEIGHT = 156;
const WORKFLOW_LAYOUT_START_X = 96;
const WORKFLOW_LAYOUT_START_Y = 180;
const WORKFLOW_LAYOUT_COLUMN_GAP = 372;
const WORKFLOW_LAYOUT_ROW_GAP = 220;

const defaultTaskWorkflowNodes = (): WorkflowNode[] => [
  { id: "wf_submit", name: ZH.submit, action: "submit", actor: "initiator", kind: "start", x: 140, y: 220, nextNodeId: "wf_source_review" },
  {
    id: "wf_source_review",
    name: ZH.sourceReview,
    action: "source_review",
    actor: "source_manager",
    kind: "review",
    status: "pending_source_review",
    x: 600,
    y: 220,
    nextNodeId: "wf_target_review",
    rejectNodeId: "wf_reject",
  },
  {
    id: "wf_target_review",
    name: ZH.targetReview,
    action: "target_review",
    actor: "target_manager",
    kind: "review",
    status: "pending_target_review",
    x: 1060,
    y: 220,
    nextNodeId: "wf_assign",
    rejectNodeId: "wf_reject",
  },
  {
    id: "wf_assign",
    name: ZH.assign,
    action: "assign",
    actor: "target_manager",
    kind: "task",
    status: "ready_for_assignment",
    x: 1520,
    y: 220,
    nextNodeId: "wf_feedback",
  },
  {
    id: "wf_feedback",
    name: ZH.feedback,
    action: "feedback",
    actor: "target_member",
    kind: "task",
    status: "in_progress",
    x: 1980,
    y: 220,
    nextNodeId: "wf_complete",
  },
  {
    id: "wf_complete",
    name: ZH.complete,
    action: "complete",
    actor: "system",
    kind: "end",
    status: "completed",
    x: 2440,
    y: 220,
  },
  {
    id: "wf_reject",
    name: ZH.reject,
    action: "reject",
    actor: "system",
    kind: "end",
    status: "rejected",
    x: 1060,
    y: 520,
  },
];

const isWorkflowLayoutCrowded = (nodes: WorkflowNode[]) => {
  if (nodes.length < 3) return false;

  const overlaps = nodes.some((node, index) =>
    nodes.slice(index + 1).some((other) => {
      const sameBand = Math.abs(node.y - other.y) < WORKFLOW_CARD_HEIGHT * 0.75;
      const tooClose = Math.abs(node.x - other.x) < WORKFLOW_CARD_WIDTH + 24;
      return sameBand && tooClose;
    })
  );
  if (overlaps) return true;

  const rowCounts = new Map<number, number>();
  for (const node of nodes) {
    const rowKey = Math.round(node.y / 48);
    rowCounts.set(rowKey, (rowCounts.get(rowKey) || 0) + 1);
  }

  const maxRowCount = Math.max(...rowCounts.values());
  return maxRowCount / nodes.length > 0.7;
};

const calculateWorkflowLayoutPositions = (nodes: WorkflowNode[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));

  for (const node of nodes) {
    if (node.nextNodeId && indegree.has(node.nextNodeId)) {
      indegree.set(node.nextNodeId, (indegree.get(node.nextNodeId) || 0) + 1);
    }
    if (node.rejectNodeId && indegree.has(node.rejectNodeId)) {
      indegree.set(node.rejectNodeId, (indegree.get(node.rejectNodeId) || 0) + 1);
    }
  }

  const startNodes = nodes.filter((node) => (indegree.get(node.id) || 0) === 0);
  const queue = (startNodes.length ? startNodes : nodes.slice(0, 1)).map((node, index) => ({
    id: node.id,
    depth: 0,
    lane: index * 2,
  }));

  const positions = new Map<string, { depth: number; lane: number }>();
  while (queue.length) {
    const current = queue.shift()!;
    const previous = positions.get(current.id);
    if (previous && previous.depth <= current.depth) continue;
    positions.set(current.id, { depth: current.depth, lane: current.lane });

    const node = nodeMap.get(current.id);
    if (!node) continue;

    if (node.nextNodeId && nodeMap.has(node.nextNodeId)) {
      queue.push({
        id: node.nextNodeId,
        depth: current.depth + 1,
        lane: current.lane,
      });
    }
    if (node.rejectNodeId && nodeMap.has(node.rejectNodeId)) {
      queue.push({
        id: node.rejectNodeId,
        depth: current.depth + 1,
        lane: current.lane + 1,
      });
    }
  }

  nodes.forEach((node, index) => {
    if (!positions.has(node.id)) {
      positions.set(node.id, {
        depth: index % 4,
        lane: Math.floor(index / 4) * 2,
      });
    }
  });

  return new Map(
    nodes.map((node) => {
      const slot = positions.get(node.id)!;
      return [
        node.id,
        {
          x: WORKFLOW_LAYOUT_START_X + slot.depth * WORKFLOW_LAYOUT_COLUMN_GAP,
          y: WORKFLOW_LAYOUT_START_Y + slot.lane * WORKFLOW_LAYOUT_ROW_GAP,
        },
      ];
    })
  );
};

const normalizeWorkflowLayout = (nodes: WorkflowNode[]) => {
  if (!isWorkflowLayoutCrowded(nodes)) {
    return { nodes, changed: false };
  }

  const positions = calculateWorkflowLayoutPositions(nodes);
  let changed = false;
  const normalizedNodes = nodes.map((node) => {
    const position = positions.get(node.id);
    const nextWaypoint = undefined;
    const rejectWaypoint = undefined;
    const nextX = position?.x ?? node.x;
    const nextY = position?.y ?? node.y;
    if (
      nextX !== node.x ||
      nextY !== node.y ||
      node.nextWaypoint !== nextWaypoint ||
      node.rejectWaypoint !== rejectWaypoint
    ) {
      changed = true;
    }
    return {
      ...node,
      x: nextX,
      y: nextY,
      nextWaypoint,
      rejectWaypoint,
    };
  });

  return { nodes: normalizedNodes, changed };
};

const sanitizeWorkflowNodes = (nodes: WorkflowNode[] | undefined | null): WorkflowNode[] => {
  const fallback = defaultTaskWorkflowNodes();
  if (!Array.isArray(nodes) || nodes.length === 0) return fallback;

  const validActions = new Set<WorkflowNodeAction>([
    "submit",
    "source_review",
    "target_review",
    "assign",
    "feedback",
    "manual",
    "approval",
    "complete",
    "reject",
    "condition",
    "parallel",
    "cc",
    "notify",
    "script",
    "subprocess",
  ]);
  const validActors = new Set<WorkflowNodeActor>([
    "initiator",
    "source_manager",
    "target_manager",
    "target_member",
    "system",
    "any",
  ]);
  const validKinds = new Set<WorkflowNodeKind>([
    "start",
    "review",
    "task",
    "gateway",
    "notification",
    "automation",
    "subprocess",
    "end",
  ]);

  const normalized = nodes
    .filter((node): node is WorkflowNode => Boolean(node?.id) && validActions.has(node.action))
    .map((node, index) => ({
      id: node.id,
      name: node.name?.trim() || fallback.find((item) => item.action === node.action)?.name || `Step ${index + 1}`,
      action: node.action,
      actor: validActors.has(node.actor) ? node.actor : "system",
      kind: node.kind && validKinds.has(node.kind) ? node.kind : undefined,
      description: node.description?.trim() || undefined,
      status: node.status,
      x: Number.isFinite(node.x) ? node.x : 80 + index * 220,
      y: Number.isFinite(node.y) ? node.y : 160,
      nextNodeId: node.nextNodeId || undefined,
      rejectNodeId: node.rejectNodeId || undefined,
      nextWaypoint:
        node.nextWaypoint && Number.isFinite(node.nextWaypoint.x) && Number.isFinite(node.nextWaypoint.y)
          ? { x: node.nextWaypoint.x, y: node.nextWaypoint.y }
          : undefined,
      rejectWaypoint:
        node.rejectWaypoint && Number.isFinite(node.rejectWaypoint.x) && Number.isFinite(node.rejectWaypoint.y)
          ? { x: node.rejectWaypoint.x, y: node.rejectWaypoint.y }
          : undefined,
    }));

  const ids = new Set(normalized.map((node) => node.id));
  return normalized.map((node) => ({
    ...node,
    nextNodeId: node.nextNodeId && ids.has(node.nextNodeId) ? node.nextNodeId : undefined,
    rejectNodeId: node.rejectNodeId && ids.has(node.rejectNodeId) ? node.rejectNodeId : undefined,
    nextWaypoint: node.nextNodeId && ids.has(node.nextNodeId) ? node.nextWaypoint : undefined,
    rejectWaypoint: node.rejectNodeId && ids.has(node.rejectNodeId) ? node.rejectWaypoint : undefined,
  }));
};

const parseWorkflowNodes = (value: string) => {
  try {
    return normalizeWorkflowLayout(sanitizeWorkflowNodes(JSON.parse(value) as WorkflowNode[])).nodes;
  } catch {
    return defaultTaskWorkflowNodes();
  }
};

const normalizePersistedWorkflowLayouts = () => {
  const rows = db.prepare(`
    SELECT workflow_key, nodes_json
    FROM workflow_definitions
    WHERE is_active = 1
  `).all() as Array<{ workflow_key: string; nodes_json: string }>;

  if (!rows.length) return;

  runInTransaction(() => {
    for (const row of rows) {
      const rawNodes = sanitizeWorkflowNodes(JSON.parse(row.nodes_json) as WorkflowNode[]);
      const { nodes, changed } = normalizeWorkflowLayout(rawNodes);
      if (!changed) continue;

      db.prepare(`
        UPDATE workflow_definitions
        SET nodes_json = ?
        WHERE workflow_key = ? AND is_active = 1
      `).run(JSON.stringify(nodes), row.workflow_key);
    }
  });
};

const ensureWorkflowDefinitionColumns = () => {
  const columns = new Set(getTableColumns("workflow_definitions").map((column) => column.name));
  if (!columns.has("owner_id")) {
    db.exec(`ALTER TABLE workflow_definitions ADD COLUMN owner_id TEXT`);
  }
  if (!columns.has("owner_name")) {
    db.exec(`ALTER TABLE workflow_definitions ADD COLUMN owner_name TEXT`);
  }
  if (!columns.has("is_builtin")) {
    db.exec(`ALTER TABLE workflow_definitions ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0`);
  }
};

const ensureWorkflowDefinitionGuards = () => {
  runInTransaction(() => {
    db.prepare(`
      UPDATE workflow_definitions
      SET is_builtin = 1, owner_id = NULL, owner_name = '系统初始化'
      WHERE workflow_key = 'task_fulfillment'
    `).run();

    db.prepare(`
      UPDATE workflow_definitions
      SET is_builtin = COALESCE(is_builtin, 0)
      WHERE is_builtin IS NULL
    `).run();
  });
};

const createSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      avatar TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      manager TEXT NOT NULL,
      parent_id TEXT REFERENCES departments(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_department TEXT NOT NULL,
      target_department TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      due_date TEXT NOT NULL,
      source_reviewer TEXT,
      target_reviewer TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_assignments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      assignee_id TEXT NOT NULL,
      assignee_name TEXT NOT NULL,
      status TEXT NOT NULL,
      feedback_text TEXT,
      attachments_json TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      time TEXT NOT NULL,
      user_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      requester TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id TEXT PRIMARY KEY,
      workflow_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      nodes_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      owner_id TEXT,
      owner_name TEXT,
      is_builtin INTEGER NOT NULL DEFAULT 0
    );
  `);
};

const getDepartmentRows = () =>
  db.prepare(`
    SELECT id, name, manager, parent_id, sort_order
    FROM departments
    ORDER BY sort_order ASC, name ASC
  `).all() as DepartmentRow[];

const getTaskRow = (id: string) =>
  db.prepare(`
    SELECT id, title, description, source_department, target_department, status, priority, due_date,
           source_reviewer, target_reviewer, created_at, updated_at
    FROM tasks
    WHERE id = ?
  `).get(id) as TaskRow | undefined;

const getWorkflowByKeyInternal = (key: string): WorkflowDefinition | null => {
  const row = db.prepare(`
    SELECT id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by, owner_id, owner_name, is_builtin
    FROM workflow_definitions
    WHERE workflow_key = ? AND is_active = 1
    LIMIT 1
  `).get(key) as WorkflowDefinitionRow | undefined;

  if (!row) return null;
  return {
    id: row.id,
    key: row.workflow_key,
    name: row.name,
    description: row.description,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    ownerId: row.owner_id || undefined,
    ownerName: row.owner_name || undefined,
    isBuiltIn: Boolean(row.is_builtin),
    isTaskWorkflow: row.workflow_key === getTaskWorkflowKey(),
    nodes: parseWorkflowNodes(row.nodes_json),
  } satisfies WorkflowDefinition;
};

const getSettingValue = (key: string, fallback = "") => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE ${appSettingsKeyColumn} = ?`).get(key) as { value: string } | undefined;
  return row?.value || fallback;
};

const setSettingValue = (key: string, value: string) => {
  db.prepare(`
    INSERT INTO app_settings (${appSettingsKeyColumn}, value)
    VALUES (?, ?)
    ON CONFLICT(${appSettingsKeyColumn}) DO UPDATE SET value = excluded.value
  `).run(key, value);
};

const getTaskWorkflowKey = () => getSettingValue("activeTaskWorkflowKey", "task_fulfillment");

const getTaskWorkflowDefinition = () =>
  getWorkflowByKeyInternal(getTaskWorkflowKey()) || getWorkflowByKeyInternal("task_fulfillment");

const getWorkflowNodeByAction = (workflow: WorkflowDefinition, action: WorkflowNodeAction) =>
  workflow.nodes.find((node) => node.action === action);

const getWorkflowNodeByStatus = (workflow: WorkflowDefinition, status: string) =>
  workflow.nodes.find((node) => node.status === status);

const getCurrentWorkflowNode = (task: MainTask, workflow: WorkflowDefinition | null) =>
  workflow ? getWorkflowNodeByStatus(workflow, task.status) || null : null;

const fallbackWorkflowActionLabel = (action: WorkflowNodeAction, actor: WorkflowNodeActor) => {
  if (action === "approval" && actor === "source_manager") return "发起部门审核";
  if (action === "approval" && actor === "target_manager") return "承接部门审核";

  const actionMap: Partial<Record<WorkflowNodeAction, string>> = {
    submit: "需求提交",
    source_review: "发起部门审核",
    target_review: "承接部门审核",
    assign: "部门指派",
    feedback: "成员处理反馈",
    manual: "人工任务",
    approval: "审批任务",
    complete: "流程完成",
    reject: "流程驳回",
    condition: "条件分支",
    parallel: "并行网关",
    cc: "抄送节点",
    notify: "通知节点",
    script: "脚本动作",
    subprocess: "子流程",
  };

  return actionMap[action] || action;
};

const getWorkflowNodeDisplayName = (node: WorkflowNode | null | undefined) => {
  if (!node) return "";
  const rawName = node.name?.trim() || "";
  if (/[一-龥]/.test(rawName)) return rawName;
  return fallbackWorkflowActionLabel(node.action, node.actor);
};

const findNextWorkflowNodeWithStatus = (
  workflow: WorkflowDefinition,
  currentNode: WorkflowNode,
  branch: "approve" | "reject" = "approve"
) => {
  const visited = new Set<string>();
  const traversedNodes: WorkflowNode[] = [];
  let nextNodeId = branch === "reject" ? currentNode.rejectNodeId : currentNode.nextNodeId;

  while (nextNodeId) {
    if (visited.has(nextNodeId)) {
      throw new Error(`Workflow contains a loop near ${nextNodeId}`);
    }
    visited.add(nextNodeId);

    const nextNode = workflow.nodes.find((node) => node.id === nextNodeId);
    if (!nextNode) break;

    traversedNodes.push(nextNode);
    if (nextNode.status) {
      return { nextNode, traversedNodes };
    }

    nextNodeId = nextNode.nextNodeId;
  }

  return { nextNode: null, traversedNodes };
};

const resolveWorkflowTransition = (
  workflow: WorkflowDefinition,
  currentNode: WorkflowNode,
  branch: "approve" | "reject" = "approve"
) => {
  const { nextNode, traversedNodes } = findNextWorkflowNodeWithStatus(workflow, currentNode, branch);

  if (!nextNode?.status) {
    return {
      nextStatus: branch === "reject" ? "rejected" : currentNode.status || "completed",
      nextNode: null,
      traversedNodes,
    };
  }

  return {
    nextStatus: nextNode.status,
    nextNode,
    traversedNodes,
  };
};

const resolveWorkflowTransitionByAction = (
  workflow: WorkflowDefinition,
  action: WorkflowNodeAction,
  branch: "approve" | "reject" = "approve"
) => {
  const currentNode = getWorkflowNodeByAction(workflow, action);
  if (!currentNode) throw new Error(`Workflow action missing: ${action}`);
  return resolveWorkflowTransition(workflow, currentNode, branch);
};

const describeWorkflowTransition = (currentNodeName: string, branch: "approve" | "reject", nextNode: WorkflowNode | null, traversedNodes: WorkflowNode[]) => {
  if (branch === "reject") {
    return `${currentNodeName}驳回需求`;
  }

  const path = traversedNodes.map((node) => `「${getWorkflowNodeDisplayName(node)}」`).join(" -> ");
  if (path) {
    return `${currentNodeName}通过，流转至 ${path}`;
  }
  if (nextNode?.name) {
    return `${currentNodeName}通过，流转至「${getWorkflowNodeDisplayName(nextNode)}」`;
  }
  return `${currentNodeName}处理完成`;
};

const assertWorkflowIsRunnable = (workflow: WorkflowDefinition) => {
  const submitNode = workflow.nodes.find((node) => node.action === "submit");
  if (!submitNode) throw new Error("流程缺少“需求提交”节点");
  if (!submitNode.nextNodeId) throw new Error("“需求提交”节点必须连接到下一步");

  const completeNode = workflow.nodes.find((node) => node.action === "complete");
  if (!completeNode) throw new Error("流程缺少“完成”节点");

  const statusOwners = new Map<string, string>();
  for (const node of workflow.nodes) {
    if (node.actor === "initiator" && node.action !== "submit") {
      throw new Error(`节点「${node.name}」当前不支持在提交后再次由发起人处理`);
    }

    const needsStatus =
      node.actor !== "system" &&
      node.action !== "submit" &&
      node.action !== "complete" &&
      node.action !== "reject";

    if (needsStatus && !node.status) {
      throw new Error(`节点「${node.name}」需要绑定一个任务状态后才能驱动看板`);
    }

    if (node.status) {
      const existing = statusOwners.get(node.status);
      if (existing && existing !== node.id) {
        throw new Error(`任务状态「${node.status}」被多个节点复用，当前运行时无法区分`);
      }
      statusOwners.set(node.status, node.id);
    }
  }
};

const canOperateTaskNode = (
  task: MainTask,
  currentNode: WorkflowNode,
  userId: string | undefined,
  userName: string,
  userRole?: UserRole,
  userDepartment?: string
) => {
  if (userRole === "admin") return true;

  switch (currentNode.actor) {
    case "source_manager":
      ensureReviewerAllowed(task.sourceDepartment, userName, userRole, userDepartment);
      return true;
    case "target_manager":
      ensureReviewerAllowed(task.targetDepartment, userName, userRole, userDepartment);
      return true;
    case "target_member":
      if (userId && task.assignments.some((item) => item.assigneeId === userId)) {
        return true;
      }
      throw new Error("只有被指派的成员才能处理当前节点");
    case "any":
      if (userId && task.assignments.some((item) => item.assigneeId === userId)) {
        return true;
      }
      if (userDepartment && [task.sourceDepartment, task.targetDepartment].includes(userDepartment)) {
        return true;
      }
      throw new Error("当前账号不在该流程节点的允许处理范围内");
    default:
      throw new Error(`节点「${currentNode.name}」当前不支持人工操作`);
  }
};

const ensureTaskManagementAllowed = (
  task: MainTask,
  userName: string,
  userRole?: UserRole,
  userDepartment?: string
) => {
  if (userRole === "admin") return;
  if (userRole === "manager" && userDepartment && [task.sourceDepartment, task.targetDepartment].includes(userDepartment)) {
    return;
  }
  if (task.sourceReviewer && task.sourceReviewer === userName) return;
  if (task.targetReviewer && task.targetReviewer === userName) return;
  throw new Error("只有管理员或相关部门负责人才能编辑、删除该任务");
};

const executeApproveOrReject = (
  task: MainTask,
  workflow: WorkflowDefinition,
  currentNode: WorkflowNode,
  userName: string,
  approved: boolean
) => {
  const currentTime = now();
  const transition = resolveWorkflowTransition(workflow, currentNode, approved ? "approve" : "reject");
  const nextStatus = transition.nextStatus || (approved ? task.status : "rejected");
  const sourceReviewer = currentNode.actor === "source_manager" ? userName : task.sourceReviewer || null;
  const targetReviewer = currentNode.actor === "target_manager" ? userName : task.targetReviewer || null;

  runInTransaction(() => {
    db.prepare(`
      UPDATE tasks
      SET status = ?, source_reviewer = ?, target_reviewer = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, sourceReviewer, targetReviewer, currentTime, task.id);

    db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `).run(
      task.id,
      approved
        ? describeWorkflowTransition(getWorkflowNodeDisplayName(currentNode), "approve", transition.nextNode, transition.traversedNodes)
        : describeWorkflowTransition(getWorkflowNodeDisplayName(currentNode), "reject", transition.nextNode, transition.traversedNodes),
      currentTime,
      userName
    );
  });
};

const executeAssign = (
  task: MainTask,
  workflow: WorkflowDefinition,
  currentNode: WorkflowNode,
  assigneeId: string,
  assigneeName: string,
  managerName: string
) => {
  const assignee = getUserByIdInternal(assigneeId);
  if (!assignee) throw new Error("执行成员不存在");
  if (assignee.department !== task.targetDepartment) {
    throw new Error("只能指派给承接部门成员");
  }
  if (task.assignments.some((item) => item.assigneeId === assigneeId)) {
    throw new Error("该成员已经在当前任务中");
  }

  const currentTime = now();
  const transition = resolveWorkflowTransition(workflow, currentNode, "approve");
  const nextStatus = transition.nextStatus || task.status;

  runInTransaction(() => {
    db.prepare(`
      INSERT INTO task_assignments (id, task_id, assignee_id, assignee_name, status, feedback_text, attachments_json, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId("as"), task.id, assigneeId, assigneeName, "todo", null, "[]", null, currentTime);

    db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, currentTime, task.id);

    db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `).run(
      task.id,
      `已指派给 ${assigneeName}，${describeWorkflowTransition(getWorkflowNodeDisplayName(currentNode), "approve", transition.nextNode, transition.traversedNodes)}`,
      currentTime,
      managerName
    );
  });
};

const executeFeedback = (
  task: MainTask,
  workflow: WorkflowDefinition,
  currentNode: WorkflowNode,
  assignmentId: string,
  feedbackText: string,
  attachments: string[]
) => {
  const assignment = task.assignments.find((item) => item.id === assignmentId);
  if (!assignment) throw new Error("任务分派记录不存在");

  const currentTime = now();
  const transition = resolveWorkflowTransition(workflow, currentNode, "approve");

  runInTransaction(() => {
    db.prepare(`
      UPDATE task_assignments
      SET feedback_text = ?, attachments_json = ?, status = ?, completed_at = ?
      WHERE id = ?
    `).run(feedbackText.trim(), JSON.stringify(attachments || []), "submitted", currentTime, assignmentId);

    db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `).run(task.id, `${getWorkflowNodeDisplayName(currentNode)}已提交反馈`, currentTime, assignment.assigneeName);

    const assignmentRows = db.prepare(`SELECT status FROM task_assignments WHERE task_id = ?`).all(task.id) as Array<{ status: TaskAssignmentStatus }>;
    const allSubmitted =
      assignmentRows.length > 0 &&
      assignmentRows.every((item) => item.status === "submitted" || item.status === "completed");

    const nextStatus = allSubmitted ? transition.nextStatus : task.status;

    db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, currentTime, task.id);

    if (allSubmitted) {
      db.prepare(`
        INSERT INTO task_logs (task_id, action, time, user_name)
        VALUES (?, ?, ?, ?)
      `).run(
        task.id,
        `成员反馈完成，${describeWorkflowTransition(getWorkflowNodeDisplayName(currentNode), "approve", transition.nextNode, transition.traversedNodes)}`,
        currentTime,
        ZH.system
      );
    }
  });
};

const ensureUnassignedDepartment = () => {
  db.prepare(`
    INSERT OR IGNORE INTO departments (id, name, manager, parent_id, sort_order)
    VALUES ('unassigned', ?, ?, NULL, 9999)
  `).run(ZH.unassigned, ZH.system);
};

const normalizeDepartmentHierarchy = () => {
  ensureUnassignedDepartment();
  const rows = getDepartmentRows();
  const root = rows.find((item) => item.parent_id === null && item.id !== "unassigned");
  if (!root) return;
  db.prepare(`
    UPDATE departments
    SET parent_id = ?
    WHERE parent_id IS NULL AND id NOT IN (?, 'unassigned')
  `).run(root.id, root.id);
};

const seedDatabase = () => {
  const count = Number((db.prepare(`SELECT COUNT(*) AS count FROM users`).get() as { count: number }).count);
  if (count > 0) return;

  runInTransaction(() => {
    const users: UserRecord[] = [
      { id: "u1", name: ZH.manager, role: "manager", department: ZH.ops, avatar: "https://picsum.photos/seed/manager/128/128", email: "manager@novaoffice.com", password: "123456" },
      { id: "u2", name: ZH.admin, role: "admin", department: ZH.board, avatar: "https://picsum.photos/seed/admin/128/128", email: "admin@novaoffice.com", password: "123456" },
      { id: "u3", name: ZH.opsMember1, role: "member", department: ZH.ops, avatar: "https://picsum.photos/seed/m1/128/128", email: "ops1@novaoffice.com", password: "123456" },
      { id: "u4", name: ZH.opsMember2, role: "member", department: ZH.ops, avatar: "https://picsum.photos/seed/m2/128/128", email: "ops2@novaoffice.com", password: "123456" },
      { id: "u5", name: ZH.devMember, role: "member", department: ZH.dev, avatar: "https://picsum.photos/seed/m3/128/128", email: "dev1@novaoffice.com", password: "123456" },
    ];

    const departments = [
      ["d1", ZH.group, ZH.admin, null, 1],
      ["d2", "\u4ea7\u7814\u4e2d\u5fc3", ZH.manager, "d1", 1],
      ["d3", ZH.board, "\u674e\u603b", "d1", 2],
      ["d4", "\u5e02\u573a\u90e8", "\u9648\u516b", "d1", 3],
      ["d5", ZH.ops, ZH.manager, "d1", 4],
      ["d6", ZH.dev, "\u674e\u56db", "d2", 1],
      ["d7", "\u8bbe\u8ba1\u7ec4", "\u738b\u4e94", "d2", 2],
      ["d8", "\u6cd5\u52a1\u90e8", "\u8d75\u516d", "d3", 1],
      ["d9", "\u884c\u653f\u90e8", "\u94b1\u4e03", "d3", 2],
      ["unassigned", ZH.unassigned, ZH.system, null, 9999],
    ] as const;

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, role, department, avatar, email, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDept = db.prepare(`
      INSERT INTO departments (id, name, manager, parent_id, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertTask = db.prepare(`
      INSERT INTO tasks (
        id, title, description, source_department, target_department, status, priority, due_date,
        source_reviewer, target_reviewer, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAssignment = db.prepare(`
      INSERT INTO task_assignments (id, task_id, assignee_id, assignee_name, status, feedback_text, attachments_json, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLog = db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `);
    const insertApproval = db.prepare(`
      INSERT INTO approvals (id, title, type, requester, status, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSetting = db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
    `);

    users.forEach((user) => {
      insertUser.run(user.id, user.name, user.role, user.department, user.avatar, user.email, user.password);
    });
    departments.forEach((department) => insertDept.run(...department));

    insertTask.run(
      "mt_001",
      "\u3010\u8de8\u90e8\u95e8\u534f\u540c\u3011Q2 \u4e91\u670d\u52a1\u5668\u73af\u5883\u6269\u5bb9",
      "\u5f00\u53d1\u90e8\u95e8\u7533\u8bf7\u8fd0\u7ef4\u90e8\u534f\u52a9\uff0c\u5b8c\u6210\u8d1f\u8f7d\u5747\u8861\u914d\u7f6e\u6269\u5c55\u3002",
      ZH.dev,
      ZH.ops,
      "in_progress",
      "high",
      "2026-04-20",
      "\u674e\u56db",
      ZH.manager,
      "2026-04-18 09:00:00",
      "2026-04-18 10:30:00"
    );
    insertAssignment.run("as_01", "mt_001", "u3", ZH.opsMember1, "in-progress", null, "[]", null, "2026-04-18 10:30:00");
    insertLog.run("mt_001", `${ZH.submit}\uff0c\u8fdb\u5165\u300c${ZH.sourceReview}\u300d`, "2026-04-18 09:00:00", ZH.devMember);
    insertLog.run("mt_001", `${ZH.sourceReview}\u901a\u8fc7\uff0c\u6d41\u8f6c\u81f3\u300c${ZH.targetReview}\u300d`, "2026-04-18 09:20:00", "\u674e\u56db");
    insertLog.run("mt_001", `${ZH.targetReview}\u901a\u8fc7\uff0c\u6d41\u8f6c\u81f3\u300c${ZH.assign}\u300d`, "2026-04-18 10:00:00", ZH.manager);
    insertLog.run("mt_001", `\u5df2\u6307\u6d3e\u7ed9 ${ZH.opsMember1}\uff0c\u8fdb\u5165\u300c${ZH.feedback}\u300d`, "2026-04-18 10:30:00", ZH.manager);

    insertTask.run(
      "mt_002",
      "OA \u7cfb\u7edf\u6027\u80fd\u8c03\u4f18",
      "\u9488\u5bf9\u73b0\u6709 OA \u7cfb\u7edf\u8fdb\u884c SQL \u4f18\u5316\u548c\u6162\u67e5\u8be2\u6cbb\u7406\u3002",
      ZH.board,
      ZH.dev,
      "pending_source_review",
      "medium",
      "2026-04-25",
      null,
      null,
      "2026-04-17 14:00:00",
      "2026-04-17 14:00:00"
    );
    insertLog.run("mt_002", `${ZH.submit}\uff0c\u8fdb\u5165\u300c${ZH.sourceReview}\u300d`, "2026-04-17 14:00:00", ZH.admin);

    insertApproval.run("ap_01", "Q2 \u5dee\u65c5\u8d39\u62a5\u9500", "\u62a5\u9500", "\u5f20\u4e09", "pending", "\u5dee\u65c5\u8d39\u7528\u5171\u8ba1 1200 \u5143\u3002", "2026-04-18");
    insertApproval.run("ap_02", "\u5e74\u5ea6\u8c03\u4f11\u7533\u8bf7", "\u8bf7\u5047", ZH.devMember, "pending", "\u7533\u8bf7 2 \u5929\u8c03\u4f11\uff0c\u7528\u4e8e\u7248\u672c\u4e0a\u7ebf\u540e\u8865\u4f11\u3002", "2026-04-19");

    insertSetting.run("companyName", "NovaOffice OA");
    insertSetting.run("reportCycle", "weekly");
    insertSetting.run("releaseWindow", "\u6bcf\u5468\u4e09 18:00-20:00");
    insertSetting.run("escalationRule", "P1 10 minutes");
    insertSetting.run("activeTaskWorkflowKey", "task_fulfillment");
  });
};

const ensureWorkflowDefinitions = () => {
  const existing = db.prepare(`
    SELECT id
    FROM workflow_definitions
    WHERE workflow_key = 'task_fulfillment'
    LIMIT 1
  `).get() as { id: string } | undefined;

  if (existing) return;

  db.prepare(`
    INSERT INTO workflow_definitions (
      id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by, owner_id, owner_name, is_builtin
    )
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1)
  `).run(
    "wf_task_fulfillment",
    "task_fulfillment",
    "\u8de8\u90e8\u95e8\u4efb\u52a1\u6d41\u7a0b",
    "\u9700\u6c42\u63d0\u4ea4\u3001\u53cc\u8d1f\u8d23\u4eba\u5ba1\u6838\u3001\u90e8\u95e8\u6307\u6d3e\u4e0e\u6210\u5458\u53cd\u9988\u7684\u6807\u51c6 OA \u4e1a\u52a1\u6d41\u7a0b\u3002",
    JSON.stringify(defaultTaskWorkflowNodes()),
    now(),
    "\u7cfb\u7edf\u521d\u59cb\u5316",
    null,
    "\u7cfb\u7edf\u521d\u59cb\u5316"
  );
};

const getUserByIdInternal = (id: string) =>
  db.prepare(`
    SELECT id, name, role, department, avatar, email, password
    FROM users
    WHERE id = ?
  `).get(id) as UserRecord | undefined;

const getDepartmentManagerByName = (departmentName: string) => {
  const row = db.prepare(`SELECT manager FROM departments WHERE name = ?`).get(departmentName) as { manager: string } | undefined;
  return row?.manager || null;
};

const ensureReviewerAllowed = (
  departmentName: string,
  reviewerName: string,
  reviewerRole?: UserRole,
  reviewerDepartment?: string
) => {
  if (reviewerRole === "admin") return;
  if (reviewerRole === "manager" && reviewerDepartment === departmentName) return;
  const manager = getDepartmentManagerByName(departmentName);
  if (manager && manager === reviewerName) return;
  throw new Error(`\u53ea\u6709 ${departmentName} \u8d1f\u8d23\u4eba\u624d\u80fd\u5904\u7406\u8be5\u5ba1\u6838`);
};

const buildDepartmentTree = (rows: DepartmentRow[]) => {
  const memberCounts = new Map<string, number>();
  const userRows = listUsers() as Array<Omit<UserRecord, "password">>;

  userRows.forEach((user) => {
    memberCounts.set(user.department, (memberCounts.get(user.department) || 0) + 1);
  });

  const childrenMap = new Map<string | null, DepartmentRow[]>();
  rows.forEach((row) => {
    const bucket = childrenMap.get(row.parent_id) || [];
    bucket.push(row);
    childrenMap.set(row.parent_id, bucket);
  });

  const visit = (row: DepartmentRow): Department => {
    const children = (childrenMap.get(row.id) || []).map(visit);
    return {
      id: row.id,
      name: row.name,
      manager: row.manager,
      memberCount: (memberCounts.get(row.name) || 0) + children.reduce((sum, child) => sum + child.memberCount, 0),
      children,
    };
  };

  return (childrenMap.get(null) || []).map(visit);
};

const getTaskById = (id: string) => {
  const task = getTaskRow(id);
  if (!task) return null;

  const assignments = db.prepare(`
    SELECT id, assignee_id, assignee_name, status, feedback_text, attachments_json, completed_at
    FROM task_assignments
    WHERE task_id = ?
    ORDER BY created_at ASC
  `).all(id) as Array<{
    id: string;
    assignee_id: string;
    assignee_name: string;
    status: TaskAssignmentStatus;
    feedback_text: string | null;
    attachments_json: string | null;
    completed_at: string | null;
  }>;

  const logs = db.prepare(`
    SELECT action, time, user_name
    FROM task_logs
    WHERE task_id = ?
    ORDER BY id ASC
  `).all(id) as Array<{ action: string; time: string; user_name: string }>;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    sourceDepartment: task.source_department,
    targetDepartment: task.target_department,
    status: task.status,
    priority: task.priority,
    dueDate: task.due_date,
    sourceReviewer: task.source_reviewer || undefined,
    targetReviewer: task.target_reviewer || undefined,
    assignments: assignments.map((item) => ({
      id: item.id,
      assigneeId: item.assignee_id,
      assigneeName: item.assignee_name,
      status: item.status,
      feedbackText: item.feedback_text || undefined,
      attachments: parseAttachments(item.attachments_json),
      completedAt: item.completed_at || undefined,
    })),
    logs: logs.map((item) => ({
      action: item.action,
      time: item.time,
      user: item.user_name,
    })),
  } satisfies MainTask;
};

export const initDatabase = () => {
  createSchema();
  ensureWorkflowDefinitionColumns();
  seedDatabase();
  ensureUnassignedDepartment();
  ensureWorkflowDefinitions();
  ensureWorkflowDefinitionGuards();
  normalizeDepartmentHierarchy();
  normalizePersistedWorkflowLayouts();
};

export const login = (email: string, password: string) => {
  const user = db.prepare(`
    SELECT id, name, role, department, avatar, email, password
    FROM users
    WHERE email = ? AND password = ?
  `).get(email, password) as UserRecord | undefined;

  return user ? publicUser(user) : null;
};

export const getUserById = (id: string) => {
  const user = getUserByIdInternal(id);
  return user ? publicUser(user) : null;
};

export const listUsers = () => {
  const rows = db.prepare(`
    SELECT id, name, role, department, avatar, email, password
    FROM users
    ORDER BY name ASC
  `).all() as UserRecord[];
  return rows.map(publicUser);
};

export const saveUser = (payload: Partial<UserRecord>) => {
  const department = payload.department?.trim() || ZH.unassigned;
  const email = payload.email?.trim();
  const password = payload.password?.trim();
  if (!payload.name?.trim() || !payload.role) {
    throw new Error("\u5458\u5de5\u59d3\u540d\u548c\u7cfb\u7edf\u89d2\u8272\u4e0d\u80fd\u4e3a\u7a7a");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("登录邮箱格式不正确");
  }

  if (password && password.length < 6) {
    throw new Error("密码至少需要 6 位");
  }

  const knownDepartment = db.prepare(`SELECT id FROM departments WHERE name = ?`).get(department) as { id: string } | undefined;
  if (!knownDepartment) {
    throw new Error("\u6240\u5c5e\u90e8\u95e8\u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u521b\u5efa\u90e8\u95e8");
  }

  return runInTransaction(() => {
    if (payload.id) {
      const existing = getUserByIdInternal(payload.id);
      if (!existing) throw new Error("\u5458\u5de5\u4e0d\u5b58\u5728");

      const nextEmail = email || existing.email;
      const duplicated = db.prepare(`
        SELECT id FROM users
        WHERE email = ? AND id <> ?
      `).get(nextEmail, payload.id) as { id: string } | undefined;
      if (duplicated) {
        throw new Error("该登录邮箱已被其他员工使用");
      }

      db.prepare(`
        UPDATE users
        SET name = ?, role = ?, department = ?, avatar = ?, email = ?, password = ?
        WHERE id = ?
      `).run(
        payload.name.trim(),
        payload.role,
        department,
        payload.avatar || existing.avatar,
        nextEmail,
        password || existing.password,
        payload.id
      );

      return publicUser(getUserByIdInternal(payload.id)!);
    }

    const id = randomId("u");
    const nextEmail = email || `${id}@novaoffice.com`;
    const duplicated = db.prepare(`SELECT id FROM users WHERE email = ?`).get(nextEmail) as { id: string } | undefined;
    if (duplicated) {
      throw new Error("该登录邮箱已被其他员工使用");
    }

    db.prepare(`
      INSERT INTO users (id, name, role, department, avatar, email, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      payload.name.trim(),
      payload.role,
      department,
      payload.avatar || `https://picsum.photos/seed/${Math.random()}/128/128`,
      nextEmail,
      password || "123456"
    );

    return publicUser(getUserByIdInternal(id)!);
  });
};

export const deleteUser = (id: string) => {
  const existing = getUserByIdInternal(id);
  if (!existing) throw new Error("\u5458\u5de5\u4e0d\u5b58\u5728");
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
};

export const listTasks = () => {
  const rows = db.prepare(`
    SELECT id
    FROM tasks
    ORDER BY updated_at DESC, created_at DESC, id DESC
  `).all() as Array<{ id: string }>;

  return rows.map((row) => getTaskById(row.id)!).filter(Boolean);
};

export const createTask = (payload: Partial<MainTask> & { creator?: string; creatorRole?: UserRole }) => {
  if (!payload.title?.trim() || !payload.description?.trim() || !payload.targetDepartment?.trim()) {
    throw new Error("\u4efb\u52a1\u6807\u9898\u3001\u4efb\u52a1\u8bf4\u660e\u548c\u627f\u63a5\u90e8\u95e8\u4e0d\u80fd\u4e3a\u7a7a");
  }

  const sourceDepartment = payload.sourceDepartment?.trim() || ZH.board;
  const targetDepartment = payload.targetDepartment.trim();
  const workflow = getTaskWorkflowDefinition();
  if (!workflow) throw new Error("当前没有可用的任务流程");
  assertWorkflowIsRunnable(workflow);
  const submitTransition = workflow ? resolveWorkflowTransitionByAction(workflow, "submit") : null;
  const sourceReviewNode = workflow ? getWorkflowNodeByAction(workflow, "source_review") : null;
  const skipSourceReview = payload.creatorRole === "admin";
  const sourceReviewTransition =
    workflow && sourceReviewNode && skipSourceReview
      ? resolveWorkflowTransition(workflow, sourceReviewNode, "approve")
      : null;
  const initialStatus = skipSourceReview
    ? sourceReviewTransition?.nextStatus || "pending_target_review"
    : submitTransition?.nextStatus || "pending_source_review";
  const id = randomId("mt");
  const currentTime = now();
  const creatorName = payload.creator || ZH.system;
  const sourceReviewer = skipSourceReview ? creatorName : null;

  db.prepare(`
    INSERT INTO tasks (
      id, title, description, source_department, target_department, status, priority, due_date,
      source_reviewer, target_reviewer, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.title.trim(),
    payload.description.trim(),
    sourceDepartment,
    targetDepartment,
    initialStatus,
    payload.priority || "medium",
    payload.dueDate || today(),
    sourceReviewer,
    null,
    currentTime,
    currentTime
  );

  db.prepare(`
    INSERT INTO task_logs (task_id, action, time, user_name)
    VALUES (?, ?, ?, ?)
  `).run(
    id,
    `${ZH.submit}，${workflow ? describeWorkflowTransition(ZH.submit, "approve", submitTransition?.nextNode || null, submitTransition?.traversedNodes || []) : `进入「${ZH.sourceReview}」`}`,
    currentTime,
    creatorName
  );

  if (skipSourceReview) {
    db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `).run(
      id,
      workflow && sourceReviewNode
        ? describeWorkflowTransition(sourceReviewNode.name, "approve", sourceReviewTransition?.nextNode || null, sourceReviewTransition?.traversedNodes || [])
        : `${ZH.sourceReview}通过，进入「${ZH.targetReview}」`,
      currentTime,
      creatorName
    );
  }

  return getTaskById(id)!;
};

export const saveTask = (payload: SaveTaskPayload) => {
  if (!payload.id) throw new Error("缺少任务 ID");
  const task = getTaskById(payload.id);
  if (!task) throw new Error("任务不存在");

  ensureTaskManagementAllowed(task, payload.editorName || ZH.system, payload.editorRole, payload.editorDepartment);

  if (task.status === "completed" || task.status === "rejected") {
    throw new Error("已完成或已驳回的任务不能再编辑");
  }

  const title = payload.title?.trim();
  const description = payload.description?.trim();
  const targetDepartment = payload.targetDepartment?.trim();
  const dueDate = payload.dueDate?.trim();

  if (!title || !description || !targetDepartment) {
    throw new Error("任务标题、任务说明和承接部门不能为空");
  }

  if (task.assignments.length > 0 && targetDepartment !== task.targetDepartment) {
    throw new Error("任务已分派成员，不能再修改承接部门");
  }

  const knownDepartment = db.prepare(`SELECT id FROM departments WHERE name = ?`).get(targetDepartment) as { id: string } | undefined;
  if (!knownDepartment && targetDepartment !== task.targetDepartment) throw new Error("承接部门不存在");

  const currentTime = now();
  runInTransaction(() => {
    db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, target_department = ?, priority = ?, due_date = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title,
      description,
      targetDepartment,
      payload.priority || task.priority,
      dueDate || task.dueDate,
      currentTime,
      task.id
    );

    db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `).run(task.id, "任务信息已更新", currentTime, payload.editorName || ZH.system);
  });

  return getTaskById(task.id)!;
};

export const deleteTask = (taskId: string, payload: DeleteTaskPayload) => {
  const task = getTaskById(taskId);
  if (!task) throw new Error("任务不存在");

  ensureTaskManagementAllowed(task, payload.userName, payload.userRole, payload.userDepartment);

  if (task.status === "completed") {
    throw new Error("已完成任务不能删除");
  }

  if (task.assignments.length > 0) {
    throw new Error("任务已经指派成员，不能直接删除");
  }

  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId);
  return { success: true };
};

export const executeTaskAction = (taskId: string, payload: ExecuteTaskActionPayload) => {
  const task = getTaskById(taskId);
  if (!task) throw new Error("任务不存在");

  const workflow = getTaskWorkflowDefinition();
  if (!workflow) throw new Error("当前没有可用的任务流程");
  assertWorkflowIsRunnable(workflow);

  const currentNode = getCurrentWorkflowNode(task, workflow);
  if (!currentNode) {
    throw new Error(`当前任务状态「${task.status}」未映射到启用流程中的任何节点`);
  }

  canOperateTaskNode(
    task,
    currentNode,
    payload.userId,
    payload.userName,
    payload.userRole,
    payload.userDepartment
  );

  const requestedAction =
    payload.action ||
    (currentNode.action === "assign"
      ? "assign"
      : currentNode.actor === "target_member"
        ? "feedback"
        : "approve");

  if (requestedAction === "assign") {
    if (currentNode.action !== "assign") {
      throw new Error(`当前节点「${currentNode.name}」不支持指派成员`);
    }
    if (!payload.assigneeId || !payload.assigneeName) {
      throw new Error("必须指定执行成员");
    }
    executeAssign(task, workflow, currentNode, payload.assigneeId, payload.assigneeName, payload.userName);
    return getTaskById(taskId)!;
  }

  if (requestedAction === "feedback") {
    if (currentNode.actor !== "target_member") {
      throw new Error(`当前节点「${currentNode.name}」不支持成员反馈`);
    }
    if (!payload.assigneeId) {
      throw new Error("缺少任务分派记录");
    }
    executeFeedback(task, workflow, currentNode, payload.assigneeId, payload.feedbackText || "", payload.attachments || []);
    return getTaskById(taskId)!;
  }

  if (requestedAction === "approve" || requestedAction === "complete") {
    executeApproveOrReject(task, workflow, currentNode, payload.userName, true);
    return getTaskById(taskId)!;
  }

  if (requestedAction === "reject") {
    executeApproveOrReject(task, workflow, currentNode, payload.userName, false);
    return getTaskById(taskId)!;
  }

  throw new Error(`不支持的流程动作：${requestedAction}`);
};

export const reviewTaskSource = (
  taskId: string,
  reviewerName: string,
  reviewerRole?: UserRole,
  reviewerDepartment?: string,
  approved = true
) => {
  return executeTaskAction(taskId, {
    action: approved ? "approve" : "reject",
    userName: reviewerName,
    userRole: reviewerRole,
    userDepartment: reviewerDepartment,
  });
};

export const reviewTaskTarget = (
  taskId: string,
  reviewerName: string,
  reviewerRole?: UserRole,
  reviewerDepartment?: string,
  approved = true
) => {
  return executeTaskAction(taskId, {
    action: approved ? "approve" : "reject",
    userName: reviewerName,
    userRole: reviewerRole,
    userDepartment: reviewerDepartment,
  });
};

export const updateTaskStatus = (taskId: string, status: TaskStatus, user: string) => {
  const task = getTaskById(taskId);
  if (!task) throw new Error("\u4efb\u52a1\u4e0d\u5b58\u5728");

  const currentTime = now();
  runInTransaction(() => {
    db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, currentTime, taskId);

    db.prepare(`
      INSERT INTO task_logs (task_id, action, time, user_name)
      VALUES (?, ?, ?, ?)
    `).run(taskId, `\u4efb\u52a1\u72b6\u6001\u66f4\u65b0\u4e3a\uff1a${statusLabelMap[status]}`, currentTime, user || ZH.system);
  });

  return getTaskById(taskId)!;
};

export const assignTask = (
  taskId: string,
  assigneeId: string,
  assigneeName: string,
  managerName: string,
  managerRole?: UserRole,
  managerDepartment?: string
) => {
  return executeTaskAction(taskId, {
    action: "assign",
    userName: managerName,
    userRole: managerRole,
    userDepartment: managerDepartment,
    assigneeId,
    assigneeName,
  });
};

export const submitTaskFeedback = (taskId: string, assignmentId: string, feedbackText: string, attachments: string[]) => {
  const task = getTaskById(taskId);
  const assignee = task?.assignments.find((item) => item.id === assignmentId);
  if (!assignee) throw new Error("任务分派记录不存在");

  return executeTaskAction(taskId, {
    action: "feedback",
    userId: assignee.assigneeId,
    userName: assignee.assigneeName,
    feedbackText,
    attachments,
    assigneeId: assignmentId,
  });
};

const getDepartmentTree = () => buildDepartmentTree(getDepartmentRows());

export const listDepartments = () => getDepartmentTree();

export const listWorkflows = () => {
  const rows = db.prepare(`
    SELECT workflow_key
    FROM workflow_definitions
    WHERE is_active = 1
    ORDER BY workflow_key ASC
  `).all() as Array<{ workflow_key: string }>;

  return rows
    .map((row) => getWorkflowByKeyInternal(row.workflow_key))
    .filter((item): item is WorkflowDefinition => Boolean(item));
};

export const getWorkflow = (key: string) => getWorkflowByKeyInternal(key);

export const activateTaskWorkflow = (key: string, updatedBy = "\u7cfb\u7edf\u7ba1\u7406\u5458") => {
  const workflow = getWorkflowByKeyInternal(key);
  if (!workflow) throw new Error("\u6d41\u7a0b\u5b9a\u4e49\u4e0d\u5b58\u5728");

  runInTransaction(() => {
    setSettingValue("activeTaskWorkflowKey", key);
    db.prepare(`
      UPDATE workflow_definitions
      SET updated_at = ?, updated_by = ?
      WHERE workflow_key = ?
    `).run(now(), updatedBy, key);
  });

  return getWorkflowByKeyInternal(key)!;
};

const assertWorkflowManageable = (workflow: WorkflowDefinition | null, actorId?: string, actorName?: string) => {
  if (!workflow) throw new Error("\u6d41\u7a0b\u5b9a\u4e49\u4e0d\u5b58\u5728");
  if (workflow.isBuiltIn) {
    throw new Error("\u9ed8\u8ba4\u6d41\u7a0b\u4e0d\u53ef\u76f4\u63a5\u4fee\u6539\u6216\u5220\u9664\uff1b\u5982\u9700\u81ea\u5b9a\u4e49\uff0c\u8bf7\u5148\u65b0\u5efa\u81ea\u5df1\u7684\u6d41\u7a0b");
  }
  if (!workflow.ownerId) return;
  if (actorId && workflow.ownerId === actorId) return;
  if (!actorId && actorName && workflow.ownerName === actorName) return;
  throw new Error("\u53ea\u80fd\u7ba1\u7406\u81ea\u5df1\u521b\u5efa\u7684\u6d41\u7a0b");
};

export const deleteWorkflow = (key: string, actor?: { userId?: string; userName?: string }) => {
  const workflowKey = key.trim();
  const existing = getWorkflowByKeyInternal(workflowKey);
  assertWorkflowManageable(existing, actor?.userId, actor?.userName);
  if (workflowKey === getTaskWorkflowKey()) {
    throw new Error("\u8be5\u6d41\u7a0b\u6b63\u5728\u4efb\u52a1\u770b\u677f\u4e2d\u4f7f\u7528\uff0c\u8bf7\u5148\u5e94\u7528\u5176\u4ed6\u6d41\u7a0b\u540e\u518d\u5220\u9664");
  }

  db.prepare(`
    UPDATE workflow_definitions
    SET is_active = 0, updated_at = ?
    WHERE workflow_key = ?
  `).run(now(), workflowKey);
};

export const saveWorkflow = (
  payload: Partial<WorkflowDefinition> & { key?: string; updatedBy?: string; updatedById?: string }
) => {
  const workflowKey = payload.key?.trim() || "task_fulfillment";
  const existing = getWorkflowByKeyInternal(workflowKey);
  if (existing) {
    assertWorkflowManageable(existing, payload.updatedById, payload.updatedBy);
  }
  const nodes = normalizeWorkflowLayout(
    sanitizeWorkflowNodes(payload.nodes || existing?.nodes || defaultTaskWorkflowNodes())
  ).nodes;
  const name = payload.name?.trim() || existing?.name || "\u8de8\u90e8\u95e8\u4efb\u52a1\u6d41\u7a0b";
  const description =
    payload.description?.trim() || existing?.description || "\u9700\u6c42\u63d0\u4ea4\u3001\u5ba1\u6838\u3001\u6307\u6d3e\u4e0e\u53cd\u9988\u7684\u6807\u51c6\u4e1a\u52a1\u6d41\u7a0b\u3002";
  const updatedAt = now();
  const updatedBy = payload.updatedBy?.trim() || "\u7cfb\u7edf\u7ba1\u7406\u5458";
  const ownerId = existing?.ownerId || payload.updatedById?.trim() || undefined;
  const ownerName = existing?.ownerName || payload.updatedBy?.trim() || updatedBy;
  assertWorkflowIsRunnable({
    id: existing?.id || "",
    key: workflowKey,
    name,
    description,
    updatedAt,
    updatedBy,
    ownerId,
    ownerName,
    isBuiltIn: existing?.isBuiltIn || false,
    nodes,
  });

  runInTransaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE workflow_definitions
        SET name = ?, description = ?, nodes_json = ?, updated_at = ?, updated_by = ?, owner_id = COALESCE(owner_id, ?), owner_name = COALESCE(owner_name, ?)
        WHERE workflow_key = ?
      `).run(name, description, JSON.stringify(nodes), updatedAt, updatedBy, ownerId || null, ownerName || null, workflowKey);
      return;
    }

    db.prepare(`
      INSERT INTO workflow_definitions (
        id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by, owner_id, owner_name, is_builtin
      )
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0)
    `).run(randomId("wf"), workflowKey, name, description, JSON.stringify(nodes), updatedAt, updatedBy, ownerId || null, ownerName || null);
  });

  return getWorkflowByKeyInternal(workflowKey)!;
};

export const saveDepartment = (dept: Partial<Department> & { parentId?: string }) => {
  const name = dept.name?.trim() || "";
  const manager = dept.manager?.trim() || "";
  if (!name || !manager) {
    throw new Error("\u90e8\u95e8\u540d\u79f0\u548c\u8d1f\u8d23\u4eba\u4e0d\u80fd\u4e3a\u7a7a");
  }
  if (/^\d+$/.test(name)) {
    throw new Error("\u90e8\u95e8\u540d\u79f0\u4e0d\u80fd\u53ea\u5305\u542b\u6570\u5b57");
  }

  try {
    return runInTransaction(() => {
      if (dept.id) {
        const existing = db.prepare(`
          SELECT id, name, parent_id
          FROM departments
          WHERE id = ?
        `).get(dept.id) as { id: string; name: string; parent_id: string | null } | undefined;

        if (!existing) throw new Error("\u90e8\u95e8\u4e0d\u5b58\u5728");

        db.prepare(`
          UPDATE departments
          SET name = ?, manager = ?
          WHERE id = ?
        `).run(name, manager, dept.id);

        if (existing.name !== name) {
          db.prepare(`UPDATE users SET department = ? WHERE department = ?`).run(name, existing.name);
          db.prepare(`UPDATE tasks SET source_department = ? WHERE source_department = ?`).run(name, existing.name);
          db.prepare(`UPDATE tasks SET target_department = ? WHERE target_department = ?`).run(name, existing.name);
        }

        return { id: dept.id, name, manager, memberCount: 0, parentId: existing.parent_id };
      }

      const parentId =
        dept.parentId ||
        (((db.prepare(`
          SELECT id
          FROM departments
          WHERE parent_id IS NULL AND id != 'unassigned'
          ORDER BY sort_order ASC
          LIMIT 1
        `).get() as { id: string } | undefined)?.id) ?? null);

      const nextSort = Number(
        ((db.prepare(`
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort
          FROM departments
          WHERE parent_id IS ?
        `).get(parentId) as { next_sort: number }).next_sort)
      );

      const id = randomId("d");
      db.prepare(`
        INSERT INTO departments (id, name, manager, parent_id, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, name, manager, parentId, nextSort);

      return { id, name, manager, memberCount: 0, parentId };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: departments.name")) {
      throw new Error("\u90e8\u95e8\u540d\u79f0\u5df2\u5b58\u5728\uff0c\u8bf7\u4fee\u6539\u540e\u518d\u4fdd\u5b58");
    }
    throw error;
  }
};

export const deleteDepartment = (departmentId: string) => {
  ensureUnassignedDepartment();

  const rows = getDepartmentRows();
  const target = rows.find((row) => row.id === departmentId);
  if (!target) throw new Error("\u90e8\u95e8\u4e0d\u5b58\u5728");
  if (target.id === "unassigned") throw new Error("\u672a\u5206\u914d\u90e8\u95e8\u4e0d\u80fd\u5220\u9664");

  const childrenMap = new Map<string | null, DepartmentRow[]>();
  rows.forEach((row) => {
    const bucket = childrenMap.get(row.parent_id) || [];
    bucket.push(row);
    childrenMap.set(row.parent_id, bucket);
  });

  const ids: string[] = [];
  const names: string[] = [];
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop()!;
    ids.push(current.id);
    names.push(current.name);
    stack.push(...(childrenMap.get(current.id) || []));
  }

  runInTransaction(() => {
    names.forEach((name) => {
      db.prepare(`UPDATE users SET department = ? WHERE department = ?`).run(ZH.unassigned, name);
      db.prepare(`UPDATE tasks SET source_department = ? WHERE source_department = ?`).run(ZH.unassigned, name);
      db.prepare(`UPDATE tasks SET target_department = ? WHERE target_department = ?`).run(ZH.unassigned, name);
    });
    ids.forEach((id) => db.prepare(`DELETE FROM departments WHERE id = ?`).run(id));
  });
};

export const listApprovals = () => {
  const rows = db.prepare(`
    SELECT id, title, type, requester, status, description, created_at
    FROM approvals
    ORDER BY created_at DESC, id DESC
  `).all() as Array<{
    id: string;
    title: string;
    type: string;
    requester: string;
    status: ApprovalStatus;
    description: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    requester: row.requester,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
  }));
};

export const updateApprovalStatus = (id: string, status: ApprovalStatus) => {
  const existing = db.prepare(`SELECT id FROM approvals WHERE id = ?`).get(id) as { id: string } | undefined;
  if (!existing) throw new Error("\u5ba1\u6279\u5355\u4e0d\u5b58\u5728");
  db.prepare(`UPDATE approvals SET status = ? WHERE id = ?`).run(status, id);
  return listApprovals().find((item) => item.id === id)!;
};

export const getSettings = () => {
  const rows = db.prepare(`SELECT ${appSettingsKeyColumn} AS key, value FROM app_settings`).all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

export const updateProfile = (id: string, name?: string, email?: string, avatar?: string) => {
  const existing = getUserByIdInternal(id);
  if (!existing) throw new Error("\u7528\u6237\u4e0d\u5b58\u5728");

  db.prepare(`
    UPDATE users
    SET name = ?, email = ?, avatar = ?
    WHERE id = ?
  `).run(
    name?.trim() || existing.name,
    email?.trim() || existing.email,
    avatar?.trim() || existing.avatar,
    id
  );

  return publicUser(getUserByIdInternal(id)!);
};

export const getAnalytics = () => {
  const tasks = listTasks();
  const users = listUsers() as Array<Omit<UserRecord, "password">>;
  const approvals = listApprovals();
  const departments = listDepartments();

  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const pendingTasks = tasks.filter((task) =>
    ["pending_source_review", "pending_target_review", "ready_for_assignment"].includes(task.status)
  ).length;
  const ongoingTasks = tasks.filter((task) => task.status === "in_progress").length;
  const averageCompletionRate = tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100);

  const uniqueDepartments = departments
    .flatMap((dept) => [dept, ...(dept.children || [])])
    .filter((dept, index, list) => list.findIndex((item) => item.id === dept.id) === index && dept.name !== ZH.unassigned);

  const departmentLoads = uniqueDepartments
    .map((dept, index) => {
      const relatedTasks = tasks.filter((task) => task.targetDepartment === dept.name);
      const load = tasks.length === 0 ? 0 : Math.round((relatedTasks.length / tasks.length) * 100);
      return {
        name: dept.name,
        val: Math.max(relatedTasks.length > 0 ? 10 : 0, load),
        color: ["bg-blue-500", "bg-orange-500", "bg-green-500", "bg-purple-500"][index % 4],
      };
    })
    .filter((item) => item.val > 0)
    .sort((a, b) => b.val - a.val);

  const sevenDays = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    return date;
  });

  const dailyWorkload = sevenDays.map((date) => {
    const taskCount = tasks.filter((task) => {
      const matched = parseDateValue(task.dueDate);
      return matched ? isSameDay(matched, date) : false;
    }).length;
    const approvalCount = approvals.filter((approval) => {
      const matched = parseDateValue(approval.createdAt);
      return matched ? isSameDay(matched, date) : false;
    }).length;
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      value: taskCount + approvalCount,
    };
  });

  const feedbackCount = tasks.reduce(
    (sum, task) => sum + task.assignments.filter((item) => item.feedbackText || item.attachments?.length).length,
    0
  );

  const companyWorkload = [
    { label: "\u4efb\u52a1\u603b\u91cf", total: tasks.length, tasks: tasks.length, approvals: 0, feedbacks: 0 },
    { label: "\u5ba1\u6279\u603b\u91cf", total: approvals.length, tasks: 0, approvals: approvals.length, feedbacks: 0 },
    { label: "\u6210\u5458\u53cd\u9988", total: feedbackCount, tasks: 0, approvals: 0, feedbacks: feedbackCount },
  ];

  const departmentStats = uniqueDepartments
    .map((dept) => {
      const relatedTasks = tasks.filter((task) => task.targetDepartment === dept.name || task.sourceDepartment === dept.name);
      const activeTasks = relatedTasks.filter((task) => task.status !== "completed" && task.status !== "rejected").length;
      const finishedTasks = relatedTasks.filter((task) => task.status === "completed").length;

      return {
        name: dept.name,
        memberCount: dept.memberCount,
        totalTasks: relatedTasks.length,
        activeTasks,
        completedTasks: finishedTasks,
        completionRate: relatedTasks.length === 0 ? 0 : Math.round((finishedTasks / relatedTasks.length) * 100),
      };
    })
    .sort((a, b) => b.totalTasks - a.totalTasks);

  const employeeStats = users
    .map((user) => {
      const assignments = tasks.flatMap((task) => task.assignments).filter((assignment) => assignment.assigneeId === user.id);
      const completedAssignments = assignments.filter((item) => item.status === "submitted" || item.status === "completed").length;
      const activeAssignments = assignments.filter((item) => item.status === "todo" || item.status === "in-progress").length;
      return {
        name: user.name,
        department: user.department,
        role: user.role,
        totalAssignments: assignments.length,
        completedAssignments,
        activeAssignments,
      };
    })
    .sort((a, b) => b.totalAssignments - a.totalAssignments);

  return {
    yearlySummary: `\u5f53\u524d OA \u5b9e\u65f6\u6c47\u603b ${tasks.length} \u4e2a\u4efb\u52a1\u3001${approvals.length} \u6761\u5ba1\u6279\u3001${users.length} \u540d\u5458\u5de5\u548c ${departmentStats.length} \u4e2a\u90e8\u95e8\u8282\u70b9\u3002`,
    completedTasks,
    ongoingTasks,
    pendingTasks,
    averageCompletionRate,
    totalUsers: users.length,
    totalDepartments: departmentStats.length,
    pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
    companyWorkload,
    dailyWorkload,
    departmentLoads,
    departmentStats,
    employeeStats,
  };
};

export const exportAnalyticsAsExcel = () => {
  const analytics = getAnalytics();
  const departmentRows = analytics.departmentStats
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.memberCount}</td>
          <td>${item.totalTasks}</td>
          <td>${item.activeTasks}</td>
          <td>${item.completedTasks}</td>
          <td>${item.completionRate}%</td>
        </tr>`
    )
    .join("");
  const employeeRows = analytics.employeeStats
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.department)}</td>
          <td>${escapeHtml(item.role)}</td>
          <td>${item.totalAssignments}</td>
          <td>${item.activeAssignments}</td>
          <td>${item.completedAssignments}</td>
        </tr>`
    )
    .join("");
  const workloadRows = analytics.dailyWorkload
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${item.value}</td>
        </tr>`
    )
    .join("");
  const companyRows = analytics.companyWorkload
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${item.total}</td>
          <td>${item.tasks}</td>
          <td>${item.approvals}</td>
          <td>${item.feedbacks}</td>
        </tr>`
    )
    .join("");

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="utf-8" /></head>
      <body>
        <table border="1">
          <tr><th colspan="6">NovaOffice OA \u5b9e\u65f6\u6570\u636e\u5206\u6790</th></tr>
          <tr><td>\u5b8c\u6210\u4efb\u52a1</td><td>${analytics.completedTasks}</td><td>\u8fdb\u884c\u4e2d</td><td>${analytics.ongoingTasks}</td><td>\u5f85\u5904\u7406</td><td>${analytics.pendingTasks}</td></tr>
          <tr><td>\u5458\u5de5\u603b\u6570</td><td>${analytics.totalUsers}</td><td>\u90e8\u95e8\u603b\u6570</td><td>${analytics.totalDepartments}</td><td>\u5f85\u5ba1\u6279</td><td>${analytics.pendingApprovals}</td></tr>
          <tr><td>\u5e73\u5747\u5b8c\u6210\u7387</td><td>${analytics.averageCompletionRate}%</td><td colspan="4">${escapeHtml(analytics.yearlySummary)}</td></tr>
        </table>
        <br />
        <table border="1">
          <tr><th colspan="5">\u516c\u53f8\u5de5\u4f5c\u91cf</th></tr>
          <tr><th>\u7c7b\u522b</th><th>\u603b\u91cf</th><th>\u4efb\u52a1</th><th>\u5ba1\u6279</th><th>\u53cd\u9988</th></tr>
          ${companyRows}
        </table>
        <br />
        <table border="1">
          <tr><th colspan="2">\u8fd1 7 \u65e5\u5de5\u4f5c\u91cf</th></tr>
          <tr><th>\u65e5\u671f</th><th>\u5de5\u4f5c\u91cf</th></tr>
          ${workloadRows}
        </table>
        <br />
        <table border="1">
          <tr><th colspan="6">\u90e8\u95e8\u5b9e\u65f6\u7edf\u8ba1</th></tr>
          <tr>
            <th>\u90e8\u95e8</th>
            <th>\u6210\u5458\u6570</th>
            <th>\u4efb\u52a1\u603b\u91cf</th>
            <th>\u8fdb\u884c\u4e2d</th>
            <th>\u5df2\u5b8c\u6210</th>
            <th>\u5b8c\u6210\u7387</th>
          </tr>
          ${departmentRows}
        </table>
        <br />
        <table border="1">
          <tr><th colspan="6">\u5458\u5de5\u5de5\u4f5c\u91cf</th></tr>
          <tr>
            <th>\u5458\u5de5</th>
            <th>\u90e8\u95e8</th>
            <th>\u89d2\u8272</th>
            <th>\u6307\u6d3e\u603b\u91cf</th>
            <th>\u8fdb\u884c\u4e2d</th>
            <th>\u5df2\u5b8c\u6210</th>
          </tr>
          ${employeeRows}
        </table>
      </body>
    </html>
  `.trim();
};

export const getDatabasePath = () => dbPath;
