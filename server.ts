import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import {
  assignTask,
  activateTaskWorkflow,
  createTask,
  deleteDepartment,
  deleteUser,
  deleteWorkflow,
  exportAnalyticsAsExcel,
  executeTaskAction,
  deleteTask,
  getAnalytics,
  getDatabasePath,
  getSettings,
  getUserById,
  getWorkflow,
  initDatabase,
  listApprovals,
  listDepartments,
  listTasks,
  listUsers,
  listWorkflows,
  login,
  reviewTaskSource,
  reviewTaskTarget,
  saveTask,
  saveDepartment,
  saveUser,
  saveWorkflow,
  submitTaskFeedback,
  updateApprovalStatus,
  updateProfile,
  updateTaskStatus,
  type ApprovalStatus,
  type MainTask,
  type WorkflowDefinition,
} from "./database.ts";

dns.setDefaultResultOrder("verbatim");

async function startServer() {
  initDatabase();

  const app = express();
  const port = Number(process.env.PORT || "3000");
  const host = process.env.HOST || "0.0.0.0";

  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "up",
      timestamp: new Date().toISOString(),
      version: "2.2.0",
      database: getDatabasePath(),
    });
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body || {};
    const user = login(email, password);
    if (!user) {
      return res.status(401).json({ message: "账号或密码错误" });
    }
    res.json(user);
  });

  app.get("/api/user", (req, res) => {
    const userId = String(req.query.id || "u1");
    res.json(getUserById(userId) || getUserById("u1"));
  });

  app.get("/api/users/all", (_req, res) => {
    res.json(listUsers());
  });

  app.post("/api/users", (req, res) => {
    try {
      res.json(saveUser(req.body || {}));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "保存员工失败" });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    try {
      deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(404).json({ message: error instanceof Error ? error.message : "删除员工失败" });
    }
  });

  app.get("/api/tasks", (_req, res) => {
    res.json(listTasks());
  });

  app.post("/api/tasks", (req, res) => {
    try {
      res.json(createTask(req.body || {}));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "创建任务失败" });
    }
  });

  app.patch("/api/tasks/:id", (req, res) => {
    try {
      const { status, user, ...rest } = req.body as { status?: MainTask["status"]; user?: string };
      if (status) {
        return res.json(updateTaskStatus(req.params.id, status, user || "系统"));
      }
      res.json(
        saveTask({
          ...(rest || {}),
          id: req.params.id,
        })
      );
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "任务保存失败" });
    }
  });

  app.delete("/api/tasks/:id", (req, res) => {
    try {
      res.json(
        deleteTask(req.params.id, {
          userId: req.body?.userId,
          userName: req.body?.userName || "系统",
          userRole: req.body?.userRole,
          userDepartment: req.body?.userDepartment,
        })
      );
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "任务删除失败" });
    }
  });

  app.post("/api/tasks/:id/source-review", (req, res) => {
    const { approved, reviewerName, reviewerRole, reviewerDepartment } = req.body as {
      approved?: boolean;
      reviewerName?: string;
      reviewerRole?: "admin" | "manager" | "member";
      reviewerDepartment?: string;
    };

    if (!reviewerName) {
      return res.status(400).json({ message: "缺少审核人" });
    }

    try {
      res.json(reviewTaskSource(req.params.id, reviewerName, reviewerRole, reviewerDepartment, approved !== false));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "发起部门审核失败" });
    }
  });

  app.post("/api/tasks/:id/target-review", (req, res) => {
    const { approved, reviewerName, reviewerRole, reviewerDepartment } = req.body as {
      approved?: boolean;
      reviewerName?: string;
      reviewerRole?: "admin" | "manager" | "member";
      reviewerDepartment?: string;
    };

    if (!reviewerName) {
      return res.status(400).json({ message: "缺少审核人" });
    }

    try {
      res.json(reviewTaskTarget(req.params.id, reviewerName, reviewerRole, reviewerDepartment, approved !== false));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "承接部门审核失败" });
    }
  });

  app.post("/api/tasks/:id/assign", (req, res) => {
    const { assigneeId, assigneeName, managerName, managerRole, managerDepartment } = req.body as {
      assigneeId?: string;
      assigneeName?: string;
      managerName?: string;
      managerRole?: "admin" | "manager" | "member";
      managerDepartment?: string;
    };

    if (!assigneeId || !assigneeName) {
      return res.status(400).json({ message: "必须指定执行成员" });
    }

    try {
      res.json(assignTask(req.params.id, assigneeId, assigneeName, managerName || "部门负责人", managerRole, managerDepartment));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "任务指派失败" });
    }
  });

  app.post("/api/tasks/:id/feedback", (req, res) => {
    const { assignmentId, feedbackText, attachments } = req.body as {
      assignmentId?: string;
      feedbackText?: string;
      attachments?: string[];
    };

    if (!assignmentId) {
      return res.status(400).json({ message: "缺少任务指派记录" });
    }

    try {
      res.json(submitTaskFeedback(req.params.id, assignmentId, feedbackText || "", attachments || []));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "反馈提交失败" });
    }
  });

  app.get("/api/org", (_req, res) => {
    res.json(listDepartments());
  });

  app.post("/api/org", (req, res) => {
    try {
      res.json(saveDepartment(req.body || {}));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "保存部门失败" });
    }
  });

  app.delete("/api/org/:id", (req, res) => {
    try {
      deleteDepartment(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(404).json({ message: error instanceof Error ? error.message : "删除部门失败" });
    }
  });

  app.get("/api/workflows", (_req, res) => {
    res.json(listWorkflows());
  });

  app.get("/api/workflows/:key", (req, res) => {
    const workflow = getWorkflow(req.params.key);
    if (!workflow) {
      return res.status(404).json({ message: "流程定义不存在" });
    }
    res.json(workflow);
  });

  app.post("/api/workflows/:key", (req, res) => {
    try {
      res.json(
        saveWorkflow({
          ...(req.body || {}),
          key: req.params.key,
        } as Partial<WorkflowDefinition> & { updatedBy?: string; updatedById?: string })
      );
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "流程保存失败" });
    }
  });

  app.post("/api/workflows/:key/activate", (req, res) => {
    try {
      res.json(activateTaskWorkflow(req.params.key, req.body?.updatedBy || "系统管理员"));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "启用流程失败" });
    }
  });

  app.delete("/api/workflows/:key", (req, res) => {
    try {
      deleteWorkflow(req.params.key, {
        userId: req.body?.userId,
        userName: req.body?.userName,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "流程删除失败" });
    }
  });

  app.get("/api/approvals", (_req, res) => {
    res.json(listApprovals());
  });

  app.patch("/api/approvals/:id", (req, res) => {
    const { status } = req.body as { status?: ApprovalStatus };
    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "审批状态非法" });
    }

    try {
      res.json(updateApprovalStatus(req.params.id, status));
    } catch (error) {
      res.status(404).json({ message: error instanceof Error ? error.message : "瀹℃壒鍗曚笉瀛樺湪" });
    }
  });

  app.get("/api/settings", (_req, res) => {
    res.json(getSettings());
  });

  app.post("/api/settings/profile", (req, res) => {
    const { id, name, email, avatar } = req.body as { id?: string; name?: string; email?: string; avatar?: string };
    if (!id) {
      return res.status(400).json({ message: "缺少用户标识" });
    }

    try {
      res.json(updateProfile(id, name, email, avatar));
    } catch (error) {
      res.status(404).json({ message: error instanceof Error ? error.message : "用户不存在" });
    }
  });

  app.post("/api/tasks/:id/actions", (req, res) => {
    try {
      res.json(executeTaskAction(req.params.id, req.body || {}));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "流程动作执行失败" });
    }
  });

  app.get("/api/analytics", (_req, res) => {
    res.json(getAnalytics());
  });

  app.get("/api/analytics/export", (_req, res) => {
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''novaoffice-analytics-${new Date().toISOString().slice(0, 10)}.xls`
    );
    res.send(exportAnalyticsAsExcel());
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "custom",
    });

    app.use(vite.middlewares);
    app.use("/{*path}", async (req, res, next) => {
      try {
        const indexPath = path.resolve("index.html");
        const template = await fs.promises.readFile(indexPath, "utf-8");
        const transformed = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, host, () => {
    console.log(`NovaOffice OA running at http://${host}:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
