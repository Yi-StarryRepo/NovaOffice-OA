package main

import (
	"bytes"
	"database/sql"
	"fmt"
	"html"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (a *App) getSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := a.settingsMap()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (a *App) updateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Avatar   string `json:"avatar"`
		Password string `json:"password"`
		AppTitle string `json:"appTitle"`
		AppLogo  string `json:"appLogo"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式不正确")
		return
	}

	if strings.TrimSpace(req.AppTitle) != "" {
		if err := a.upsertSetting("appTitle", strings.TrimSpace(req.AppTitle)); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if strings.TrimSpace(req.AppLogo) != "" {
		if err := a.upsertSetting("appLogo", strings.TrimSpace(req.AppLogo)); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if strings.TrimSpace(req.ID) == "" {
		settings, _ := a.settingsMap()
		writeJSON(w, http.StatusOK, settings)
		return
	}

	user, err := a.findUserByID(req.ID)
	if err != nil {
		writeError(w, http.StatusNotFound, "用户不存在")
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		user.Name = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Email) != "" {
		user.Email = strings.TrimSpace(req.Email)
	}
	if strings.TrimSpace(req.Avatar) != "" {
		user.Avatar = strings.TrimSpace(req.Avatar)
	}
	password := strings.TrimSpace(req.Password)
	if password != "" && len(password) < 6 {
		writeError(w, http.StatusBadRequest, "密码至少 6 位")
		return
	}

	if password != "" {
		_, err = a.db.Exec(`UPDATE users SET name = ?, email = ?, avatar = ?, password = ? WHERE id = ?`, user.Name, user.Email, user.Avatar, password, user.ID)
	} else {
		_, err = a.db.Exec(`UPDATE users SET name = ?, email = ?, avatar = ? WHERE id = ?`, user.Name, user.Email, user.Avatar, user.ID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updated, err := a.findUserByID(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, publicUser(updated))
}

func (a *App) analytics(w http.ResponseWriter, r *http.Request) {
	data, err := a.computeAnalytics()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (a *App) analyticsExport(w http.ResponseWriter, r *http.Request) {
	data, err := a.computeAnalytics()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var buf bytes.Buffer
	buf.WriteString(`<!doctype html><html><head><meta charset="utf-8"></head><body>`)
	buf.WriteString(`<h2>NovaOffice OA 实时数据报表</h2>`)
	buf.WriteString(`<p>导出时间：` + html.EscapeString(nowText()) + `</p>`)
	writeSheetTable(&buf, "总览", []string{"指标", "数值"}, [][]string{
		{"任务总数", data.YearlySummary},
		{"待处理任务", strconv.Itoa(data.PendingTasks)},
		{"执行中任务", strconv.Itoa(data.OngoingTasks)},
		{"已完成任务", strconv.Itoa(data.CompletedTasks)},
		{"待审批", strconv.Itoa(data.PendingApprovals)},
		{"员工数", strconv.Itoa(data.TotalUsers)},
		{"部门数", strconv.Itoa(data.TotalDepartments)},
		{"完成率", fmt.Sprintf("%d%%", data.AverageCompletionRate)},
	})

	departmentRows := [][]string{}
	for _, item := range data.DepartmentStats {
		departmentRows = append(departmentRows, []string{
			item.Name, strconv.Itoa(item.MemberCount), strconv.Itoa(item.TotalTasks),
			strconv.Itoa(item.ActiveTasks), strconv.Itoa(item.CompletedTasks), fmt.Sprintf("%d%%", item.CompletionRate),
		})
	}
	writeSheetTable(&buf, "部门统计", []string{"部门", "成员", "任务", "进行中", "已完成", "完成率"}, departmentRows)

	employeeRows := [][]string{}
	for _, item := range data.EmployeeStats {
		employeeRows = append(employeeRows, []string{
			item.Name, item.Department, item.Role, strconv.Itoa(item.TotalAssignments),
			strconv.Itoa(item.ActiveAssignments), strconv.Itoa(item.CompletedAssignments),
		})
	}
	writeSheetTable(&buf, "员工工作量", []string{"员工", "部门", "角色", "任务", "进行中", "已完成"}, employeeRows)

	workloadRows := [][]string{}
	for _, item := range data.CompanyWorkload {
		workloadRows = append(workloadRows, []string{
			item.Label, strconv.Itoa(item.Total), strconv.Itoa(item.Tasks),
			strconv.Itoa(item.Approvals), strconv.Itoa(item.Feedbacks),
		})
	}
	writeSheetTable(&buf, "近 7 日工作量", []string{"日期", "总量", "任务", "审批", "反馈"}, workloadRows)
	buf.WriteString(`</body></html>`)

	filename := fmt.Sprintf("novaoffice-analytics-%s.xls", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/vnd.ms-excel; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}

func (a *App) computeAnalytics() (AnalyticsResponse, error) {
	var data AnalyticsResponse
	totalTasks, err := a.scalarInt(`SELECT COUNT(*) FROM tasks`)
	if err != nil {
		return data, err
	}
	data.YearlySummary = strconv.Itoa(totalTasks)
	data.CompletedTasks, _ = a.scalarInt(`SELECT COUNT(*) FROM tasks WHERE status = 'completed'`)
	data.OngoingTasks, _ = a.scalarInt(`SELECT COUNT(*) FROM tasks WHERE status = 'in_progress'`)
	data.PendingTasks, _ = a.scalarInt(`SELECT COUNT(*) FROM tasks WHERE status IN ('pending_source_review','pending_target_review','ready_for_assignment')`)
	data.TotalUsers, _ = a.scalarInt(`SELECT COUNT(*) FROM users`)
	data.TotalDepartments, _ = a.scalarInt(`SELECT COUNT(*) FROM departments`)
	data.PendingApprovals, _ = a.scalarInt(`SELECT COUNT(*) FROM approvals WHERE status = 'pending'`)
	if totalTasks > 0 {
		data.AverageCompletionRate = int(float64(data.CompletedTasks) / float64(totalTasks) * 100)
	}

	data.CompanyWorkload, data.DailyWorkload, err = a.workloadStats()
	if err != nil {
		return data, err
	}
	data.DepartmentLoads, data.DepartmentStats, err = a.departmentAnalytics(totalTasks)
	if err != nil {
		return data, err
	}
	data.EmployeeStats, err = a.employeeAnalytics()
	if err != nil {
		return data, err
	}
	return data, nil
}

func (a *App) scalarInt(query string, args ...any) (int, error) {
	var value int
	err := a.db.QueryRow(query, args...).Scan(&value)
	return value, err
}

func (a *App) workloadStats() ([]WorkloadBucket, []TrendPoint, error) {
	buckets := map[string]*WorkloadBucket{}
	for i := 6; i >= 0; i-- {
		day := time.Now().AddDate(0, 0, -i)
		buckets[day.Format("2006-01-02")] = &WorkloadBucket{Label: day.Format("1/2")}
	}
	if err := a.fillDailyCounts(buckets, "tasks", "due_date", "Tasks"); err != nil {
		return nil, nil, err
	}
	if err := a.fillDailyCounts(buckets, "approvals", "created_at", "Approvals"); err != nil {
		return nil, nil, err
	}
	rows, err := a.db.Query(`
		SELECT substr(time, 1, 10) AS day, COUNT(*)
		FROM task_logs
		WHERE action LIKE '%反馈%' OR action LIKE '%完成%'
		GROUP BY substr(time, 1, 10)
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var day string
		var count int
		if err := rows.Scan(&day, &count); err != nil {
			return nil, nil, err
		}
		if bucket, ok := buckets[normalizeDay(day)]; ok {
			bucket.Feedbacks += count
		}
	}

	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	workload := make([]WorkloadBucket, 0, len(keys))
	trend := make([]TrendPoint, 0, len(keys))
	for _, key := range keys {
		bucket := buckets[key]
		bucket.Total = bucket.Tasks + bucket.Approvals + bucket.Feedbacks
		workload = append(workload, *bucket)
		trend = append(trend, TrendPoint{Label: bucket.Label, Value: bucket.Total})
	}
	return workload, trend, rows.Err()
}

func (a *App) fillDailyCounts(buckets map[string]*WorkloadBucket, table, column, field string) error {
	rows, err := a.db.Query(fmt.Sprintf(`
		SELECT substr(%s, 1, 10) AS day, COUNT(*)
		FROM %s
		GROUP BY substr(%s, 1, 10)
	`, column, table, column))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var day string
		var count int
		if err := rows.Scan(&day, &count); err != nil {
			return err
		}
		if bucket, ok := buckets[normalizeDay(day)]; ok {
			switch field {
			case "Tasks":
				bucket.Tasks += count
			case "Approvals":
				bucket.Approvals += count
			}
		}
	}
	return rows.Err()
}

func (a *App) departmentAnalytics(totalTasks int) ([]DepartmentLoad, []DepartmentStat, error) {
	rows, err := a.db.Query(`
		SELECT d.name,
		       (SELECT COUNT(*) FROM users u WHERE u.department = d.name) AS member_count,
		       (SELECT COUNT(*) FROM tasks t WHERE t.target_department = d.name OR t.source_department = d.name) AS total_tasks,
		       (SELECT COUNT(*) FROM tasks t WHERE (t.target_department = d.name OR t.source_department = d.name) AND t.status IN ('pending_source_review','pending_target_review','ready_for_assignment','in_progress')) AS active_tasks,
		       (SELECT COUNT(*) FROM tasks t WHERE (t.target_department = d.name OR t.source_department = d.name) AND t.status = 'completed') AS completed_tasks
		FROM departments d
		ORDER BY d.sort_order, d.name
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	colors := []string{"#2563eb", "#7c3aed", "#0f766e", "#ea580c", "#dc2626", "#0891b2"}
	loads := []DepartmentLoad{}
	stats := []DepartmentStat{}
	index := 0
	for rows.Next() {
		var item DepartmentStat
		if err := rows.Scan(&item.Name, &item.MemberCount, &item.TotalTasks, &item.ActiveTasks, &item.CompletedTasks); err != nil {
			return nil, nil, err
		}
		if item.TotalTasks > 0 {
			item.CompletionRate = int(float64(item.CompletedTasks) / float64(item.TotalTasks) * 100)
		}
		percent := 0
		if totalTasks > 0 {
			percent = int(float64(item.TotalTasks) / float64(totalTasks) * 100)
		}
		loads = append(loads, DepartmentLoad{Name: item.Name, Val: percent, Color: colors[index%len(colors)]})
		stats = append(stats, item)
		index++
	}
	return loads, stats, rows.Err()
}

func (a *App) employeeAnalytics() ([]EmployeeStat, error) {
	rows, err := a.db.Query(`
		SELECT u.name, u.department, u.role,
		       COUNT(ta.id) AS total_assignments,
		       SUM(CASE WHEN ta.status IN ('completed','submitted') THEN 1 ELSE 0 END) AS completed_assignments,
		       SUM(CASE WHEN ta.status IN ('todo','in-progress','in_progress') THEN 1 ELSE 0 END) AS active_assignments
		FROM users u
		LEFT JOIN task_assignments ta ON ta.assignee_id = u.id
		GROUP BY u.id, u.name, u.department, u.role
		ORDER BY total_assignments DESC, u.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stats := []EmployeeStat{}
	for rows.Next() {
		var item EmployeeStat
		var completed, active sql.NullInt64
		if err := rows.Scan(&item.Name, &item.Department, &item.Role, &item.TotalAssignments, &completed, &active); err != nil {
			return nil, err
		}
		item.CompletedAssignments = int(completed.Int64)
		item.ActiveAssignments = int(active.Int64)
		stats = append(stats, item)
	}
	return stats, rows.Err()
}

func writeSheetTable(buf *bytes.Buffer, title string, headers []string, rows [][]string) {
	buf.WriteString(`<h3>` + html.EscapeString(title) + `</h3><table border="1" cellspacing="0" cellpadding="6"><thead><tr>`)
	for _, header := range headers {
		buf.WriteString(`<th>` + html.EscapeString(header) + `</th>`)
	}
	buf.WriteString(`</tr></thead><tbody>`)
	for _, row := range rows {
		buf.WriteString(`<tr>`)
		for _, cell := range row {
			buf.WriteString(`<td>` + html.EscapeString(cell) + `</td>`)
		}
		buf.WriteString(`</tr>`)
	}
	if len(rows) == 0 {
		buf.WriteString(`<tr><td colspan="` + strconv.Itoa(len(headers)) + `">暂无数据</td></tr>`)
	}
	buf.WriteString(`</tbody></table>`)
}

func normalizeDay(value string) string {
	value = strings.ReplaceAll(strings.TrimSpace(value), "/", "-")
	if len(value) >= 10 {
		return value[:10]
	}
	return value
}
