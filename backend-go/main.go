package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "modernc.org/sqlite"
)

type App struct {
	db       *sql.DB
	dbDriver string
	dbLabel  string
	dist     string
}

func main() {
	app, err := NewApp()
	if err != nil {
		log.Fatal(err)
	}
	defer app.db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/", app.handle)

	port := getenv("PORT", "3000")
	log.Printf("NovaOffice Go backend listening on :%s, db=%s", port, app.dbLabel)
	if err := http.ListenAndServe(":"+port, cors(mux)); err != nil {
		log.Fatal(err)
	}
}

func NewApp() (*App, error) {
	root, err := projectRoot()
	if err != nil {
		return nil, err
	}

	driver := strings.ToLower(getenv("DB_DRIVER", "sqlite"))
	var db *sql.DB
	var label string

	switch driver {
	case "mysql":
		dsn := os.Getenv("MYSQL_DSN")
		if dsn == "" {
			return nil, errors.New("DB_DRIVER=mysql 时必须配置 MYSQL_DSN")
		}
		db, err = sql.Open("mysql", dsn)
		if err != nil {
			return nil, err
		}
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(10)
		db.SetConnMaxLifetime(30 * time.Minute)
		if err := db.Ping(); err != nil {
			return nil, fmt.Errorf("连接 MySQL 失败: %w", err)
		}
		label = "mysql"
	case "sqlite", "":
		driver = "sqlite"
		dbPath := os.Getenv("NOVA_DB_PATH")
		if dbPath == "" {
			dbPath = filepath.Join(root, "data", "novaoffice.db")
		}
		if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
			return nil, err
		}
		db, err = sql.Open("sqlite", dbPath)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
			return nil, err
		}
		label = dbPath
	default:
		return nil, fmt.Errorf("不支持的 DB_DRIVER: %s", driver)
	}

	app := &App{db: db, dbDriver: driver, dbLabel: label, dist: filepath.Join(root, "dist")}
	if err := app.initDB(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return app, nil
}

func projectRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	if filepath.Base(cwd) == "backend-go" {
		return filepath.Dir(cwd), nil
	}
	return cwd, nil
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) handle(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		a.handleAPI(w, r)
		return
	}
	a.serveStatic(w, r)
}

func (a *App) handleAPI(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api")
	switch {
	case r.Method == http.MethodGet && path == "/health":
		writeJSON(w, http.StatusOK, map[string]any{
			"status":    "up",
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
			"version":   "3.0.0-go",
			"database":  a.dbLabel,
			"driver":    a.dbDriver,
		})
	case r.Method == http.MethodPost && path == "/login":
		a.login(w, r)
	case r.Method == http.MethodGet && path == "/user":
		a.userByID(w, r)
	case r.Method == http.MethodGet && path == "/users/all":
		a.listUsers(w, r)
	case r.Method == http.MethodPost && path == "/users":
		a.saveUser(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "/users/"):
		a.deleteUser(w, r, strings.TrimPrefix(path, "/users/"))
	case r.Method == http.MethodGet && path == "/tasks":
		a.listTasks(w, r)
	case r.Method == http.MethodPost && path == "/tasks":
		a.createTask(w, r)
	case strings.HasPrefix(path, "/tasks/"):
		a.taskAction(w, r, strings.TrimPrefix(path, "/tasks/"))
	case r.Method == http.MethodGet && path == "/org":
		a.listOrg(w, r)
	case r.Method == http.MethodPost && path == "/org":
		a.saveDepartment(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "/org/"):
		a.deleteDepartment(w, r, strings.TrimPrefix(path, "/org/"))
	case r.Method == http.MethodGet && path == "/workflows":
		a.listWorkflows(w, r)
	case strings.HasPrefix(path, "/workflows/"):
		a.workflowAction(w, r, strings.TrimPrefix(path, "/workflows/"))
	case r.Method == http.MethodGet && path == "/approvals":
		a.listApprovals(w, r)
	case r.Method == http.MethodPatch && strings.HasPrefix(path, "/approvals/"):
		a.updateApproval(w, r, strings.TrimPrefix(path, "/approvals/"))
	case r.Method == http.MethodGet && path == "/settings":
		a.getSettings(w, r)
	case r.Method == http.MethodPost && path == "/settings/profile":
		a.updateProfile(w, r)
	case r.Method == http.MethodGet && path == "/analytics":
		a.analytics(w, r)
	case r.Method == http.MethodGet && path == "/analytics/export":
		a.analyticsExport(w, r)
	default:
		writeError(w, http.StatusNotFound, "接口不存在")
	}
}

func (a *App) serveStatic(w http.ResponseWriter, r *http.Request) {
	if _, err := os.Stat(a.dist); err != nil {
		writeError(w, http.StatusNotFound, "前端静态文件不存在，请先执行 npm run build")
		return
	}
	clean := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if clean == "." || clean == string(filepath.Separator) {
		clean = "index.html"
	}
	target := filepath.Join(a.dist, clean)
	if !strings.HasPrefix(target, a.dist) {
		http.NotFound(w, r)
		return
	}
	if info, err := os.Stat(target); err == nil && !info.IsDir() {
		http.ServeFile(w, r, target)
		return
	}
	http.ServeFile(w, r, filepath.Join(a.dist, "index.html"))
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decode(r *http.Request, out any) error {
	return json.NewDecoder(r.Body).Decode(out)
}

func publicUser(user User) User {
	user.Password = ""
	return user
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func nowText() string {
	return time.Now().Format("2006/1/2 15:04:05")
}

func todayText() string {
	return time.Now().Format("2006-01-02")
}

func randomID(prefix string) string {
	return fmt.Sprintf("%s_%s", prefix, randSeq(8))
}

func randSeq(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

var errNotFound = errors.New("not found")

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func jsonText(value any) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

func statusLabel(status string) string {
	labels := map[string]string{
		"pending_source_review": "待发起部门审核",
		"pending_target_review": "待承接部门审核",
		"ready_for_assignment":  "待部门指派",
		"in_progress":           "执行中",
		"completed":             "已完成",
		"rejected":              "已驳回",
		"pending":               "待处理",
		"approved":              "已同意",
	}
	if label, ok := labels[status]; ok {
		return label
	}
	return status
}

func badRequestIfEmpty(w http.ResponseWriter, pairs map[string]string) bool {
	for label, value := range pairs {
		if strings.TrimSpace(value) == "" {
			writeError(w, http.StatusBadRequest, label+"不能为空")
			return true
		}
	}
	return false
}
