const baseUrl = process.env.SMOKE_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || "admin@novaoffice.com";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || "123456";

const headers = { "Content-Type": "application/json" };

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
};

const workflowDraft = (key) => ({
  key,
  name: "Smoke Test Flow",
  description: "Temporary workflow for deployment smoke testing.",
  updatedBy: "王主管",
  updatedById: "u2",
  nodes: [
    {
      id: "smoke_submit",
      name: "需求提交",
      action: "submit",
      actor: "initiator",
      kind: "start",
      x: 96,
      y: 180,
      nextNodeId: "smoke_complete",
    },
    {
      id: "smoke_complete",
      name: "流程完成",
      action: "complete",
      actor: "system",
      kind: "end",
      status: "completed",
      x: 468,
      y: 180,
    },
  ],
});

const main = async () => {
  console.log(`Smoke test target: ${baseUrl}`);

  const health = await request("/api/health");
  assert(health.ok, `health check failed: ${health.status}`);
  assert(health.data?.status === "up", "health payload missing status=up");
  console.log("ok  health");

  const login = await request("/api/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  assert(login.ok, `login failed: ${login.status}`);
  assert(login.data?.id, "login payload missing user id");
  console.log(`ok  login as ${login.data.name}`);

  const user = await request(`/api/user?id=${encodeURIComponent(login.data.id)}`);
  assert(user.ok, `get user failed: ${user.status}`);
  console.log("ok  user profile");

  const tasks = await request("/api/tasks");
  assert(tasks.ok && Array.isArray(tasks.data), "list tasks failed");
  console.log(`ok  tasks (${tasks.data.length})`);

  const org = await request("/api/org");
  assert(org.ok && Array.isArray(org.data), "list org failed");
  console.log(`ok  org (${org.data.length})`);

  const analytics = await request("/api/analytics");
  assert(analytics.ok, `analytics failed: ${analytics.status}`);
  console.log("ok  analytics");

  const workflows = await request("/api/workflows");
  assert(workflows.ok && Array.isArray(workflows.data), "list workflows failed");
  const defaultWorkflow = workflows.data.find((item) => item.key === "task_fulfillment");
  assert(defaultWorkflow, "default workflow task_fulfillment missing");
  console.log("ok  workflows");

  const defaultSave = await request("/api/workflows/task_fulfillment", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...defaultWorkflow,
      updatedBy: "王主管",
      updatedById: "u2",
    }),
  });
  assert(defaultSave.status === 400, "default workflow should be protected from direct edits");
  console.log("ok  built-in workflow protection");

  const tempKey = `smoke_${Date.now()}`;
  const createTemp = await request(`/api/workflows/${tempKey}`, {
    method: "POST",
    headers,
    body: JSON.stringify(workflowDraft(tempKey)),
  });
  assert(createTemp.ok, `create temp workflow failed: ${createTemp.status}`);
  assert(createTemp.data?.ownerId === "u2" || createTemp.data?.ownerName, "temp workflow missing owner metadata");
  console.log("ok  create custom workflow");

  const deleteTemp = await request(`/api/workflows/${tempKey}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ userId: "u2", userName: "王主管" }),
  });
  assert(deleteTemp.ok, `delete temp workflow failed: ${deleteTemp.status}`);
  console.log("ok  delete custom workflow");

  console.log("Smoke test passed.");
};

main().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exit(1);
});
