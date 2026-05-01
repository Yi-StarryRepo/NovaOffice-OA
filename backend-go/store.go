package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

type departmentRow struct {
	Department
	ParentID string
}

func (a *App) initDB() error {
	for _, statement := range a.schemaStatements() {
		if _, err := a.db.Exec(statement); err != nil {
			return err
		}
	}
	if err := a.migrateSettingsTable(); err != nil {
		return err
	}
	return a.seed()
}

func (a *App) schemaStatements() []string {
	if a.dbDriver == "mysql" {
		return []string{
			`CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, role VARCHAR(32) NOT NULL, department VARCHAR(255) NOT NULL, avatar TEXT NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS departments (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, manager VARCHAR(255) NOT NULL, parent_id VARCHAR(64) NULL, sort_order BIGINT NOT NULL DEFAULT 0, INDEX idx_departments_parent (parent_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS tasks (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT NOT NULL, source_department VARCHAR(255) NOT NULL, target_department VARCHAR(255) NOT NULL, status VARCHAR(64) NOT NULL, priority VARCHAR(32) NOT NULL, due_date VARCHAR(32) NOT NULL, source_reviewer VARCHAR(255) NULL, target_reviewer VARCHAR(255) NULL, created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS task_assignments (id VARCHAR(64) PRIMARY KEY, task_id VARCHAR(64) NOT NULL, assignee_id VARCHAR(64) NOT NULL, assignee_name VARCHAR(255) NOT NULL, status VARCHAR(64) NOT NULL, feedback_text TEXT NULL, attachments_json TEXT NULL, completed_at VARCHAR(64) NULL, created_at VARCHAR(64) NOT NULL, INDEX idx_task_assignments_task (task_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS task_logs (id BIGINT PRIMARY KEY AUTO_INCREMENT, task_id VARCHAR(64) NOT NULL, action VARCHAR(255) NOT NULL, time VARCHAR(64) NOT NULL, user_name VARCHAR(255) NOT NULL, INDEX idx_task_logs_task (task_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS approvals (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, type VARCHAR(64) NOT NULL, requester VARCHAR(255) NOT NULL, status VARCHAR(64) NOT NULL, description TEXT NOT NULL, created_at VARCHAR(64) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(128) PRIMARY KEY, value TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
			`CREATE TABLE IF NOT EXISTS workflow_definitions (id VARCHAR(64) PRIMARY KEY, workflow_key VARCHAR(128) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, description TEXT NOT NULL, nodes_json LONGTEXT NOT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1, updated_at VARCHAR(64) NOT NULL, updated_by VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
		}
	}
	return []string{
		`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL, avatar TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, manager TEXT NOT NULL, parent_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0);`,
		`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, source_department TEXT NOT NULL, target_department TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, due_date TEXT NOT NULL, source_reviewer TEXT, target_reviewer TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS task_assignments (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, assignee_id TEXT NOT NULL, assignee_name TEXT NOT NULL, status TEXT NOT NULL, feedback_text TEXT, attachments_json TEXT, completed_at TEXT, created_at TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, action TEXT NOT NULL, time TEXT NOT NULL, user_name TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, requester TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS app_settings (setting_key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS workflow_definitions (id TEXT PRIMARY KEY, workflow_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL, nodes_json TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);`,
	}
}

func (a *App) migrateSettingsTable() error {
	if a.dbDriver != "sqlite" {
		return nil
	}
	rows, err := a.db.Query(`SELECT setting_key, value FROM app_settings LIMIT 1`)
	if err == nil {
		rows.Close()
		return nil
	}
	if _, err := a.db.Exec(`ALTER TABLE app_settings RENAME TO app_settings_old`); err != nil {
		return nil
	}
	if _, err := a.db.Exec(`CREATE TABLE IF NOT EXISTS app_settings (setting_key TEXT PRIMARY KEY, value TEXT NOT NULL);`); err != nil {
		return err
	}
	_, _ = a.db.Exec(`INSERT OR IGNORE INTO app_settings(setting_key, value) SELECT key, value FROM app_settings_old`)
	_, _ = a.db.Exec(`DROP TABLE app_settings_old`)
	return nil
}

func (a *App) seed() error {
	var count int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM departments`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		depts := [][]any{
			{"dept_root", "NovaOffice 集团", "CEO", nil, 0},
			{"dept_board", "董事会", "CEO", "dept_root", 1},
			{"dept_ops", "运维部", "张经理", "dept_root", 2},
			{"dept_dev", "开发部", "李主管", "dept_root", 3},
			{"dept_unassigned", "未分配", "系统", "dept_root", 99},
		}
		for _, d := range depts {
			if _, err := a.db.Exec(`INSERT INTO departments (id, name, manager, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)`, d...); err != nil {
				return err
			}
		}
	}
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		users := []User{
			{ID: "u_ceo", Name: "CEO", Role: "admin", Department: "董事会", Avatar: "https://picsum.photos/seed/admin/96", Email: "admin@novaoffice.com", Password: "123456"},
			{ID: "u_ops_manager", Name: "张经理", Role: "manager", Department: "运维部", Avatar: "https://picsum.photos/seed/manager/96", Email: "manager@novaoffice.com", Password: "123456"},
			{ID: "u_ops_member", Name: "运维张三", Role: "member", Department: "运维部", Avatar: "https://picsum.photos/seed/ops1/96", Email: "ops1@novaoffice.com", Password: "123456"},
			{ID: "u_dev_manager", Name: "李主管", Role: "manager", Department: "开发部", Avatar: "https://picsum.photos/seed/devmanager/96", Email: "dev-manager@novaoffice.com", Password: "123456"},
			{ID: "u_dev_member", Name: "开发小王", Role: "member", Department: "开发部", Avatar: "https://picsum.photos/seed/dev1/96", Email: "dev1@novaoffice.com", Password: "123456"},
		}
		for _, user := range users {
			if _, err := a.db.Exec(`INSERT INTO users (id, name, role, department, avatar, email, password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				user.ID, user.Name, user.Role, user.Department, user.Avatar, user.Email, user.Password); err != nil {
				return err
			}
		}
	}
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM approvals`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		rows := [][]any{
			{"ap_leave", "年假申请", "leave", "开发小王", "pending", "申请 2 天年假", todayText()},
			{"ap_expense", "采购报销", "expense", "运维张三", "pending", "服务器配件采购报销", todayText()},
		}
		for _, row := range rows {
			if _, err := a.db.Exec(`INSERT INTO approvals (id, title, type, requester, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, row...); err != nil {
				return err
			}
		}
	}
	if err := a.ensureDefaultWorkflow(); err != nil {
		return err
	}
	for key, value := range map[string]string{
		"appTitle":              "NovaOffice OA",
		"appLogo":               "",
		"activeTaskWorkflowKey": "task_fulfillment",
	} {
		if err := a.insertSettingIfMissing(key, value); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) ensureDefaultWorkflow() error {
	var count int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM workflow_definitions WHERE workflow_key = 'task_fulfillment'`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err := a.db.Exec(`INSERT INTO workflow_definitions (id, workflow_key, name, description, nodes_json, is_active, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
		"wf_task_fulfillment", "task_fulfillment", "跨部门任务流程", "需求提交、双负责人审核、部门指派与成员反馈的标准 OA 业务流程。", jsonText(defaultWorkflowNodes()), nowText(), "system")
	return err
}

func defaultWorkflowNodes() []WorkflowNode {
	return []WorkflowNode{
		{ID: "wf_submit", Name: "需求提交", Action: "submit", Actor: "发起人", Kind: "start", Description: "提交需求入口", Status: "pending_source_review", X: 120, Y: 180, NextNodeID: "wf_source_review"},
		{ID: "wf_source_review", Name: "发起部门审核", Action: "source_review", Actor: "发起部门负责人", Kind: "approval", Description: "发起部门负责人审核需求合理性", Status: "pending_source_review", X: 420, Y: 180, NextNodeID: "wf_target_review", RejectNodeID: "wf_reject"},
		{ID: "wf_target_review", Name: "承接部门审核", Action: "target_review", Actor: "承接部门负责人", Kind: "approval", Description: "承接部门负责人确认是否接收", Status: "pending_target_review", X: 720, Y: 180, NextNodeID: "wf_assign", RejectNodeID: "wf_reject"},
		{ID: "wf_assign", Name: "部门指派", Action: "assign", Actor: "承接部门负责人", Kind: "task", Description: "指派给部门成员", Status: "ready_for_assignment", X: 1020, Y: 180, NextNodeID: "wf_feedback"},
		{ID: "wf_feedback", Name: "成员处理反馈", Action: "feedback", Actor: "承接部门成员", Kind: "task", Description: "成员提交处理结果和附件", Status: "in_progress", X: 1320, Y: 180, NextNodeID: "wf_complete"},
		{ID: "wf_complete", Name: "流程完成", Action: "complete", Actor: "系统自动执行", Kind: "end", Description: "任务验收完成后结束流程", Status: "completed", X: 1620, Y: 180},
		{ID: "wf_reject", Name: "流程驳回", Action: "reject", Actor: "系统自动执行", Kind: "reject", Description: "审核拒绝或终止", Status: "rejected", X: 720, Y: 440},
	}
}

func (a *App) insertSettingIfMissing(key, value string) error {
	if a.dbDriver == "mysql" {
		_, err := a.db.Exec(`INSERT IGNORE INTO app_settings (setting_key, value) VALUES (?, ?)`, key, value)
		return err
	}
	_, err := a.db.Exec(`INSERT OR IGNORE INTO app_settings (setting_key, value) VALUES (?, ?)`, key, value)
	return err
}

func (a *App) upsertSetting(key, value string) error {
	if a.dbDriver == "mysql" {
		_, err := a.db.Exec(`INSERT INTO app_settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, key, value)
		return err
	}
	_, err := a.db.Exec(`INSERT INTO app_settings (setting_key, value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "administrator", "系统管理员", "核心管理":
		return "admin"
	case "manager", "部门管理":
		return "manager"
	default:
		return "member"
	}
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "登录参数不正确")
		return
	}
	user, err := a.findUserByEmail(strings.TrimSpace(req.Email))
	if err != nil || user.Password != req.Password {
		writeError(w, http.StatusUnauthorized, "邮箱或密码错误")
		return
	}
	writeJSON(w, http.StatusOK, publicUser(user))
}

func (a *App) userByID(w http.ResponseWriter, r *http.Request) {
	user, err := a.findUserByID(firstNonEmpty(r.URL.Query().Get("id"), "u_ceo"))
	if err != nil {
		writeError(w, http.StatusNotFound, "用户不存在")
		return
	}
	writeJSON(w, http.StatusOK, publicUser(user))
}

func (a *App) findUserByID(id string) (User, error) {
	var user User
	err := a.db.QueryRow(`SELECT id, name, role, department, avatar, email, password FROM users WHERE id = ?`, id).
		Scan(&user.ID, &user.Name, &user.Role, &user.Department, &user.Avatar, &user.Email, &user.Password)
	if err == sql.ErrNoRows {
		return user, errNotFound
	}
	return user, err
}

func (a *App) findUserByEmail(email string) (User, error) {
	var user User
	err := a.db.QueryRow(`SELECT id, name, role, department, avatar, email, password FROM users WHERE email = ?`, email).
		Scan(&user.ID, &user.Name, &user.Role, &user.Department, &user.Avatar, &user.Email, &user.Password)
	if err == sql.ErrNoRows {
		return user, errNotFound
	}
	return user, err
}

func (a *App) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(`SELECT id, name, role, department, avatar, email, password FROM users ORDER BY department, role, name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.Name, &user.Role, &user.Department, &user.Avatar, &user.Email, &user.Password); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		users = append(users, publicUser(user))
	}
	writeJSON(w, http.StatusOK, users)
}

func (a *App) saveUser(w http.ResponseWriter, r *http.Request) {
	var req User
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "员工数据格式不正确")
		return
	}
	if badRequestIfEmpty(w, map[string]string{"员工姓名": req.Name, "邮箱": req.Email, "角色": req.Role, "所属部门": req.Department}) {
		return
	}
	if !a.departmentExists(req.Department) {
		writeError(w, http.StatusBadRequest, "所属部门不存在")
		return
	}
	if req.ID == "" {
		req.ID = randomID("u")
	}
	if req.Avatar == "" {
		req.Avatar = "https://picsum.photos/seed/" + req.ID + "/96"
	}
	if req.Password == "" {
		req.Password = "123456"
	}
	req.Role = normalizeRole(req.Role)

	var err error
	if a.dbDriver == "mysql" {
		_, err = a.db.Exec(`INSERT INTO users (id, name, role, department, avatar, email, password) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), department = VALUES(department), avatar = VALUES(avatar), email = VALUES(email), password = VALUES(password)`,
			req.ID, req.Name, req.Role, req.Department, req.Avatar, req.Email, req.Password)
	} else {
		_, err = a.db.Exec(`INSERT INTO users (id, name, role, department, avatar, email, password) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, department = excluded.department, avatar = excluded.avatar, email = excluded.email, password = excluded.password`,
			req.ID, req.Name, req.Role, req.Department, req.Avatar, req.Email, req.Password)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	user, _ := a.findUserByID(req.ID)
	writeJSON(w, http.StatusOK, publicUser(user))
}

func (a *App) deleteUser(w http.ResponseWriter, r *http.Request, id string) {
	if id == "u_ceo" {
		writeError(w, http.StatusBadRequest, "系统管理员账号不能删除")
		return
	}
	result, err := a.db.Exec(`DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeError(w, http.StatusNotFound, "用户不存在")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) listOrg(w http.ResponseWriter, r *http.Request) {
	rows, err := a.departmentRows()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, buildDepartmentTree(rows))
}

func (a *App) departmentRows() ([]departmentRow, error) {
	rows, err := a.db.Query(`
		SELECT d.id, d.name, d.manager, COALESCE(d.parent_id, ''), COUNT(u.id) AS member_count
		FROM departments d
		LEFT JOIN users u ON u.department = d.name
		GROUP BY d.id, d.name, d.manager, d.parent_id, d.sort_order
		ORDER BY d.sort_order, d.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []departmentRow
	for rows.Next() {
		var item departmentRow
		if err := rows.Scan(&item.ID, &item.Name, &item.Manager, &item.ParentID, &item.MemberCount); err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

func (a *App) flatDepartments() ([]Department, error) {
	rows, err := a.departmentRows()
	if err != nil {
		return nil, err
	}
	depts := make([]Department, 0, len(rows))
	for _, row := range rows {
		depts = append(depts, row.Department)
	}
	return depts, nil
}

func buildDepartmentTree(rows []departmentRow) []Department {
	nodes := map[string]*Department{}
	parent := map[string]string{}
	order := map[string]int{}
	for index, row := range rows {
		dept := row.Department
		dept.Children = nil
		nodes[row.ID] = &dept
		parent[row.ID] = row.ParentID
		order[row.ID] = index
	}
	var roots []*Department
	for id, node := range nodes {
		if pid := parent[id]; pid != "" && nodes[pid] != nil {
			nodes[pid].Children = append(nodes[pid].Children, *node)
		} else {
			roots = append(roots, node)
		}
	}
	var sortTree func(*Department)
	sortTree = func(node *Department) {
		sort.SliceStable(node.Children, func(i, j int) bool { return node.Children[i].Name < node.Children[j].Name })
		for i := range node.Children {
			sortTree(&node.Children[i])
		}
	}
	sort.SliceStable(roots, func(i, j int) bool { return order[roots[i].ID] < order[roots[j].ID] })
	result := make([]Department, 0, len(roots))
	for _, root := range roots {
		sortTree(root)
		result = append(result, *root)
	}
	return result
}

func (a *App) saveDepartment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Manager  string `json:"manager"`
		ParentID string `json:"parentId"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "部门数据格式不正确")
		return
	}
	if badRequestIfEmpty(w, map[string]string{"部门名称": req.Name, "负责人": req.Manager}) {
		return
	}
	if req.ParentID == "" {
		req.ParentID = "dept_root"
	}
	if req.ID == "" {
		_ = a.db.QueryRow(`SELECT id FROM departments WHERE name = ?`, req.Name).Scan(&req.ID)
	}
	if req.ID == "" {
		req.ID = randomID("dept")
	}

	var err error
	if a.dbDriver == "mysql" {
		_, err = a.db.Exec(`INSERT INTO departments (id, name, manager, parent_id, sort_order) VALUES (?, ?, ?, ?, 50) ON DUPLICATE KEY UPDATE name = VALUES(name), manager = VALUES(manager), parent_id = VALUES(parent_id)`, req.ID, req.Name, req.Manager, req.ParentID)
	} else {
		_, err = a.db.Exec(`INSERT INTO departments (id, name, manager, parent_id, sort_order) VALUES (?, ?, ?, ?, 50) ON CONFLICT(id) DO UPDATE SET name = excluded.name, manager = excluded.manager, parent_id = excluded.parent_id`, req.ID, req.Name, req.Manager, req.ParentID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.listOrg(w, r)
}

func (a *App) deleteDepartment(w http.ResponseWriter, r *http.Request, id string) {
	if id == "dept_root" || id == "dept_unassigned" {
		writeError(w, http.StatusBadRequest, "系统部门不能删除")
		return
	}
	var name string
	if err := a.db.QueryRow(`SELECT name FROM departments WHERE id = ?`, id).Scan(&name); err != nil {
		writeError(w, http.StatusNotFound, "部门不存在")
		return
	}
	_, _ = a.db.Exec(`UPDATE users SET department = '未分配' WHERE department = ?`, name)
	_, _ = a.db.Exec(`UPDATE departments SET parent_id = 'dept_root' WHERE parent_id = ?`, id)
	if _, err := a.db.Exec(`DELETE FROM departments WHERE id = ?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) departmentExists(name string) bool {
	var count int
	_ = a.db.QueryRow(`SELECT COUNT(*) FROM departments WHERE name = ?`, name).Scan(&count)
	return count > 0
}

func (a *App) settingsMap() (map[string]string, error) {
	rows, err := a.db.Query(`SELECT setting_key, value FROM app_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	settings := map[string]string{}
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	return settings, rows.Err()
}

func parseWorkflowNodes(raw string) []WorkflowNode {
	var nodes []WorkflowNode
	_ = json.Unmarshal([]byte(raw), &nodes)
	if nodes == nil {
		return []WorkflowNode{}
	}
	return nodes
}
