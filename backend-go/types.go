package main

type User struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Avatar     string `json:"avatar"`
	Role       string `json:"role"`
	Department string `json:"department"`
	Email      string `json:"email,omitempty"`
	Password   string `json:"-"`
}

type TaskAssignment struct {
	ID           string   `json:"id"`
	AssigneeID   string   `json:"assigneeId"`
	AssigneeName string   `json:"assigneeName"`
	Status       string   `json:"status"`
	FeedbackText string   `json:"feedbackText,omitempty"`
	Attachments  []string `json:"attachments,omitempty"`
	CompletedAt  string   `json:"completedAt,omitempty"`
}

type TaskLog struct {
	Action string `json:"action"`
	Time   string `json:"time"`
	User   string `json:"user"`
}

type MainTask struct {
	ID               string           `json:"id"`
	Title            string           `json:"title"`
	Description      string           `json:"description"`
	SourceDepartment string           `json:"sourceDepartment"`
	TargetDepartment string           `json:"targetDepartment"`
	Status           string           `json:"status"`
	Priority         string           `json:"priority"`
	DueDate          string           `json:"dueDate"`
	SourceReviewer   string           `json:"sourceReviewer,omitempty"`
	TargetReviewer   string           `json:"targetReviewer,omitempty"`
	Assignments      []TaskAssignment `json:"assignments"`
	Logs             []TaskLog        `json:"logs"`
}

type Department struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Manager     string       `json:"manager"`
	MemberCount int          `json:"memberCount"`
	Children    []Department `json:"children,omitempty"`
}

type Approval struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	Requester   string `json:"requester"`
	Status      string `json:"status"`
	Description string `json:"description"`
	CreatedAt   string `json:"createdAt"`
}

type WorkflowEdgeWaypoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type WorkflowNode struct {
	ID             string                `json:"id"`
	Name           string                `json:"name"`
	Action         string                `json:"action"`
	Actor          string                `json:"actor"`
	Kind           string                `json:"kind,omitempty"`
	Description    string                `json:"description,omitempty"`
	Status         string                `json:"status,omitempty"`
	X              float64               `json:"x"`
	Y              float64               `json:"y"`
	NextNodeID     string                `json:"nextNodeId,omitempty"`
	RejectNodeID   string                `json:"rejectNodeId,omitempty"`
	NextWaypoint   *WorkflowEdgeWaypoint `json:"nextWaypoint,omitempty"`
	RejectWaypoint *WorkflowEdgeWaypoint `json:"rejectWaypoint,omitempty"`
}

type WorkflowDefinition struct {
	ID             string         `json:"id"`
	Key            string         `json:"key"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	UpdatedAt      string         `json:"updatedAt"`
	UpdatedBy      string         `json:"updatedBy"`
	IsTaskWorkflow bool           `json:"isTaskWorkflow,omitempty"`
	Nodes          []WorkflowNode `json:"nodes"`
}

type WorkloadBucket struct {
	Label     string `json:"label"`
	Total     int    `json:"total"`
	Tasks     int    `json:"tasks"`
	Approvals int    `json:"approvals"`
	Feedbacks int    `json:"feedbacks"`
}

type TrendPoint struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}

type DepartmentLoad struct {
	Name  string `json:"name"`
	Val   int    `json:"val"`
	Color string `json:"color"`
}

type DepartmentStat struct {
	Name           string `json:"name"`
	MemberCount    int    `json:"memberCount"`
	TotalTasks     int    `json:"totalTasks"`
	ActiveTasks    int    `json:"activeTasks"`
	CompletedTasks int    `json:"completedTasks"`
	CompletionRate int    `json:"completionRate"`
}

type EmployeeStat struct {
	Name                 string `json:"name"`
	Department           string `json:"department"`
	Role                 string `json:"role"`
	TotalAssignments     int    `json:"totalAssignments"`
	CompletedAssignments int    `json:"completedAssignments"`
	ActiveAssignments    int    `json:"activeAssignments"`
}

type AnalyticsResponse struct {
	YearlySummary         string           `json:"yearlySummary"`
	CompletedTasks        int              `json:"completedTasks"`
	OngoingTasks          int              `json:"ongoingTasks"`
	PendingTasks          int              `json:"pendingTasks"`
	AverageCompletionRate int              `json:"averageCompletionRate"`
	TotalUsers            int              `json:"totalUsers"`
	TotalDepartments      int              `json:"totalDepartments"`
	PendingApprovals      int              `json:"pendingApprovals"`
	CompanyWorkload       []WorkloadBucket `json:"companyWorkload"`
	DailyWorkload         []TrendPoint     `json:"dailyWorkload"`
	DepartmentLoads       []DepartmentLoad `json:"departmentLoads"`
	DepartmentStats       []DepartmentStat `json:"departmentStats"`
	EmployeeStats         []EmployeeStat   `json:"employeeStats"`
}
