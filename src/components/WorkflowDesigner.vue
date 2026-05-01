<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  ListTree,
  Plus,
  Save,
  Search,
  Trash2,
  Workflow,
} from 'lucide-vue-next';
import type {
  WorkflowDefinition,
  WorkflowEdgeWaypoint,
  WorkflowNode,
  WorkflowNodeAction,
  WorkflowNodeActor,
  WorkflowNodeKind
} from '../types';

const props = defineProps<{
  workflow: WorkflowDefinition | null;
  saving?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
}>();

const emit = defineEmits<{
  (e: 'save', workflow: WorkflowDefinition): void;
}>();

type NodeTemplate = {
  id: string;
  name: string;
  description: string;
  action: WorkflowNodeAction;
  actor: WorkflowNodeActor;
  kind: WorkflowNodeKind;
  status?: WorkflowNode['status'];
};

const CARD_WIDTH = 300;
const CARD_HEIGHT = 156;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const MINIMAP_WIDTH = 184;
const MINIMAP_HEIGHT = 112;
const LAYOUT_START_X = 96;
const LAYOUT_START_Y = 180;
const LAYOUT_COLUMN_GAP = 372;
const LAYOUT_ROW_GAP = 220;
const QUICK_TEMPLATE_IDS = ['task_submit', 'task_source_review', 'task_target_review', 'task_assign', 'task_feedback', 'task_complete'];

const taskWorkflowRequirements: Array<{ action: WorkflowNodeAction; label: string }> = [
  { action: 'submit', label: '需求提交' },
  { action: 'complete', label: '流程完成' }
];

const actorOptions: Array<{ value: WorkflowNodeActor; label: string }> = [
  { value: 'initiator', label: '发起人' },
  { value: 'source_manager', label: '发起部门负责人' },
  { value: 'target_manager', label: '承接部门负责人' },
  { value: 'target_member', label: '承接部门成员' },
  { value: 'system', label: '系统自动执行' },
  { value: 'any', label: '任意角色' }
];

const actionOptions: Array<{ value: WorkflowNodeAction; label: string }> = [
  { value: 'submit', label: '需求提交' },
  { value: 'source_review', label: '发起审核' },
  { value: 'target_review', label: '承接审核' },
  { value: 'assign', label: '部门指派' },
  { value: 'feedback', label: '成员反馈' },
  { value: 'manual', label: '人工任务' },
  { value: 'approval', label: '审批任务' },
  { value: 'condition', label: '条件分支' },
  { value: 'parallel', label: '并行网关' },
  { value: 'cc', label: '抄送节点' },
  { value: 'notify', label: '通知节点' },
  { value: 'script', label: '脚本动作' },
  { value: 'subprocess', label: '子流程' },
  { value: 'complete', label: '完成' },
  { value: 'reject', label: '驳回' }
];

const kindOptions: Array<{ value: WorkflowNodeKind; label: string }> = [
  { value: 'start', label: '开始节点' },
  { value: 'review', label: '审核节点' },
  { value: 'task', label: '任务节点' },
  { value: 'gateway', label: '网关节点' },
  { value: 'notification', label: '通知节点' },
  { value: 'automation', label: '自动动作' },
  { value: 'subprocess', label: '子流程节点' },
  { value: 'end', label: '结束节点' }
];

const statusOptions = [
  { value: '', label: '无状态' },
  { value: 'pending_source_review', label: '待发起部门审核' },
  { value: 'pending_target_review', label: '待承接部门审核' },
  { value: 'ready_for_assignment', label: '待部门指派' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'rejected', label: '已驳回' }
] as const;

const nodeTemplates: NodeTemplate[] = [
  { id: 'task_submit', name: '需求提交', description: '流程发起入口，员工或负责人提交需求', action: 'submit', actor: 'initiator', kind: 'start' },
  { id: 'task_source_review', name: '发起部门审核', description: '发起部门负责人审核需求合理性', action: 'source_review', actor: 'source_manager', kind: 'review', status: 'pending_source_review' },
  { id: 'task_target_review', name: '承接部门审核', description: '承接部门负责人确认是否接收处理', action: 'target_review', actor: 'target_manager', kind: 'review', status: 'pending_target_review' },
  { id: 'task_assign', name: '部门指派', description: '部门负责人指派给具体执行成员', action: 'assign', actor: 'target_manager', kind: 'task', status: 'ready_for_assignment' },
  { id: 'task_feedback', name: '成员反馈', description: '执行成员提交处理结果和附件', action: 'feedback', actor: 'target_member', kind: 'task', status: 'in_progress' },
  { id: 'task_complete', name: '流程完成', description: '任务处理完成并进入结办状态', action: 'complete', actor: 'system', kind: 'end', status: 'completed' },
  { id: 'task_reject', name: '流程驳回', description: '审核不通过或流程终止', action: 'reject', actor: 'system', kind: 'end', status: 'rejected' },
  { id: 'manual', name: '人工任务', description: '普通人工处理节点', action: 'manual', actor: 'any', kind: 'task' },
  { id: 'approval', name: '审批任务', description: '灵活审批环节', action: 'approval', actor: 'any', kind: 'review' },
  { id: 'condition', name: '条件分支', description: '按条件做分流', action: 'condition', actor: 'system', kind: 'gateway' },
  { id: 'parallel', name: '并行网关', description: '分发或汇聚并行分支', action: 'parallel', actor: 'system', kind: 'gateway' },
  { id: 'cc', name: '抄送节点', description: '只读知会动作', action: 'cc', actor: 'system', kind: 'notification' },
  { id: 'notify', name: '通知节点', description: '向角色或部门发送通知', action: 'notify', actor: 'system', kind: 'notification' },
  { id: 'script', name: '脚本动作', description: '调用规则或自动脚本', action: 'script', actor: 'system', kind: 'automation' },
  { id: 'subprocess', name: '子流程', description: '切换到另一套流程处理', action: 'subprocess', actor: 'system', kind: 'subprocess' },
  { id: 'complete', name: '完成节点', description: '流程正常结束', action: 'complete', actor: 'system', kind: 'end', status: 'completed' },
  { id: 'reject', name: '驳回节点', description: '流程驳回或终止', action: 'reject', actor: 'system', kind: 'end', status: 'rejected' }
];

const buildStandardTaskWorkflowNodes = (): WorkflowNode[] => [
  {
    id: 'wf_submit',
    name: '需求提交',
    description: '需求发起入口',
    action: 'submit',
    actor: 'initiator',
    kind: 'start',
    x: LAYOUT_START_X,
    y: 260,
    nextNodeId: 'wf_source_review'
  },
  {
    id: 'wf_source_review',
    name: '发起部门审核',
    description: '发起部门负责人审核需求是否合理',
    action: 'source_review',
    actor: 'source_manager',
    kind: 'review',
    status: 'pending_source_review',
    x: LAYOUT_START_X + LAYOUT_COLUMN_GAP,
    y: 260,
    nextNodeId: 'wf_target_review',
    rejectNodeId: 'wf_reject'
  },
  {
    id: 'wf_target_review',
    name: '承接部门审核',
    description: '承接部门负责人确认是否接收任务',
    action: 'target_review',
    actor: 'target_manager',
    kind: 'review',
    status: 'pending_target_review',
    x: LAYOUT_START_X + LAYOUT_COLUMN_GAP * 2,
    y: 260,
    nextNodeId: 'wf_assign',
    rejectNodeId: 'wf_reject'
  },
  {
    id: 'wf_assign',
    name: '部门指派',
    description: '承接部门负责人将任务分配给成员',
    action: 'assign',
    actor: 'target_manager',
    kind: 'task',
    status: 'ready_for_assignment',
    x: LAYOUT_START_X + LAYOUT_COLUMN_GAP * 3,
    y: 260,
    nextNodeId: 'wf_feedback'
  },
  {
    id: 'wf_feedback',
    name: '成员处理反馈',
    description: '成员处理任务并提交结果与附件',
    action: 'feedback',
    actor: 'target_member',
    kind: 'task',
    status: 'in_progress',
    x: LAYOUT_START_X + LAYOUT_COLUMN_GAP * 4,
    y: 260,
    nextNodeId: 'wf_complete'
  },
  {
    id: 'wf_complete',
    name: '流程完成',
    description: '任务验收完成后结束流程',
    action: 'complete',
    actor: 'system',
    kind: 'end',
    status: 'completed',
    x: LAYOUT_START_X + LAYOUT_COLUMN_GAP * 5,
    y: 260
  },
  {
    id: 'wf_reject',
    name: '流程驳回',
    description: '审核不通过时结束流程',
    action: 'reject',
    actor: 'system',
    kind: 'end',
    status: 'rejected',
    x: LAYOUT_START_X + LAYOUT_COLUMN_GAP * 2,
    y: 520
  }
];

const canvasRef = ref<HTMLElement | null>(null);
const draft = ref<WorkflowDefinition | null>(null);
const selectedNodeId = ref('');
const isNodeLibraryOpen = ref(false);
const isInspectorOpen = ref(false);
const nodeSearchQuery = ref('');
const zoom = ref(1);
const isPanMode = ref(false);
const ignoreNextCanvasClick = ref(false);
const editorMode = ref<'simple' | 'canvas'>('simple');
const inspectorSections = ref({
  workflowMeta: false,
  nodeList: false,
  selectedNode: false
});

const dragState = ref<{
  nodeId: string;
  offsetX: number;
  offsetY: number;
  moved: boolean;
} | null>(null);

const panState = ref<{
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
} | null>(null);

const connectState = ref<{
  sourceNodeId: string;
  branch: 'next' | 'reject';
  currentX: number;
  currentY: number;
  moved: boolean;
} | null>(null);

const edgeDragState = ref<{
  nodeId: string;
  branch: 'next' | 'reject';
  targetNodeId: string;
} | null>(null);

const calculateOrganizedPositions = (nodes: WorkflowNode[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));

  nodes.forEach((node) => {
    if (node.nextNodeId && indegree.has(node.nextNodeId)) indegree.set(node.nextNodeId, (indegree.get(node.nextNodeId) || 0) + 1);
    if (node.rejectNodeId && indegree.has(node.rejectNodeId)) indegree.set(node.rejectNodeId, (indegree.get(node.rejectNodeId) || 0) + 1);
  });

  const startNodes = nodes.filter((node) => (indegree.get(node.id) || 0) === 0);
  const queue = (startNodes.length ? startNodes : nodes.slice(0, 1)).map((node, index) => ({
    id: node.id,
    depth: 0,
    lane: index * 2
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
      queue.push({ id: node.nextNodeId, depth: current.depth + 1, lane: current.lane });
    }
    if (node.rejectNodeId && nodeMap.has(node.rejectNodeId)) {
      queue.push({ id: node.rejectNodeId, depth: current.depth + 1, lane: current.lane + 1 });
    }
  }

  nodes.forEach((node, index) => {
    if (!positions.has(node.id)) {
      positions.set(node.id, { depth: index % 4, lane: Math.floor(index / 4) * 2 });
    }
  });

  return new Map(
    nodes.map((node) => {
      const slot = positions.get(node.id)!;
      return [
        node.id,
        {
          x: LAYOUT_START_X + slot.depth * LAYOUT_COLUMN_GAP,
          y: LAYOUT_START_Y + slot.lane * LAYOUT_ROW_GAP
        }
      ];
    })
  );
};

const isCrowdedLayout = (nodes: WorkflowNode[]) => {
  if (nodes.length < 3) return false;

  const sameRowCount = nodes.filter((node) => Math.abs(node.y - nodes[0].y) < 48).length;
  const overlaps = nodes.some((node, index) =>
    nodes.slice(index + 1).some((other) => Math.abs(node.x - other.x) < CARD_WIDTH * 0.85 && Math.abs(node.y - other.y) < CARD_HEIGHT * 0.75)
  );

  return overlaps || sameRowCount / nodes.length > 0.7;
};

const organizeWorkflowLayout = (fit = false) => {
  if (!draft.value?.nodes.length) return;

  const positions = calculateOrganizedPositions(draft.value.nodes);
  draft.value.nodes = draft.value.nodes.map((node) => ({
    ...node,
    x: positions.get(node.id)?.x ?? node.x,
    y: positions.get(node.id)?.y ?? node.y
  }));

  if (fit) {
    requestAnimationFrame(() => {
      fitToView();
    });
  }
};

const cloneWorkflow = (workflow: WorkflowDefinition | null) => {
  draft.value = workflow ? JSON.parse(JSON.stringify(workflow)) : null;
  selectedNodeId.value = '';
  isInspectorOpen.value = false;
  dragState.value = null;
  panState.value = null;
  connectState.value = null;
  edgeDragState.value = null;

  if (draft.value?.nodes?.length && isCrowdedLayout(draft.value.nodes)) {
    organizeWorkflowLayout(false);
  }

  if (draft.value?.nodes?.length) {
    requestAnimationFrame(() => {
      fitToView();
    });
  }
};

watch(
  () => props.workflow,
  (workflow) => {
    cloneWorkflow(workflow);
  },
  { immediate: true }
);

const selectedNode = computed(() => draft.value?.nodes.find((node) => node.id === selectedNodeId.value) || null);
const selectedNodeIndex = computed(() => sortedNodes.value.findIndex((node) => node.id === selectedNodeId.value));

const sortedNodes = computed(() =>
  [...(draft.value?.nodes || [])].sort((left, right) => {
    if (left.x !== right.x) return left.x - right.x;
    return left.y - right.y;
  })
);
const quickAddTemplates = computed(() =>
  QUICK_TEMPLATE_IDS.map((id) => nodeTemplates.find((template) => template.id === id)).filter((template): template is NodeTemplate => Boolean(template))
);
const primaryPathNodes = computed(() => {
  const nodes = draft.value?.nodes || [];
  const startNode = nodes.find((node) => node.action === 'submit') || nodes.find((node) => node.kind === 'start') || nodes[0];
  if (!startNode) return [] as WorkflowNode[];

  const ordered: WorkflowNode[] = [];
  const visited = new Set<string>();
  let current: WorkflowNode | undefined = startNode;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ordered.push(current);
    current = nodes.find((node) => node.id === current?.nextNodeId);
  }

  return ordered;
});

const filteredNodeTemplates = computed(() => {
  const keyword = nodeSearchQuery.value.trim().toLowerCase();
  if (!keyword) return nodeTemplates;
  return nodeTemplates.filter(
    (template) =>
      template.name.toLowerCase().includes(keyword) || template.description.toLowerCase().includes(keyword)
  );
});
const nodeTemplateSections = computed(() => {
  const sections = [
    {
      title: '常用任务节点',
      items: filteredNodeTemplates.value.filter((item) =>
        ['task_submit', 'task_source_review', 'task_target_review', 'task_assign', 'task_feedback', 'task_complete', 'task_reject'].includes(item.id)
      )
    },
    {
      title: '扩展业务节点',
      items: filteredNodeTemplates.value.filter((item) => ['manual', 'approval', 'condition', 'parallel'].includes(item.id))
    },
    {
      title: '通知与协同',
      items: filteredNodeTemplates.value.filter((item) => ['cc', 'notify'].includes(item.id))
    },
    {
      title: '自动动作',
      items: filteredNodeTemplates.value.filter((item) => ['script', 'subprocess'].includes(item.id))
    },
    {
      title: '结束节点',
      items: filteredNodeTemplates.value.filter((item) => ['complete', 'reject'].includes(item.id))
    }
  ];

  return sections.filter((section) => section.items.length > 0);
});

const canvasDimensions = computed(() => {
  const nodes = draft.value?.nodes || [];
  const maxX = Math.max(0, ...nodes.map((node) => node.x));
  const maxY = Math.max(0, ...nodes.map((node) => node.y));
  return {
    width: Math.max(1320, maxX + CARD_WIDTH + 180),
    height: Math.max(760, maxY + CARD_HEIGHT + 180)
  };
});

const canvasViewportStyle = computed(() => ({
  width: `${canvasDimensions.value.width * zoom.value}px`,
  height: `${canvasDimensions.value.height * zoom.value}px`
}));

const canvasContentStyle = computed(() => ({
  width: `${canvasDimensions.value.width}px`,
  height: `${canvasDimensions.value.height}px`,
  transform: `scale(${zoom.value})`,
  transformOrigin: 'top left'
}));

const miniMapScale = computed(() =>
  Math.min(MINIMAP_WIDTH / canvasDimensions.value.width, MINIMAP_HEIGHT / canvasDimensions.value.height)
);

const miniMapViewport = computed(() => {
  if (!canvasRef.value) {
    return {
      width: 0,
      height: 0,
      left: 0,
      top: 0
    };
  }

  const visibleWidth = canvasRef.value.clientWidth / zoom.value;
  const visibleHeight = canvasRef.value.clientHeight / zoom.value;

  return {
    width: visibleWidth * miniMapScale.value,
    height: visibleHeight * miniMapScale.value,
    left: (canvasRef.value.scrollLeft / zoom.value) * miniMapScale.value,
    top: (canvasRef.value.scrollTop / zoom.value) * miniMapScale.value
  };
});

const canDeleteSelected = computed(() => Boolean(draft.value && selectedNode.value));
const toggleInspectorSection = (section: keyof typeof inspectorSections.value) => {
  inspectorSections.value[section] = !inspectorSections.value[section];
};

const workflowValidation = computed(() => {
  const nodes = draft.value?.nodes || [];
  const messages: string[] = [];
  const ids = new Set(nodes.map((node) => node.id));

  if (!nodes.length) {
    return {
      ok: false,
      messages: ['画布中还没有节点，请先添加或生成一套任务流程。']
    };
  }

  taskWorkflowRequirements.forEach((requirement) => {
    if (!nodes.some((node) => node.action === requirement.action)) {
      messages.push(`缺少「${requirement.label}」节点`);
    }
  });

  const statusOwners = new Map<string, string>();
  nodes.forEach((node) => {
    const needsStatus =
      node.actor !== 'system' &&
      node.action !== 'submit' &&
      node.action !== 'complete' &&
      node.action !== 'reject';

    if (node.actor === 'initiator' && node.action !== 'submit') {
      messages.push(`「${node.name}」当前不支持提交后再次由发起人处理`);
    }

    if (needsStatus && !node.status) {
      messages.push(`「${node.name}」需要绑定任务状态，否则任务无法停留在该节点`);
    }

    if (node.status) {
      if (statusOwners.has(node.status)) {
        messages.push(`任务状态「${getStatusLabel(node.status)}」被多个节点复用，运行时无法区分`);
      } else {
        statusOwners.set(node.status, node.id);
      }
    }
  });

  nodes.forEach((node) => {
    if (node.nextNodeId && !ids.has(node.nextNodeId)) messages.push(`「${node.name}」的主线连接已失效`);
    if (node.rejectNodeId && !ids.has(node.rejectNodeId)) messages.push(`「${node.name}」的驳回线连接已失效`);
  });

  const startNode = nodes.find((node) => node.action === 'submit') || nodes.find((node) => node.kind === 'start') || nodes[0];
  const visited = new Set<string>();
  const walk = (nodeId?: string) => {
    if (!nodeId || visited.has(nodeId)) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    visited.add(nodeId);
    walk(node.nextNodeId);
    walk(node.rejectNodeId);
  };

  walk(startNode?.id);
  const unreachable = nodes.filter((node) => !visited.has(node.id));
  if (unreachable.length) {
    messages.push(`有 ${unreachable.length} 个节点未接入「需求提交」后的流程链路`);
  }

  const submitNode = nodes.find((node) => node.action === 'submit');
  if (submitNode && !submitNode.nextNodeId) messages.push('「需求提交」需要连接到下一步节点');

  const completeNode = nodes.find((node) => node.action === 'complete');
  if (!completeNode) messages.push('任务看板需要一个「流程完成」节点作为结束状态');

  return {
    ok: messages.length === 0,
    messages
  };
});

const getActionLabel = (action: WorkflowNodeAction) =>
  actionOptions.find((item) => item.value === action)?.label || action;

const getActorLabel = (actor: WorkflowNodeActor) =>
  actorOptions.find((item) => item.value === actor)?.label || actor;

const getStatusLabel = (status?: WorkflowNode['status']) =>
  statusOptions.find((item) => item.value === (status || ''))?.label || '无状态';

const getKindLabel = (kind?: WorkflowNodeKind) =>
  kindOptions.find((item) => item.value === kind)?.label || '任务节点';

const nodeTheme = (node: WorkflowNode) => {
  switch (node.kind) {
    case 'start':
      return { badge: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-300' };
    case 'gateway':
      return { badge: 'bg-amber-50 text-amber-700', border: 'border-amber-300' };
    case 'notification':
      return { badge: 'bg-cyan-50 text-cyan-700', border: 'border-cyan-300' };
    case 'automation':
      return { badge: 'bg-fuchsia-50 text-fuchsia-700', border: 'border-fuchsia-300' };
    case 'subprocess':
      return { badge: 'bg-violet-50 text-violet-700', border: 'border-violet-300' };
    case 'end':
      return { badge: 'bg-slate-100 text-slate-700', border: 'border-slate-300' };
    case 'review':
      return { badge: 'bg-orange-50 text-orange-700', border: 'border-orange-300' };
    default:
      return { badge: 'bg-blue-50 text-blue-700', border: 'border-blue-300' };
  }
};

const labelForNode = (nodeId?: string) => {
  if (!nodeId) return '未连接';
  return draft.value?.nodes.find((node) => node.id === nodeId)?.name || '未连接';
};

const getCanvasPoint = (clientX: number, clientY: number) => {
  if (!canvasRef.value) return { x: 0, y: 0 };
  const rect = canvasRef.value.getBoundingClientRect();
  return {
    x: (clientX - rect.left + canvasRef.value.scrollLeft) / zoom.value,
    y: (clientY - rect.top + canvasRef.value.scrollTop) / zoom.value
  };
};

const getNodeCenter = (node: WorkflowNode) => ({
  x: node.x + CARD_WIDTH / 2,
  y: node.y + CARD_HEIGHT / 2
});

const getNodePortCenter = (node: WorkflowNode, side: 'left' | 'right' | 'top' | 'bottom') => {
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + CARD_HEIGHT / 2 };
    case 'right':
      return { x: node.x + CARD_WIDTH, y: node.y + CARD_HEIGHT / 2 };
    case 'top':
      return { x: node.x + CARD_WIDTH / 2, y: node.y };
    default:
      return { x: node.x + CARD_WIDTH / 2, y: node.y + CARD_HEIGHT };
  }
};

const EDGE_GUTTER = 42;
const EDGE_VISIBLE_OFFSET = 18;
const REJECT_LANE_STEP = 26;

const getAdaptiveGutter = (start: { x: number; y: number }, end: { x: number; y: number }, axis: 'x' | 'y') => {
  const distance = Math.abs(axis === 'x' ? end.x - start.x : end.y - start.y);
  return Math.max(12, Math.min(EDGE_GUTTER, distance / 2 - 4));
};

const getRejectEntryPoint = (sourceNode: WorkflowNode, targetNode: WorkflowNode) => {
  const incomingRejectSources = (draft.value?.nodes || [])
    .filter((node) => node.rejectNodeId === targetNode.id)
    .sort((left, right) => left.x - right.x);

  const sourceIndex = Math.max(0, incomingRejectSources.findIndex((node) => node.id === sourceNode.id));
  const slotCount = Math.max(1, incomingRejectSources.length);
  const slotX = targetNode.x + (CARD_WIDTH * (sourceIndex + 1)) / (slotCount + 1);
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);

  if (sourceCenter.y <= targetCenter.y) {
    return { x: slotX, y: targetNode.y };
  }

  return { x: slotX, y: targetNode.y + CARD_HEIGHT };
};

const getConnectionEnds = (sourceNode: WorkflowNode, targetNode: WorkflowNode, branch: 'next' | 'reject') => {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (branch === 'reject') {
    const rejectEntry = getRejectEntryPoint(sourceNode, targetNode);
    if (Math.abs(deltaY) > CARD_HEIGHT * 0.35) {
      return {
        start: getNodePortCenter(sourceNode, deltaY >= 0 ? 'bottom' : 'top'),
        end: rejectEntry
      };
    }

    return {
      start: getNodePortCenter(sourceNode, deltaX >= 0 ? 'right' : 'left'),
      end: rejectEntry
    };
  }

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const sourcePort = getNodePortCenter(sourceNode, deltaX >= 0 ? 'right' : 'left');
    const targetPort = getNodePortCenter(targetNode, deltaX >= 0 ? 'left' : 'right');
    const sameRow = Math.abs(deltaY) < CARD_HEIGHT * 0.45;
    if (sameRow && branch === 'next') {
      return {
        start: sourcePort,
        end: targetPort
      };
    }

    const horizontalGap = Math.abs(targetPort.x - sourcePort.x);
    const visibleOffset = Math.max(0, Math.min(EDGE_VISIBLE_OFFSET, horizontalGap / 2 - 8));
    return {
      start: {
        ...sourcePort,
        x: sourcePort.x + (deltaX >= 0 ? visibleOffset : -visibleOffset)
      },
      end: {
        ...targetPort,
        x: targetPort.x + (deltaX >= 0 ? -visibleOffset : visibleOffset)
      }
    };
  }

  return {
    start: getNodePortCenter(sourceNode, deltaY >= 0 ? 'bottom' : 'top'),
    end: getNodePortCenter(targetNode, deltaY >= 0 ? 'top' : 'bottom')
  };
};

const getRoutePoints = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  branch: 'next' | 'reject',
  waypoint?: WorkflowEdgeWaypoint
) => {
  const mid = normalizeWaypoint(start, end, waypoint || buildAutoWaypoint(start, end, branch), branch);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const sameRow = Math.abs(deltaY) < CARD_HEIGHT * 0.7;
  const sameColumn = Math.abs(deltaX) < CARD_WIDTH * 0.4;

  if (branch === 'reject') {
    const verticalDirection = end.y >= start.y ? 1 : -1;
    const verticalGutter = getAdaptiveGutter(start, end, 'y');
    const startOut = {
      x: start.x,
      y: start.y + verticalDirection * verticalGutter
    };
    const endIn = {
      x: end.x,
      y: end.y - verticalDirection * verticalGutter
    };

    if (sameRow) {
      const horizontalDirection = end.x >= start.x ? 1 : -1;
      const horizontalGutter = getAdaptiveGutter(start, end, 'x');
      const startSide = { x: start.x + horizontalDirection * horizontalGutter, y: start.y };
      const endSide = { x: end.x - horizontalDirection * horizontalGutter, y: end.y };
      return [start, startSide, endSide, end];
    }

    if (!waypoint) {
      const laneIndex = Math.max(0, Math.round(Math.abs(start.x - end.x) / Math.max(1, CARD_WIDTH * 0.6)));
      if (verticalDirection > 0) {
        const corridorY = Math.max(
          startOut.y + 20,
          Math.min(endIn.y - 18, endIn.y - 56 - laneIndex * REJECT_LANE_STEP)
        );
        return [
          start,
          startOut,
          { x: startOut.x, y: corridorY },
          { x: endIn.x, y: corridorY },
          endIn,
          end
        ];
      }

      if (verticalDirection < 0) {
        const corridorY = Math.min(
          startOut.y - 20,
          Math.max(endIn.y + 18, endIn.y + 56 + laneIndex * REJECT_LANE_STEP)
        );
        return [
          start,
          startOut,
          { x: startOut.x, y: corridorY },
          { x: endIn.x, y: corridorY },
          endIn,
          end
        ];
      }
    }

    return [
      start,
      startOut,
      { x: mid.x, y: startOut.y },
      { x: mid.x, y: endIn.y },
      endIn,
      end
    ];
  }

  if (sameRow) {
    const horizontalDirection = end.x >= start.x ? 1 : -1;
    const horizontalGutter = getAdaptiveGutter(start, end, 'x');
    const startOut = {
      x: start.x + horizontalDirection * horizontalGutter,
      y: start.y
    };
    const endIn = {
      x: end.x - horizontalDirection * horizontalGutter,
      y: end.y
    };

    return [start, startOut, endIn, end];
  }

  if (sameColumn) {
    const verticalDirection = end.y >= start.y ? 1 : -1;
    const verticalGutter = getAdaptiveGutter(start, end, 'y');
    const startOut = {
      x: start.x,
      y: start.y + verticalDirection * verticalGutter
    };
    const endIn = {
      x: end.x,
      y: end.y - verticalDirection * verticalGutter
    };

    return [start, startOut, { x: startOut.x, y: mid.y }, { x: endIn.x, y: mid.y }, endIn, end];
  }

  const horizontalDirection = end.x >= start.x ? 1 : -1;
  const horizontalGutter = getAdaptiveGutter(start, end, 'x');
  const startOut = {
    x: start.x + horizontalDirection * horizontalGutter,
    y: start.y
  };
  const endIn = {
    x: end.x - horizontalDirection * horizontalGutter,
    y: end.y
  };

  return [
    start,
    startOut,
    { x: mid.x, y: startOut.y },
    { x: mid.x, y: endIn.y },
    endIn,
    end
  ];
};

const getPreviewRoutePoints = (
  sourceNode: WorkflowNode,
  currentX: number,
  currentY: number,
  branch: 'next' | 'reject'
) => {
  const start = getPortPosition(sourceNode, branch);
  const end = { x: currentX, y: currentY };
  return getRoutePoints(start, end, branch);
};

const simplifyRoutePoints = (points: Array<{ x: number; y: number }>) => {
  const deduped = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 0.5 || Math.abs(point.y - previous.y) > 0.5;
  });

  if (deduped.length <= 2) return deduped;

  const simplified = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];

    const horizontal = Math.abs(previous.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5;
    const vertical = Math.abs(previous.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5;

    if (!horizontal && !vertical) {
      simplified.push(current);
    }
  }

  simplified.push(deduped[deduped.length - 1]);
  return simplified;
};

const roundedOrthogonalPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length < 2) return '';

  const route = simplifyRoutePoints(points);
  let path = `M ${route[0].x} ${route[0].y}`;
  for (let index = 1; index < route.length; index += 1) {
    const prev = route[index - 1];
    const current = route[index];
    const next = route[index + 1];

    if (!next) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const radius = Math.min(20, Math.abs(current.x - prev.x) / 2 || 20, Math.abs(current.y - prev.y) / 2 || 20);
    const start = {
      x: current.x + Math.sign(prev.x - current.x) * radius,
      y: current.y + Math.sign(prev.y - current.y) * radius
    };
    const end = {
      x: current.x + Math.sign(next.x - current.x) * radius,
      y: current.y + Math.sign(next.y - current.y) * radius
    };

    path += ` L ${start.x} ${start.y} Q ${current.x} ${current.y} ${end.x} ${end.y}`;
  }

  return path;
};

const buildAutoWaypoint = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  branch: 'next' | 'reject'
): WorkflowEdgeWaypoint => {
  if (branch === 'reject') {
    return {
      x: start.x,
      y: start.y + Math.max(120, Math.abs(end.y - start.y) * 0.5)
    };
  }

  return {
    x: start.x + Math.max(120, Math.abs(end.x - start.x) * 0.45),
    y: start.y
  };
};

const normalizeWaypoint = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  waypoint: WorkflowEdgeWaypoint,
  branch: 'next' | 'reject'
) => {
  if (branch === 'reject') {
    return {
      x: Math.min(Math.max(waypoint.x, Math.min(start.x, end.x) - 180), Math.max(start.x, end.x) + 180),
      y: Math.max(waypoint.y, Math.max(start.y, end.y) + 30)
    };
  }

  return {
    x: Math.max(waypoint.x, start.x + 40),
    y: Math.min(Math.max(waypoint.y, Math.min(start.y, end.y) - 180), Math.max(start.y, end.y) + 180)
  };
};

const shouldUseStraightLine = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  branch: 'next' | 'reject',
  waypoint?: WorkflowEdgeWaypoint
) => branch === 'next' && !waypoint && Math.abs(start.y - end.y) < CARD_HEIGHT * 0.45;

const getStraightConnectorStyle = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
  left: `${Math.min(start.x, end.x)}px`,
  top: `${start.y - 2}px`,
  width: `${Math.abs(end.x - start.x)}px`
});

const linePath = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  branch: 'next' | 'reject',
  waypoint?: WorkflowEdgeWaypoint
) => {
  if (shouldUseStraightLine(start, end, branch, waypoint)) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  return roundedOrthogonalPath(getRoutePoints(start, end, branch, waypoint));
};

const getEdgeWaypoint = (node: WorkflowNode, branch: 'next' | 'reject') =>
  branch === 'next' ? node.nextWaypoint : node.rejectWaypoint;

const setEdgeWaypoint = (node: WorkflowNode, branch: 'next' | 'reject', waypoint?: WorkflowEdgeWaypoint) => {
  if (branch === 'next') node.nextWaypoint = waypoint;
  else node.rejectWaypoint = waypoint;
};

const getEdgeHandlePosition = (node: WorkflowNode, targetNode: WorkflowNode, branch: 'next' | 'reject') => {
  const { start, end } = getConnectionEnds(node, targetNode, branch);
  if (shouldUseStraightLine(start, end, branch, getEdgeWaypoint(node, branch))) {
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }
  return normalizeWaypoint(start, end, getEdgeWaypoint(node, branch) || buildAutoWaypoint(start, end, branch), branch);
};

const getPortPosition = (node: WorkflowNode, branch: 'next' | 'reject') => {
  switch (node.kind) {
    case 'gateway':
      return branch === 'next'
        ? { x: node.x + CARD_WIDTH + 8, y: node.y + CARD_HEIGHT / 2 }
        : { x: node.x + CARD_WIDTH / 2, y: node.y + CARD_HEIGHT + 8 };
    case 'end':
      return branch === 'next'
        ? { x: node.x + CARD_WIDTH, y: node.y + CARD_HEIGHT / 2 }
        : { x: node.x + CARD_WIDTH / 2, y: node.y + CARD_HEIGHT + 6 };
    default:
      return branch === 'next'
        ? { x: node.x + CARD_WIDTH + 10, y: node.y + CARD_HEIGHT / 2 }
        : { x: node.x + CARD_WIDTH / 2, y: node.y + CARD_HEIGHT + 10 };
  }
};

const setZoom = (value: number) => {
  zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
};

const zoomIn = () => setZoom(zoom.value + 0.1);
const zoomOut = () => setZoom(zoom.value - 0.1);
const resetZoom = () => setZoom(1);

const fitToView = () => {
  if (!canvasRef.value || !draft.value?.nodes.length) return;

  const minX = Math.min(...draft.value.nodes.map((node) => node.x));
  const minY = Math.min(...draft.value.nodes.map((node) => node.y));
  const maxX = Math.max(...draft.value.nodes.map((node) => node.x + CARD_WIDTH));
  const maxY = Math.max(...draft.value.nodes.map((node) => node.y + CARD_HEIGHT));

  const padding = 72;
  const boundsWidth = maxX - minX + padding * 2;
  const boundsHeight = maxY - minY + padding * 2;
  const targetZoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(canvasRef.value.clientWidth / boundsWidth, canvasRef.value.clientHeight / boundsHeight)
    )
  );

  setZoom(targetZoom);

  requestAnimationFrame(() => {
    if (!canvasRef.value) return;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    canvasRef.value.scrollLeft = Math.max(0, centerX * zoom.value - canvasRef.value.clientWidth / 2);
    canvasRef.value.scrollTop = Math.max(0, centerY * zoom.value - canvasRef.value.clientHeight / 2);
  });
};

const handleCanvasWheel = (event: WheelEvent) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setZoom(zoom.value + (event.deltaY < 0 ? 0.08 : -0.08));
};

const generateNodeId = () => `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const nextNodePosition = () => {
  if (!draft.value || draft.value.nodes.length === 0) return { x: 140, y: 340 };
  if (selectedNode.value) return { x: selectedNode.value.x + 380, y: selectedNode.value.y };

  const maxX = Math.max(...draft.value.nodes.map((node) => node.x));
  const minY = Math.min(...draft.value.nodes.map((node) => node.y));
  return { x: maxX + 380, y: minY };
};

const addNodeFromTemplate = (
  template: NodeTemplate,
  options: { autoConnect?: boolean; openInspector?: boolean } = {}
) => {
  if (!draft.value) return;
  const { autoConnect = true, openInspector = true } = options;

  const position = nextNodePosition();
  const node: WorkflowNode = {
    id: generateNodeId(),
    name: template.name,
    description: template.description,
    action: template.action,
    actor: template.actor,
    kind: template.kind,
    status: template.status,
    x: position.x,
    y: position.y
  };

  draft.value.nodes.push(node);
  if (autoConnect && selectedNode.value && !selectedNode.value.nextNodeId) selectedNode.value.nextNodeId = node.id;
  selectedNodeId.value = node.id;
  isInspectorOpen.value = openInspector;
  if (openInspector) isNodeLibraryOpen.value = false;
};

const addNodeTemplateById = (templateId: string, options?: { autoConnect?: boolean; openInspector?: boolean }) => {
  const template = nodeTemplates.find((item) => item.id === templateId);
  if (!template) return;
  addNodeFromTemplate(template, options);
};

const insertNodeAfter = (template: NodeTemplate, afterNodeId?: string) => {
  if (!draft.value) return;

  const anchor =
    (afterNodeId && draft.value.nodes.find((node) => node.id === afterNodeId)) ||
    selectedNode.value ||
    primaryPathNodes.value[primaryPathNodes.value.length - 1] ||
    null;

  if (!anchor) {
    addNodeFromTemplate(template);
    return;
  }

  const nextNodeId = anchor.nextNodeId;
  const position = { x: anchor.x + 380, y: anchor.y };
  const node: WorkflowNode = {
    id: generateNodeId(),
    name: template.name,
    description: template.description,
    action: template.action,
    actor: template.actor,
    kind: template.kind,
    status: template.status,
    x: position.x,
    y: position.y,
    nextNodeId
  };

  anchor.nextNodeId = node.id;
  anchor.nextWaypoint = undefined;
  draft.value.nodes.push(node);
  selectedNodeId.value = node.id;
  isInspectorOpen.value = true;
  requestAnimationFrame(() => organizeWorkflowLayout(false));
};

const duplicateSelectedNode = () => {
  if (!draft.value || !selectedNode.value) return;

  const source = selectedNode.value;
  const duplicated: WorkflowNode = {
    ...JSON.parse(JSON.stringify(source)),
    id: generateNodeId(),
    name: `${source.name} 副本`,
    x: source.x + 100,
    y: source.y + 220,
    nextNodeId: undefined,
    rejectNodeId: undefined
  };

  draft.value.nodes.push(duplicated);
  selectedNodeId.value = duplicated.id;
  isInspectorOpen.value = true;
};

const deleteSelectedNode = () => {
  if (!draft.value || !selectedNode.value) return;

  const deletingId = selectedNode.value.id;
  draft.value.nodes = draft.value.nodes
    .filter((node) => node.id !== deletingId)
    .map((node) => ({
      ...node,
      nextNodeId: node.nextNodeId === deletingId ? undefined : node.nextNodeId,
      rejectNodeId: node.rejectNodeId === deletingId ? undefined : node.rejectNodeId
    }));

  selectedNodeId.value = '';
  if (!draft.value.nodes.length) {
    connectState.value = null;
    dragState.value = null;
    edgeDragState.value = null;
  }
};

const selectPreviousNode = () => {
  if (!sortedNodes.value.length) return;
  if (selectedNodeIndex.value <= 0) {
    selectedNodeId.value = sortedNodes.value[0].id;
    return;
  }
  selectedNodeId.value = sortedNodes.value[selectedNodeIndex.value - 1].id;
};

const selectNextNode = () => {
  if (!sortedNodes.value.length) return;
  if (selectedNodeIndex.value === -1) {
    selectedNodeId.value = sortedNodes.value[0].id;
    return;
  }
  selectedNodeId.value = sortedNodes.value[Math.min(sortedNodes.value.length - 1, selectedNodeIndex.value + 1)].id;
};

const removePointerListeners = () => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
};

function onPointerMove(event: PointerEvent) {
  if (panState.value && canvasRef.value) {
    const deltaX = event.clientX - panState.value.startClientX;
    const deltaY = event.clientY - panState.value.startClientY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) panState.value.moved = true;

    canvasRef.value.scrollLeft = panState.value.startScrollLeft - deltaX;
    canvasRef.value.scrollTop = panState.value.startScrollTop - deltaY;
    return;
  }

  if (dragState.value && draft.value) {
    const node = draft.value.nodes.find((item) => item.id === dragState.value?.nodeId);
    if (!node) return;

    const point = getCanvasPoint(event.clientX, event.clientY);
    if (
      Math.abs(point.x - (node.x + dragState.value.offsetX)) > 2 ||
      Math.abs(point.y - (node.y + dragState.value.offsetY)) > 2
    ) {
      dragState.value.moved = true;
    }

    node.x = Math.max(24, point.x - dragState.value.offsetX);
    node.y = Math.max(24, point.y - dragState.value.offsetY);
    return;
  }

  if (edgeDragState.value && draft.value) {
    const sourceNode = draft.value.nodes.find((item) => item.id === edgeDragState.value?.nodeId);
    const targetNode = draft.value.nodes.find((item) => item.id === edgeDragState.value?.targetNodeId);
    if (!sourceNode || !targetNode) return;

    const point = getCanvasPoint(event.clientX, event.clientY);
    const start = getPortPosition(sourceNode, edgeDragState.value.branch);
    const end = { x: targetNode.x, y: targetNode.y + CARD_HEIGHT / 2 };
    setEdgeWaypoint(sourceNode, edgeDragState.value.branch, normalizeWaypoint(start, end, point, edgeDragState.value.branch));
    return;
  }

  if (connectState.value) {
    const point = getCanvasPoint(event.clientX, event.clientY);
    const deltaX = point.x - connectState.value.currentX;
    const deltaY = point.y - connectState.value.currentY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      connectState.value.moved = true;
    }
    connectState.value.currentX = point.x;
    connectState.value.currentY = point.y;
  }
}

function onPointerUp() {
  if (dragState.value?.moved || panState.value?.moved) {
    ignoreNextCanvasClick.value = true;
    window.setTimeout(() => {
      ignoreNextCanvasClick.value = false;
    }, 0);
  }

  dragState.value = null;
  panState.value = null;
  edgeDragState.value = null;
  if (connectState.value?.moved) {
    connectState.value = null;
  }
  removePointerListeners();
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (event.code === 'Space') {
    isPanMode.value = true;
    event.preventDefault();
  }
}

function onWindowKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') {
    isPanMode.value = false;
    event.preventDefault();
  }
}

const beginPan = (event: PointerEvent) => {
  if (!canvasRef.value) return;
  panState.value = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: canvasRef.value.scrollLeft,
    startScrollTop: canvasRef.value.scrollTop,
    moved: false
  };

  removePointerListeners();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

const handleCanvasPointerDown = (event: PointerEvent) => {
  if (event.button === 1 || isPanMode.value) {
    event.preventDefault();
    beginPan(event);
  }
};

const handleCanvasClick = () => {
  if (connectState.value) {
    connectState.value = null;
    return;
  }
  if (dragState.value || panState.value) return;
  if (ignoreNextCanvasClick.value) return;
  selectedNodeId.value = '';
};

const selectNode = (nodeId: string) => {
  selectedNodeId.value = nodeId;
  isInspectorOpen.value = true;
};

const beginDrag = (event: PointerEvent, nodeId: string) => {
  if (!draft.value) return;
  if (connectState.value) {
    finishConnect(nodeId);
    event.stopPropagation();
    event.preventDefault();
    return;
  }
  const node = draft.value.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  const point = getCanvasPoint(event.clientX, event.clientY);
  selectedNodeId.value = nodeId;
  panState.value = null;
  connectState.value = null;
  dragState.value = {
    nodeId,
    offsetX: point.x - node.x,
    offsetY: point.y - node.y,
    moved: false
  };

  removePointerListeners();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

const handleNodePointerUp = (nodeId: string) => {
  if (connectState.value) {
    finishConnect(nodeId);
    return;
  }

  const wasDraggingThisNode = dragState.value?.nodeId === nodeId;
  const wasMoved = Boolean(dragState.value?.moved);

  if (dragState.value?.nodeId === nodeId && !dragState.value.moved && !ignoreNextCanvasClick.value) {
    selectNode(nodeId);
  }

  if (wasDraggingThisNode) {
    if (wasMoved) {
      ignoreNextCanvasClick.value = true;
      window.setTimeout(() => {
        ignoreNextCanvasClick.value = false;
      }, 0);
    }
    dragState.value = null;
    removePointerListeners();
  }
};

const beginEdgeWaypointDrag = (event: PointerEvent, nodeId: string, targetNodeId: string, branch: 'next' | 'reject') => {
  if (!draft.value) return;
  selectedNodeId.value = nodeId;
  dragState.value = null;
  panState.value = null;
  connectState.value = null;
  edgeDragState.value = { nodeId, targetNodeId, branch };

  removePointerListeners();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  event.stopPropagation();
  event.preventDefault();
};

const beginConnect = (event: PointerEvent, sourceNodeId: string, branch: 'next' | 'reject') => {
  if (!draft.value) return;
  const sourceNode = draft.value.nodes.find((item) => item.id === sourceNodeId);
  if (!sourceNode) return;

  const port = getPortPosition(sourceNode, branch);
  selectedNodeId.value = sourceNodeId;
  dragState.value = null;
  panState.value = null;
  connectState.value = {
    sourceNodeId,
    branch,
    currentX: port.x,
    currentY: port.y,
    moved: false
  };

  removePointerListeners();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  event.stopPropagation();
  event.preventDefault();
};

const finishConnect = (targetNodeId: string) => {
  if (!draft.value || !connectState.value) return;
  if (targetNodeId === connectState.value.sourceNodeId) return;

  const source = draft.value.nodes.find((item) => item.id === connectState.value.sourceNodeId);
  if (!source) return;

  if (connectState.value.branch === 'next') {
    source.nextNodeId = targetNodeId;
    source.nextWaypoint = undefined;
  } else {
    source.rejectNodeId = targetNodeId;
    source.rejectWaypoint = undefined;
  }

  selectedNodeId.value = targetNodeId;
  isInspectorOpen.value = true;
  connectState.value = null;
  removePointerListeners();
};

const clearConnection = (branch: 'next' | 'reject') => {
  if (!selectedNode.value) return;
  if (branch === 'next') {
    selectedNode.value.nextNodeId = undefined;
    selectedNode.value.nextWaypoint = undefined;
  } else {
    selectedNode.value.rejectNodeId = undefined;
    selectedNode.value.rejectWaypoint = undefined;
  }
};

const restoreDefaultLayout = () => {
  if (!draft.value) return;

  draft.value.name = draft.value.name?.trim() || '跨部门任务流程';
  draft.value.description = '需求提交、双负责人审核、部门指派与成员反馈的标准 OA 业务流程。';
  draft.value.nodes = buildStandardTaskWorkflowNodes();

  selectedNodeId.value = '';
  connectState.value = null;
  dragState.value = null;
  edgeDragState.value = null;
  resetZoom();
  requestAnimationFrame(() => {
    fitToView();
  });
};

const saveWorkflow = () => {
  if (!draft.value) return;
  if (!workflowValidation.value.ok) {
    const shouldContinue = window.confirm(
      `这套流程还不能完整驱动任务看板：\n${workflowValidation.value.messages.join('\n')}\n\n仍然只保存为流程草稿吗？`
    );
    if (!shouldContinue) return;
  }
  emit('save', JSON.parse(JSON.stringify(draft.value)));
};

const handleMiniMapPointerDown = (event: PointerEvent) => {
  if (!canvasRef.value) return;

  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const pointX = (event.clientX - rect.left) / miniMapScale.value;
  const pointY = (event.clientY - rect.top) / miniMapScale.value;

  canvasRef.value.scrollLeft = Math.max(0, pointX * zoom.value - canvasRef.value.clientWidth / 2);
  canvasRef.value.scrollTop = Math.max(0, pointY * zoom.value - canvasRef.value.clientHeight / 2);
};

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown);
  window.addEventListener('keyup', onWindowKeyUp);
});

onBeforeUnmount(() => {
  removePointerListeners();
  window.removeEventListener('keydown', onWindowKeyDown);
  window.removeEventListener('keyup', onWindowKeyUp);
});
</script>

<template>
  <div v-if="draft" class="relative flex min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200 bg-[#f6f8fc]">
    <div class="absolute inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/92 px-5 backdrop-blur">
      <div class="min-w-0 flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-100">
          <GitBranch :size="18" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-base font-bold text-slate-900">{{ props.headerTitle || '流程设计' }}</h3>
            <span :class="['rounded-full px-2 py-0.5 text-[10px] font-bold', workflowValidation.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700']">
              {{ workflowValidation.ok ? '可运行' : '待补全' }}
            </span>
          </div>
          <p class="truncate text-xs text-slate-500">
            {{ props.headerSubtitle || draft.name }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 pl-2">
        <slot name="header-actions" />
        <div class="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            @click="editorMode = 'simple'"
            :class="['px-3 py-1.5 rounded-xl text-xs font-bold transition-colors', editorMode === 'simple' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white']"
          >
            <ListTree :size="14" class="mr-1 inline" />
            简洁模式
          </button>
          <button
            type="button"
            @click="editorMode = 'canvas'"
            :class="['px-3 py-1.5 rounded-xl text-xs font-bold transition-colors', editorMode === 'canvas' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white']"
          >
            <Workflow :size="14" class="mr-1 inline" />
            画布模式
          </button>
        </div>
        <button
          type="button"
          @click="isNodeLibraryOpen = !isNodeLibraryOpen"
          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <Plus :size="16" class="mr-1 inline" />
          {{ isNodeLibraryOpen ? '收起节点' : '添加节点' }}
        </button>
        <button
          type="button"
          @click="isInspectorOpen = !isInspectorOpen"
          class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <component :is="isInspectorOpen ? ChevronRight : ChevronLeft" :size="16" class="mr-1 inline" />
          {{ isInspectorOpen ? '收起属性' : '属性面板' }}
        </button>
        <button @click="saveWorkflow" :disabled="saving" class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-100 disabled:opacity-60">
          <Save :size="16" class="mr-1 inline" />
          {{ saving ? '保存中...' : '保存流程' }}
        </button>
      </div>
    </div>

    <div class="flex min-h-0 w-full pt-16">
      <aside v-if="isNodeLibraryOpen" class="flex w-[272px] shrink-0 flex-col border-r border-slate-200 bg-white/88">
        <div class="border-b border-slate-100 px-4 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-sm font-bold text-slate-900">流程结构</h4>
            </div>
            <button
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              @click="isNodeLibraryOpen = false"
            >
              <ChevronLeft :size="16" />
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 px-4 py-4 flex flex-col">
          <div class="relative">
            <Search :size="16" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              v-model="nodeSearchQuery"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="搜索节点"
            />
          </div>
          <div class="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
            <div v-for="section in nodeTemplateSections" :key="`side-${section.title}`" class="space-y-2">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{{ section.title }}</p>
              <div class="space-y-2">
                <button
                  v-for="template in section.items"
                  :key="`side-template-${template.id}`"
                  type="button"
                  class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50/30"
                  @click="addNodeFromTemplate(template)"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-bold text-slate-900">{{ template.name }}</span>
                    <Plus :size="14" class="shrink-0 text-blue-600" />
                  </div>
                  <p class="mt-1 text-xs leading-5 text-slate-500">{{ template.description }}</p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div class="relative flex min-w-0 flex-1 flex-col">
        <div class="border-b border-slate-200 bg-white/70 px-5 py-3 backdrop-blur">
          <div class="flex items-start gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-3">
                <CheckCircle2 :size="16" :class="workflowValidation.ok ? 'text-emerald-600' : 'text-amber-600'" />
                <p class="truncate text-sm font-bold text-slate-900">
                  {{ workflowValidation.ok ? '这套流程已具备任务看板可执行链路' : '这套流程还需要补充关键节点或状态' }}
                </p>
              </div>
              <p class="mt-1 truncate text-xs text-slate-500">
                {{
                  workflowValidation.ok
                    ? '保存后可直接应用到任务看板。'
                    : workflowValidation.messages[0]
                }}
              </p>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <template v-if="selectedNode">
                <p class="truncate text-sm font-bold text-slate-900">当前节点：{{ selectedNode.name }}</p>
                <p class="mt-1 truncate text-xs text-slate-500">
                  {{ getActionLabel(selectedNode.action) }} / {{ getActorLabel(selectedNode.actor) }} / {{ getStatusLabel(selectedNode.status) }}
                </p>
              </template>
              <template v-else>
                <p class="text-sm font-bold text-slate-900">当前未选中节点</p>
                <p class="mt-1 text-xs text-slate-500">
                  {{ editorMode === 'simple' ? '优先在中间主流程中点击步骤编辑。' : '点击画布上的节点后再调整连接和属性。' }}
                </p>
              </template>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" @click="selectPreviousNode">上一个</button>
              <button type="button" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" @click="selectNextNode">下一个</button>
              <button type="button" class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100" @click="addNodeTemplateById('approval')">后接审批</button>
              <button type="button" class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100" @click="addNodeTemplateById('manual')">后接任务</button>
              <button type="button" class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100" @click="addNodeTemplateById('complete')">后接完成</button>
              <button type="button" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100" @click="addNodeTemplateById('reject', { autoConnect: false })">新增驳回</button>
            </div>
          </div>
        </div>

        <div class="relative min-h-0 flex-1">
          <div
            v-if="editorMode === 'simple'"
            class="h-full overflow-y-auto px-6 py-6 custom-scrollbar"
          >
            <div v-if="!primaryPathNodes.length" class="mx-auto mt-12 max-w-xl rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
              <p class="text-base font-bold text-slate-900">还没有可编辑的主流程</p>
              <p class="mt-2 text-sm text-slate-500">可以先生成标准任务流程，或者从左侧常用节点开始搭建。</p>
              <div class="mt-5 flex items-center justify-center gap-3">
                <button type="button" class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" @click="isNodeLibraryOpen = true">
                  添加节点
                </button>
              </div>
            </div>

            <div v-else class="mx-auto max-w-5xl space-y-4">
              <template v-for="(node, index) in primaryPathNodes" :key="`simple-${node.id}`">
                <div class="flex gap-4">
                  <div class="flex w-16 shrink-0 flex-col items-center pt-5">
                    <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">{{ index + 1 }}</div>
                    <div v-if="index < primaryPathNodes.length - 1" class="mt-3 h-full min-h-12 w-px bg-slate-200"></div>
                  </div>
                  <div
                    tabindex="0"
                    :class="[
                      'flex-1 rounded-[28px] border bg-white px-6 py-5 shadow-sm transition-colors cursor-pointer',
                      selectedNodeId === node.id ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                    ]"
                    @click="selectNode(node.id)"
                    @keydown.enter.prevent="selectNode(node.id)"
                    @keydown.space.prevent="selectNode(node.id)"
                  >
                    <div class="flex flex-wrap items-start justify-between gap-4">
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span :class="['rounded-full px-2.5 py-1 text-[11px] font-bold', nodeTheme(node).badge]">{{ getKindLabel(node.kind) }}</span>
                          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{{ getActionLabel(node.action) }}</span>
                          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{{ getActorLabel(node.actor) }}</span>
                        </div>
                        <p class="mt-4 text-2xl font-bold text-slate-900">{{ node.name }}</p>
                        <p v-if="node.description" class="mt-2 text-sm leading-6 text-slate-500">{{ node.description }}</p>
                        <div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
                          <span class="rounded-full bg-blue-50 px-3 py-1.5 font-bold text-blue-700">停留状态：{{ getStatusLabel(node.status) }}</span>
                          <span v-if="node.nextNodeId" class="rounded-full bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700">下一步：{{ labelForNode(node.nextNodeId) }}</span>
                          <span v-if="node.rejectNodeId" class="rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-600">驳回至：{{ labelForNode(node.rejectNodeId) }}</span>
                        </div>
                      </div>
                      <div class="flex shrink-0 flex-wrap items-center gap-2">
                        <button type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" @click.stop="selectNode(node.id); isInspectorOpen = true">
                          编辑属性
                        </button>
                        <button type="button" class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100" @click.stop="insertNodeAfter(nodeTemplates.find((item) => item.id === 'approval')!, node.id)">
                          后接审批
                        </button>
                        <button type="button" class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100" @click.stop="insertNodeAfter(nodeTemplates.find((item) => item.id === 'manual')!, node.id)">
                          后接任务
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="index < primaryPathNodes.length - 1" class="ml-20 flex flex-wrap items-center gap-2">
                  <button
                    v-for="template in quickAddTemplates.filter((item) => !['task_submit', 'task_complete'].includes(item.id)).slice(0, 4)"
                    :key="`simple-insert-${node.id}-${template.id}`"
                    type="button"
                    class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    @click="insertNodeAfter(template, node.id)"
                  >
                    在此后插入 {{ template.name }}
                  </button>
                </div>
              </template>

              <div class="ml-20 flex flex-wrap items-center gap-2">
                <button
                  v-for="template in quickAddTemplates.filter((item) => item.id !== 'task_submit').slice(1, 5)"
                  :key="`simple-tail-${template.id}`"
                  type="button"
                  class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  @click="insertNodeAfter(template)"
                >
                  追加 {{ template.name }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-else
            class="relative h-full"
          >
            <div
              ref="canvasRef"
              class="h-full overflow-auto custom-scrollbar"
              :class="isPanMode ? 'cursor-grab' : ''"
              :style="{
                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.16) 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }"
              @click="handleCanvasClick"
              @wheel="handleCanvasWheel"
              @pointerdown="handleCanvasPointerDown"
            >
              <div class="relative" :style="canvasViewportStyle">
                <div class="relative" :style="canvasContentStyle">
                  <svg class="absolute inset-0 z-30 overflow-visible pointer-events-none" :width="canvasDimensions.width" :height="canvasDimensions.height">
                    <defs>
                      <filter id="workflow-glow">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <marker id="workflow-arrow-next" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                        <path d="M 1 1 L 11 7 L 1 13 z" fill="#2563eb" />
                      </marker>
                      <marker id="workflow-arrow-reject" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                        <path d="M 1 1 L 11 7 L 1 13 z" fill="#ef4444" />
                      </marker>
                    </defs>

                    <template v-for="node in draft.nodes" :key="node.id">
                      <path
                        v-if="node.nextNodeId && draft.nodes.find((item) => item.id === node.nextNodeId) && !shouldUseStraightLine(getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').start, getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').end, 'next', node.nextWaypoint)"
                        :d="linePath(getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').start, getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').end, 'next', node.nextWaypoint)"
                        fill="none"
                        stroke="#2563eb"
                        stroke-width="4.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-opacity="0.95"
                        filter="url(#workflow-glow)"
                        marker-end="url(#workflow-arrow-next)"
                      />
                      <path
                        v-if="node.rejectNodeId && draft.nodes.find((item) => item.id === node.rejectNodeId)"
                        :d="linePath(getConnectionEnds(node, draft.nodes.find((item) => item.id === node.rejectNodeId)!, 'reject').start, getConnectionEnds(node, draft.nodes.find((item) => item.id === node.rejectNodeId)!, 'reject').end, 'reject', node.rejectWaypoint)"
                        fill="none"
                        stroke="#ef4444"
                        stroke-width="3.25"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-dasharray="10 10"
                        stroke-opacity="0.95"
                        marker-end="url(#workflow-arrow-reject)"
                      />
                      <circle
                        v-if="selectedNodeId === node.id && node.nextNodeId && draft.nodes.find((item) => item.id === node.nextNodeId)"
                        :cx="getEdgeHandlePosition(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').x"
                        :cy="getEdgeHandlePosition(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').y"
                        r="9"
                        fill="#ffffff"
                        stroke="#2563eb"
                        stroke-width="2.5"
                        class="cursor-move pointer-events-auto"
                        @pointerdown.stop.prevent="beginEdgeWaypointDrag($event, node.id, node.nextNodeId, 'next')"
                      />
                      <circle
                        v-if="selectedNodeId === node.id && node.rejectNodeId && draft.nodes.find((item) => item.id === node.rejectNodeId)"
                        :cx="getEdgeHandlePosition(node, draft.nodes.find((item) => item.id === node.rejectNodeId)!, 'reject').x"
                        :cy="getEdgeHandlePosition(node, draft.nodes.find((item) => item.id === node.rejectNodeId)!, 'reject').y"
                        r="9"
                        fill="#ffffff"
                        stroke="#ef4444"
                        stroke-width="2.5"
                        class="cursor-move pointer-events-auto"
                        @pointerdown.stop.prevent="beginEdgeWaypointDrag($event, node.id, node.rejectNodeId, 'reject')"
                      />
                    </template>

                    <path
                      v-if="connectState"
                      :d="linePath(getPortPosition(draft.nodes.find((item) => item.id === connectState.sourceNodeId)!, connectState.branch), { x: connectState.currentX, y: connectState.currentY }, connectState.branch)"
                      fill="none"
                      :stroke="connectState.branch === 'next' ? '#2563eb' : '#ef4444'"
                      :stroke-width="connectState.branch === 'next' ? 4.5 : 3.25"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-opacity="0.95"
                      :stroke-dasharray="connectState.branch === 'reject' ? '10 10' : undefined"
                      filter="url(#workflow-glow)"
                      :marker-end="connectState.branch === 'next' ? 'url(#workflow-arrow-next)' : 'url(#workflow-arrow-reject)'"
                    />
                  </svg>

                  <template v-for="node in draft.nodes" :key="`straight-${node.id}`">
                    <div
                      v-if="node.nextNodeId && draft.nodes.find((item) => item.id === node.nextNodeId) && shouldUseStraightLine(getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').start, getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').end, 'next', node.nextWaypoint)"
                      class="pointer-events-none absolute z-40 h-1 rounded-full bg-blue-600 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
                      :style="getStraightConnectorStyle(getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').start, getConnectionEnds(node, draft.nodes.find((item) => item.id === node.nextNodeId)!, 'next').end)"
                    >
                      <div class="absolute right-0 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[10px] border-y-transparent border-l-blue-600"></div>
                    </div>
                  </template>

                  <div
                    v-if="!draft.nodes.length"
                    class="absolute left-1/2 top-1/2 z-20 w-[420px] max-w-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-dashed border-slate-300 bg-white/92 p-8 text-center shadow-sm"
                  >
                    <p class="text-lg font-bold text-slate-900">画布还是空的</p>
                    <p class="mt-2 text-sm leading-6 text-slate-500">可以从左侧添加节点，也可以直接生成标准任务流程后再调整。</p>
                    <div class="mt-5 flex items-center justify-center gap-3">
                      <button type="button" class="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100" @click.stop="isNodeLibraryOpen = true">
                        添加节点
                      </button>
                    </div>
                  </div>

                  <div
                    v-for="node in draft.nodes"
                    :key="node.id"
                    :class="[
                      'absolute w-[300px] rounded-[22px] border bg-white p-4 text-left shadow-sm select-none transition-colors transition-shadow',
                      selectedNodeId === node.id ? 'border-blue-500 shadow-xl shadow-blue-100' : `${nodeTheme(node).border} hover:border-blue-300`,
                      dragState?.nodeId === node.id ? 'z-20 shadow-2xl shadow-blue-100' : 'z-10'
                    ]"
                    :style="{ left: `${node.x}px`, top: `${node.y}px` }"
                    @pointerdown.stop.prevent="beginDrag($event, node.id)"
                    @pointerup="handleNodePointerUp(node.id)"
                    @click.stop="selectNode(node.id)"
                  >
                    <span v-if="selectedNodeId === node.id" class="absolute right-6 top-[74px] rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">主线</span>
                    <button
                      v-if="selectedNodeId === node.id || connectState?.sourceNodeId === node.id"
                      type="button"
                      :class="[
                        'absolute -right-3 top-[70px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-[10px] font-bold text-blue-600 shadow-sm hover:bg-blue-50',
                        connectState?.sourceNodeId === node.id && connectState?.branch === 'next' ? 'ring-4 ring-blue-100' : ''
                      ]"
                      title="点击后再点目标节点，创建主流程连线"
                      @pointerdown.stop.prevent="beginConnect($event, node.id, 'next')"
                    >主</button>
                    <span v-if="selectedNodeId === node.id" class="absolute left-1/2 bottom-6 -translate-x-1/2 rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500">驳回</span>
                    <button
                      v-if="selectedNodeId === node.id || connectState?.sourceNodeId === node.id"
                      type="button"
                      :class="[
                        'absolute left-1/2 -bottom-4 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-red-500 bg-white text-[10px] font-bold text-red-500 shadow-sm hover:bg-red-50',
                        connectState?.sourceNodeId === node.id && connectState?.branch === 'reject' ? 'ring-4 ring-red-100' : ''
                      ]"
                      title="点击后再点目标节点，创建驳回/旁路线"
                      @pointerdown.stop.prevent="beginConnect($event, node.id, 'reject')"
                    >驳</button>

                    <div class="relative z-10 mb-3 flex items-center justify-between gap-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <span :class="['rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest', nodeTheme(node).badge]">
                          {{ getKindLabel(node.kind) }}
                        </span>
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          {{ getActionLabel(node.action) }}
                        </span>
                      </div>
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Workflow :size="14" />
                      </div>
                    </div>

                    <div class="relative z-10">
                      <p class="text-[18px] font-bold leading-tight text-slate-900">{{ node.name }}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span class="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-500">{{ getActorLabel(node.actor) }}</span>
                        <span class="rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-600">{{ getStatusLabel(node.status) }}</span>
                      </div>
                      <p v-if="node.description" class="mt-2 text-[11px] leading-4 text-slate-500">{{ node.description }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="absolute bottom-5 right-5 z-30 rounded-2xl border border-slate-200 bg-white/96 p-3 shadow-lg shadow-slate-200/60 backdrop-blur">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Map</span>
                <span class="text-[11px] font-bold text-slate-500">{{ Math.round(zoom * 100) }}%</span>
              </div>
              <div
                class="relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                :style="{ width: `${MINIMAP_WIDTH}px`, height: `${MINIMAP_HEIGHT}px` }"
                @pointerdown.stop.prevent="handleMiniMapPointerDown"
              >
                <div
                  v-for="node in draft.nodes"
                  :key="`mini-${node.id}`"
                  class="absolute rounded-md border border-slate-300 bg-white/90"
                  :style="{
                    left: `${node.x * miniMapScale}px`,
                    top: `${node.y * miniMapScale}px`,
                    width: `${CARD_WIDTH * miniMapScale}px`,
                    height: `${CARD_HEIGHT * miniMapScale}px`
                  }"
                ></div>
                <div
                  class="absolute rounded-lg border-2 border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                  :style="{
                    width: `${miniMapViewport.width}px`,
                    height: `${miniMapViewport.height}px`,
                    left: `${miniMapViewport.left}px`,
                    top: `${miniMapViewport.top}px`
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside
        v-if="isInspectorOpen"
        class="flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white/92"
      >
        <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 class="text-base font-bold text-slate-900">节点配置</h3>
            <p class="mt-1 text-xs text-slate-500">
              {{ editorMode === 'simple' ? '先在主流程选中步骤，再在这里做精确配置。' : '画布用于布局与连线，右侧面板负责属性编辑。' }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            @click="isInspectorOpen = false"
          >
            <ChevronRight :size="16" />
          </button>
        </div>

        <div class="space-y-4 overflow-y-auto p-5 custom-scrollbar">
        <section class="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            @click="toggleInspectorSection('workflowMeta')"
          >
            <span class="text-sm font-bold text-slate-900">流程信息</span>
            <ChevronRight :size="16" :class="['text-slate-400 transition-transform', inspectorSections.workflowMeta ? 'rotate-90' : '']" />
          </button>
          <div v-if="inspectorSections.workflowMeta" class="space-y-4 border-t border-slate-100 px-4 py-4">
            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-400 uppercase">流程名称</label>
              <input v-model="draft.name" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-400 uppercase">流程说明</label>
              <textarea v-model="draft.description" class="w-full min-h-[96px] px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500"></textarea>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            @click="toggleInspectorSection('nodeList')"
          >
            <span class="text-sm font-bold text-slate-900">节点列表</span>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-400">{{ draft.nodes.length }} 个</span>
              <ChevronRight :size="16" :class="['text-slate-400 transition-transform', inspectorSections.nodeList ? 'rotate-90' : '']" />
            </div>
          </button>
          <div v-if="inspectorSections.nodeList" class="border-t border-slate-100 px-4 py-4">
            <div class="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 custom-scrollbar">
              <button
                v-for="node in sortedNodes"
                :key="`outline-${node.id}`"
                type="button"
                :class="[
                  'mb-2 w-full rounded-xl px-3 py-2 text-left last:mb-0',
                  selectedNodeId === node.id ? 'bg-white shadow-sm ring-1 ring-blue-200' : 'hover:bg-white'
                ]"
                @click="selectNode(node.id)"
              >
                <p class="text-sm font-bold text-slate-900 truncate">{{ node.name }}</p>
                <p class="mt-1 text-xs text-slate-500 truncate">{{ getActionLabel(node.action) }} / {{ getStatusLabel(node.status) }}</p>
              </button>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            @click="toggleInspectorSection('selectedNode')"
          >
            <span class="text-sm font-bold text-slate-900">{{ selectedNode ? '当前节点' : '节点详情' }}</span>
            <ChevronRight :size="16" :class="['text-slate-400 transition-transform', inspectorSections.selectedNode ? 'rotate-90' : '']" />
          </button>
          <div v-if="inspectorSections.selectedNode" class="border-t border-slate-100 px-4 py-4">
        <div v-if="selectedNode" class="space-y-5">
          <div class="rounded-2xl bg-slate-50 p-4 flex items-center gap-3">
            <CheckCircle2 :size="18" class="text-blue-600" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-slate-900 truncate">{{ selectedNode.name }}</p>
              <p class="text-xs text-slate-500 truncate">节点 ID：{{ selectedNode.id }}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button @click="duplicateSelectedNode" type="button" class="px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Copy :size="15" class="inline mr-1" />
              复制节点
            </button>
            <button
              @click="deleteSelectedNode"
              type="button"
              :disabled="!canDeleteSelected"
              class="px-4 py-3 rounded-xl border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white"
            >
              <Trash2 :size="15" class="inline mr-1" />
              删除节点
            </button>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">节点名称</label>
            <input v-model="selectedNode.name" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">节点说明</label>
            <textarea v-model="selectedNode.description" class="w-full min-h-[84px] px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500"></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">节点类型</label>
            <select v-model="selectedNode.kind" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500">
              <option v-for="option in kindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">节点动作</label>
            <select v-model="selectedNode.action" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500">
              <option v-for="option in actionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">执行角色</label>
            <select v-model="selectedNode.actor" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500">
              <option v-for="option in actorOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-400 uppercase">绑定状态</label>
            <select v-model="selectedNode.status" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500">
              <option v-for="option in statusOptions" :key="option.value" :value="option.value || undefined">{{ option.label }}</option>
            </select>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-slate-400 uppercase">主流程下一步</label>
              <button type="button" class="text-xs font-bold text-slate-400 hover:text-slate-600" @click="clearConnection('next')">清空</button>
            </div>
            <select v-model="selectedNode.nextNodeId" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500">
              <option :value="undefined">无</option>
              <option v-for="node in sortedNodes.filter((item) => item.id !== selectedNode.id)" :key="node.id" :value="node.id">{{ node.name }}</option>
            </select>
            <p class="text-xs text-slate-400">当前连接：{{ labelForNode(selectedNode.nextNodeId) }}</p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-slate-400 uppercase">驳回 / 旁路线</label>
              <button type="button" class="text-xs font-bold text-slate-400 hover:text-slate-600" @click="clearConnection('reject')">清空</button>
            </div>
            <select v-model="selectedNode.rejectNodeId" class="w-full px-4 py-3 rounded-xl bg-slate-50 border-none outline-none focus:ring-1 focus:ring-blue-500">
              <option :value="undefined">无</option>
              <option v-for="node in sortedNodes.filter((item) => item.id !== selectedNode.id)" :key="node.id" :value="node.id">{{ node.name }}</option>
            </select>
            <p class="text-xs text-slate-400">当前连接：{{ labelForNode(selectedNode.rejectNodeId) }}</p>
          </div>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">
          当前没有选中节点。{{ editorMode === 'simple' ? '从主流程步骤里点选一个节点后，这里会出现详细配置。' : '点击画布中的节点后，这里会出现详细配置。' }}
        </div>
          </div>
        </section>
        </div>
      </aside>
    </div>
  </div>
</template>

