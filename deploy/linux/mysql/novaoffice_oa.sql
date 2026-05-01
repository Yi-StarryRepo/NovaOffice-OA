CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  department VARCHAR(255) NOT NULL,
  avatar TEXT NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  manager VARCHAR(255) NOT NULL,
  parent_id VARCHAR(64) NULL,
  sort_order BIGINT NOT NULL DEFAULT 0,
  INDEX idx_departments_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  source_department VARCHAR(255) NOT NULL,
  target_department VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL,
  priority VARCHAR(32) NOT NULL,
  due_date VARCHAR(32) NOT NULL,
  source_reviewer VARCHAR(255) NULL,
  target_reviewer VARCHAR(255) NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_assignments (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  assignee_id VARCHAR(64) NOT NULL,
  assignee_name VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL,
  feedback_text TEXT NULL,
  attachments_json TEXT NULL,
  completed_at VARCHAR(64) NULL,
  created_at VARCHAR(64) NOT NULL,
  INDEX idx_task_assignments_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id VARCHAR(64) NOT NULL,
  action VARCHAR(255) NOT NULL,
  time VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  INDEX idx_task_logs_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approvals (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL,
  requester VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  created_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id VARCHAR(64) PRIMARY KEY,
  workflow_key VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  nodes_json LONGTEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at VARCHAR(64) NOT NULL,
  updated_by VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO departments (id, name, manager, parent_id, sort_order) VALUES
('dept_root', 'NovaOffice 集团', 'CEO', NULL, 0),
('dept_board', '董事会', 'CEO', 'dept_root', 1),
('dept_ops', '运维部', '张经理', 'dept_root', 2),
('dept_dev', '开发部', '李主管', 'dept_root', 3),
('dept_unassigned', '未分配', '系统', 'dept_root', 99);

INSERT IGNORE INTO users (id, name, role, department, avatar, email, password) VALUES
('u_ceo', 'CEO', 'admin', '董事会', 'https://picsum.photos/seed/admin/96', 'admin@novaoffice.com', '123456'),
('u_ops_manager', '张经理', 'manager', '运维部', 'https://picsum.photos/seed/manager/96', 'manager@novaoffice.com', '123456'),
('u_ops_member', '运维张三', 'member', '运维部', 'https://picsum.photos/seed/ops1/96', 'ops1@novaoffice.com', '123456'),
('u_dev_manager', '李主管', 'manager', '开发部', 'https://picsum.photos/seed/devmanager/96', 'dev-manager@novaoffice.com', '123456'),
('u_dev_member', '开发小王', 'member', '开发部', 'https://picsum.photos/seed/dev1/96', 'dev1@novaoffice.com', '123456');

INSERT IGNORE INTO approvals (id, title, type, requester, status, description, created_at) VALUES
('ap_leave', '年假申请', 'leave', '开发小王', 'pending', '申请 2 天年假', CURDATE()),
('ap_expense', '采购报销', 'expense', '运维张三', 'pending', '服务器配件采购报销', CURDATE());

INSERT INTO app_settings (setting_key, value) VALUES
('appTitle', 'NovaOffice OA'),
('appLogo', ''),
('activeTaskWorkflowKey', 'task_fulfillment')
ON DUPLICATE KEY UPDATE value = VALUES(value);
