package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

func (a *App) listTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := a.allTasks()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (a *App) allTasks() ([]MainTask, error) {
	rows, err := a.db.Query(`SELECT id FROM tasks ORDER BY updated_at DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []MainTask{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		task, err := a.taskByID(id)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (a *App) taskByID(id string) (MainTask, error) {
	var task MainTask
	var sourceReviewer, targetReviewer sql.NullString
	err := a.db.QueryRow(`
		SELECT id, title, description, source_department, target_department, status, priority, due_date, source_reviewer, target_reviewer
		FROM tasks WHERE id = ?
	`, id).Scan(&task.ID, &task.Title, &task.Description, &task.SourceDepartment, &task.TargetDepartment, &task.Status, &task.Priority, &task.DueDate, &sourceReviewer, &targetReviewer)
	if err == sql.ErrNoRows {
		return task, errNotFound
	}
	if err != nil {
		return task, err
	}
	if sourceReviewer.Valid {
		task.SourceReviewer = sourceReviewer.String
	}
	if targetReviewer.Valid {
		task.TargetReviewer = targetReviewer.String
	}

	assignRows, err := a.db.Query(`
		SELECT id, assignee_id, assignee_name, status, feedback_text, attachments_json, completed_at
		FROM task_assignments WHERE task_id = ? ORDER BY created_at, id
	`, id)
	if err != nil {
		return task, err
	}
	defer assignRows.Close()
	task.Assignments = []TaskAssignment{}
	for assignRows.Next() {
		var item TaskAssignment
		var feedback, attachments, completed sql.NullString
		if err := assignRows.Scan(&item.ID, &item.AssigneeID, &item.AssigneeName, &item.Status, &feedback, &attachments, &completed); err != nil {
			return task, err
		}
		if feedback.Valid {
			item.FeedbackText = feedback.String
		}
		if attachments.Valid {
			item.Attachments = parseStringSlice(attachments.String)
		}
		if completed.Valid {
			item.CompletedAt = completed.String
		}
		task.Assignments = append(task.Assignments, item)
	}
	if err := assignRows.Err(); err != nil {
		return task, err
	}

	logRows, err := a.db.Query(`SELECT action, time, user_name FROM task_logs WHERE task_id = ? ORDER BY id`, id)
	if err != nil {
		return task, err
	}
	defer logRows.Close()
	task.Logs = []TaskLog{}
	for logRows.Next() {
		var logItem TaskLog
		if err := logRows.Scan(&logItem.Action, &logItem.Time, &logItem.User); err != nil {
			return task, err
		}
		task.Logs = append(task.Logs, logItem)
	}
	return task, logRows.Err()
}

func (a *App) createTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title            string `json:"title"`
		Description      string `json:"description"`
		SourceDepartment string `json:"sourceDepartment"`
		TargetDepartment string `json:"targetDepartment"`
		Priority         string `json:"priority"`
		DueDate          string `json:"dueDate"`
		UserName         string `json:"userName"`
		UserID           string `json:"userId"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "任务数据格式不正确")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	if req.Title == "" || req.Description == "" {
		writeError(w, http.StatusBadRequest, "任务标题和描述不能为空")
		return
	}
	if req.TargetDepartment == "" || !a.departmentExists(req.TargetDepartment) {
		writeError(w, http.StatusBadRequest, "承接部门不存在")
		return
	}

	source := firstNonEmpty(req.SourceDepartment, "董事会")
	if !a.departmentExists(source) {
		source = "董事会"
	}
	status := firstNonEmpty(a.transitionByAction("submit", "approve"), "pending_source_review")
	id := randomID("MT")
	now := nowText()
	_, err := a.db.Exec(`
		INSERT INTO tasks (id, title, description, source_department, target_department, status, priority, due_date, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, req.Title, req.Description, source, req.TargetDepartment, status, firstNonEmpty(req.Priority, "medium"), firstNonEmpty(req.DueDate, todayText()), now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.addTaskLog(id, "提交需求，进入「"+statusLabel(status)+"」", firstNonEmpty(req.UserName, "系统"))
	task, _ := a.taskByID(id)
	writeJSON(w, http.StatusOK, task)
}

func (a *App) taskAction(w http.ResponseWriter, r *http.Request, rest string) {
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "任务不存在")
		return
	}
	id := parts[0]
	if len(parts) == 1 && r.Method == http.MethodPatch {
		a.patchTask(w, r, id)
		return
	}
	if len(parts) != 2 || r.Method != http.MethodPost {
		writeError(w, http.StatusNotFound, "任务操作不存在")
		return
	}
	switch parts[1] {
	case "source-review":
		a.reviewTask(w, r, id, "source_review")
	case "target-review":
		a.reviewTask(w, r, id, "target_review")
	case "assign":
		a.assignTask(w, r, id)
	case "feedback":
		a.feedbackTask(w, r, id)
	default:
		writeError(w, http.StatusNotFound, "任务操作不存在")
	}
}

func (a *App) patchTask(w http.ResponseWriter, r *http.Request, id string) {
	var req struct {
		Status   string `json:"status"`
		UserName string `json:"userName"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "任务数据格式不正确")
		return
	}
	if strings.TrimSpace(req.Status) == "" {
		writeError(w, http.StatusBadRequest, "任务状态不能为空")
		return
	}
	result, err := a.db.Exec(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`, req.Status, nowText(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeError(w, http.StatusNotFound, "任务不存在")
		return
	}
	a.addTaskLog(id, "状态更新为「"+statusLabel(req.Status)+"」", firstNonEmpty(req.UserName, "系统"))
	task, _ := a.taskByID(id)
	writeJSON(w, http.StatusOK, task)
}

func (a *App) reviewTask(w http.ResponseWriter, r *http.Request, id string, action string) {
	var req struct {
		Approved bool   `json:"approved"`
		UserName string `json:"userName"`
		UserRole string `json:"userRole"`
		UserDept string `json:"userDepartment"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "审核数据格式不正确")
		return
	}
	task, err := a.taskByID(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "任务不存在")
		return
	}
	needDept := task.SourceDepartment
	if action == "target_review" {
		needDept = task.TargetDepartment
	}
	if !a.canManageDept(req.UserRole, req.UserDept, needDept) {
		writeError(w, http.StatusForbidden, "当前账号没有该部门审核权限")
		return
	}

	branch := "approve"
	if !req.Approved {
		branch = "reject"
	}
	next := firstNonEmpty(
		a.transitionByAction(action, branch),
		a.transitionByStatus(task.Status, branch),
		fallbackTransition(task.Status, branch),
	)
	if next == "" {
		next = "rejected"
	}
	column := "source_reviewer"
	if action == "target_review" {
		column = "target_reviewer"
	}
	_, err = a.db.Exec(`UPDATE tasks SET status = ?, updated_at = ?, `+column+` = ? WHERE id = ?`, next, nowText(), firstNonEmpty(req.UserName, "负责人"), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	label := "审核通过"
	if !req.Approved {
		label = "审核驳回"
	}
	a.addTaskLog(id, label+"，进入「"+statusLabel(next)+"」", firstNonEmpty(req.UserName, "负责人"))
	updated, _ := a.taskByID(id)
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) assignTask(w http.ResponseWriter, r *http.Request, id string) {
	var req struct {
		AssigneeID string `json:"assigneeId"`
		UserName   string `json:"userName"`
		UserRole   string `json:"userRole"`
		UserDept   string `json:"userDepartment"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "指派数据格式不正确")
		return
	}
	task, err := a.taskByID(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "任务不存在")
		return
	}
	if !a.canManageDept(req.UserRole, req.UserDept, task.TargetDepartment) {
		writeError(w, http.StatusForbidden, "当前账号没有该部门指派权限")
		return
	}
	user, err := a.findUserByID(req.AssigneeID)
	if err != nil || user.Department != task.TargetDepartment {
		writeError(w, http.StatusBadRequest, "只能指派给承接部门的员工")
		return
	}
	_, err = a.db.Exec(`
		INSERT INTO task_assignments (id, task_id, assignee_id, assignee_name, status, created_at)
		VALUES (?, ?, ?, ?, 'todo', ?)
	`, randomID("ta"), id, user.ID, user.Name, nowText())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	next := firstNonEmpty(a.transitionByStatus(task.Status, "approve"), fallbackTransition(task.Status, "approve"))
	if next == "" {
		next = "in_progress"
	}
	_, _ = a.db.Exec(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`, next, nowText(), id)
	a.addTaskLog(id, "指派给 "+user.Name+"，进入「"+statusLabel(next)+"」", firstNonEmpty(req.UserName, "负责人"))
	updated, _ := a.taskByID(id)
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) feedbackTask(w http.ResponseWriter, r *http.Request, id string) {
	var req struct {
		AssigneeID   string   `json:"assigneeId"`
		FeedbackText string   `json:"feedbackText"`
		Attachments  []string `json:"attachments"`
		UserName     string   `json:"userName"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "反馈数据格式不正确")
		return
	}
	if strings.TrimSpace(req.FeedbackText) == "" && len(req.Attachments) == 0 {
		writeError(w, http.StatusBadRequest, "反馈文本和附件至少填写一项")
		return
	}
	result, err := a.db.Exec(`
		UPDATE task_assignments
		SET status = 'completed', feedback_text = ?, attachments_json = ?, completed_at = ?
		WHERE task_id = ? AND assignee_id = ?
	`, req.FeedbackText, jsonText(req.Attachments), nowText(), id, req.AssigneeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeError(w, http.StatusForbidden, "当前账号没有该任务反馈权限")
		return
	}
	task, _ := a.taskByID(id)
	next := firstNonEmpty(a.transitionByStatus(task.Status, "approve"), fallbackTransition(task.Status, "approve"))
	if next == "" {
		next = "completed"
	}
	_, _ = a.db.Exec(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`, next, nowText(), id)
	a.addTaskLog(id, "成员反馈完成，进入「"+statusLabel(next)+"」", firstNonEmpty(req.UserName, "成员"))
	updated, _ := a.taskByID(id)
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) addTaskLog(taskID, action, userName string) {
	_, _ = a.db.Exec(`INSERT INTO task_logs (task_id, action, time, user_name) VALUES (?, ?, ?, ?)`, taskID, action, nowText(), userName)
}

func (a *App) canManageDept(role, userDept, targetDept string) bool {
	role = normalizeRole(role)
	if role == "admin" {
		return true
	}
	return role == "manager" && strings.TrimSpace(userDept) == strings.TrimSpace(targetDept)
}

func parseStringSlice(raw string) []string {
	items := []string{}
	_ = json.Unmarshal([]byte(raw), &items)
	return items
}

func (a *App) listApprovals(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(`SELECT id, title, type, requester, status, description, created_at FROM approvals ORDER BY created_at DESC, id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	items := []Approval{}
	for rows.Next() {
		var item Approval
		if err := rows.Scan(&item.ID, &item.Title, &item.Type, &item.Requester, &item.Status, &item.Description, &item.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *App) updateApproval(w http.ResponseWriter, r *http.Request, id string) {
	var req struct {
		Status string `json:"status"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "审批数据格式不正确")
		return
	}
	if req.Status != "approved" && req.Status != "rejected" && req.Status != "pending" {
		writeError(w, http.StatusBadRequest, "审批状态不正确")
		return
	}
	result, err := a.db.Exec(`UPDATE approvals SET status = ? WHERE id = ?`, req.Status, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeError(w, http.StatusNotFound, "审批不存在")
		return
	}
	a.listApprovals(w, r)
}

func (a *App) listWorkflows(w http.ResponseWriter, r *http.Request) {
	workflows, err := a.allWorkflows()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, workflows)
}

func (a *App) workflowAction(w http.ResponseWriter, r *http.Request, rest string) {
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "流程不存在")
		return
	}
	key := parts[0]
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			workflow, err := a.workflowByKey(key)
			if err != nil {
				writeError(w, http.StatusNotFound, "流程定义不存在")
				return
			}
			writeJSON(w, http.StatusOK, workflow)
		case http.MethodPost, http.MethodPut:
			a.saveWorkflow(w, r, key)
		case http.MethodDelete:
			a.deleteWorkflow(w, r, key)
		default:
			writeError(w, http.StatusNotFound, "流程操作不存在")
		}
		return
	}
	if len(parts) == 2 && parts[1] == "activate" && r.Method == http.MethodPost {
		a.activateWorkflow(w, r, key)
		return
	}
	writeError(w, http.StatusNotFound, "流程操作不存在")
}

func (a *App) allWorkflows() ([]WorkflowDefinition, error) {
	rows, err := a.db.Query(`SELECT workflow_key FROM workflow_definitions WHERE is_active = 1 ORDER BY updated_at DESC, workflow_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	workflows := []WorkflowDefinition{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		workflow, err := a.workflowByKey(key)
		if err != nil {
			return nil, err
		}
		workflows = append(workflows, workflow)
	}
	return workflows, rows.Err()
}

func (a *App) workflowByKey(key string) (WorkflowDefinition, error) {
	var workflow WorkflowDefinition
	var nodesJSON string
	var active int
	err := a.db.QueryRow(`
		SELECT id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by
		FROM workflow_definitions
		WHERE workflow_key = ? AND is_active = 1
	`, key).Scan(&workflow.ID, &workflow.Key, &workflow.Name, &workflow.Description, &nodesJSON, &active, &workflow.UpdatedAt, &workflow.UpdatedBy)
	if err == sql.ErrNoRows {
		return workflow, errNotFound
	}
	if err != nil {
		return workflow, err
	}
	workflow.Nodes = parseWorkflowNodes(nodesJSON)
	workflow.IsTaskWorkflow = key == a.activeTaskWorkflowKey()
	return workflow, nil
}

func (a *App) saveWorkflow(w http.ResponseWriter, r *http.Request, key string) {
	var req WorkflowDefinition
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "流程数据格式不正确")
		return
	}
	req.Key = safeWorkflowKey(firstNonEmpty(req.Key, key))
	req.Name = firstNonEmpty(strings.TrimSpace(req.Name), req.Key)
	req.Description = firstNonEmpty(strings.TrimSpace(req.Description), "自定义业务流程")
	if len(req.Nodes) == 0 {
		req.Nodes = defaultWorkflowNodes()
	}
	req.UpdatedAt = nowText()
	req.UpdatedBy = firstNonEmpty(req.UpdatedBy, "admin")
	req.ID = firstNonEmpty(req.ID, randomID("wf"))

	var err error
	if a.dbDriver == "mysql" {
		_, err = a.db.Exec(`
			INSERT INTO workflow_definitions (id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by)
			VALUES (?, ?, ?, ?, ?, 1, ?, ?)
			ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), nodes_json = VALUES(nodes_json),
				is_active = 1, updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)
		`, req.ID, req.Key, req.Name, req.Description, jsonText(req.Nodes), req.UpdatedAt, req.UpdatedBy)
	} else {
		_, err = a.db.Exec(`
			INSERT INTO workflow_definitions (id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by)
			VALUES (?, ?, ?, ?, ?, 1, ?, ?)
			ON CONFLICT(workflow_key) DO UPDATE SET name = excluded.name, description = excluded.description,
				nodes_json = excluded.nodes_json, is_active = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by
		`, req.ID, req.Key, req.Name, req.Description, jsonText(req.Nodes), req.UpdatedAt, req.UpdatedBy)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	workflow, _ := a.workflowByKey(req.Key)
	writeJSON(w, http.StatusOK, workflow)
}

func (a *App) activateWorkflow(w http.ResponseWriter, r *http.Request, key string) {
	if _, err := a.workflowByKey(key); err != nil {
		writeError(w, http.StatusNotFound, "流程定义不存在")
		return
	}
	if err := a.upsertSetting("activeTaskWorkflowKey", key); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	workflow, _ := a.workflowByKey(key)
	workflow.IsTaskWorkflow = true
	writeJSON(w, http.StatusOK, workflow)
}

func (a *App) deleteWorkflow(w http.ResponseWriter, r *http.Request, key string) {
	if key == a.activeTaskWorkflowKey() {
		writeError(w, http.StatusBadRequest, "当前任务看板正在使用该流程，请先切换到其他流程再删除")
		return
	}
	result, err := a.db.Exec(`UPDATE workflow_definitions SET is_active = 0 WHERE workflow_key = ?`, key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeError(w, http.StatusNotFound, "流程定义不存在")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) activeTaskWorkflowKey() string {
	var value string
	if err := a.db.QueryRow(`SELECT value FROM app_settings WHERE setting_key = 'activeTaskWorkflowKey'`).Scan(&value); err == nil && value != "" {
		return value
	}
	return "task_fulfillment"
}

func (a *App) activeWorkflow() WorkflowDefinition {
	workflow, err := a.workflowByKey(a.activeTaskWorkflowKey())
	if err != nil {
		return WorkflowDefinition{Key: "task_fulfillment", Nodes: defaultWorkflowNodes()}
	}
	return workflow
}

func (a *App) transitionByAction(action, branch string) string {
	workflow := a.activeWorkflow()
	for _, node := range workflow.Nodes {
		if node.Action == action {
			return resolveStatus(workflow.Nodes, node, branch)
		}
	}
	return ""
}

func (a *App) transitionByStatus(status, branch string) string {
	workflow := a.activeWorkflow()
	for _, node := range workflow.Nodes {
		if node.Status == status {
			return resolveStatus(workflow.Nodes, node, branch)
		}
	}
	return ""
}

func resolveStatus(nodes []WorkflowNode, current WorkflowNode, branch string) string {
	nextID := current.NextNodeID
	if branch == "reject" && current.RejectNodeID != "" {
		nextID = current.RejectNodeID
	}
	visited := map[string]bool{}
	for nextID != "" && !visited[nextID] {
		visited[nextID] = true
		var next WorkflowNode
		found := false
		for _, node := range nodes {
			if node.ID == nextID {
				next = node
				found = true
				break
			}
		}
		if !found {
			return ""
		}
		if next.Status != "" {
			return next.Status
		}
		nextID = next.NextNodeID
	}
	return ""
}

func fallbackTransition(status, branch string) string {
	if branch == "reject" {
		return "rejected"
	}
	switch status {
	case "pending_source_review":
		return "pending_target_review"
	case "pending_target_review":
		return "ready_for_assignment"
	case "ready_for_assignment":
		return "in_progress"
	case "in_progress":
		return "completed"
	default:
		return ""
	}
}

func safeWorkflowKey(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return randomID("workflow")
	}
	replacer := strings.NewReplacer(" ", "_", "/", "_", "\\", "_", ":", "_")
	return replacer.Replace(value)
}
