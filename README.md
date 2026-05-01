# NovaOffice OA

![NovaOffice OA 海报](docs/images/NovaofficeOA.png)

让流程更清晰，让协作更高效。

NovaOffice OA 是一套面向企业数字化协作场景打造的智能办公管理平台，聚焦流程审批、跨部门任务协同、组织权限治理、流程设计与数据可视化，帮助团队把“发起、审核、指派、执行、反馈、追踪”连接成一条完整闭环。

## 为什么是 NovaOffice OA

企业在日常协作中经常会遇到这些问题：

- 任务跨部门流转，状态不透明
- 审批链条长，节点推进依赖人工催办
- 负责人和成员之间责任边界不清
- 业务变化快，流程配置不够灵活
- 反馈、附件、日志分散，难以沉淀执行结果

NovaOffice OA 的目标，就是把这些零散动作整合成统一平台，让流程可定义、任务可追踪、责任可落地、数据可沉淀。

## 产品亮点

### 智能流程审批

支持多节点流程审批，围绕业务节点组织任务推进路径，让审批逻辑更标准、进度更直观。

### 跨部门任务协同

从任务发起、双负责人审核、部门指派到成员反馈，形成清晰的跨部门协作链路。

### 多角色权限治理

支持管理员、部门负责人、部门成员等多角色协作，按角色和组织边界划分可见范围与操作权限。

### 可视化流程设计

提供流程设计器，可配置节点、连线、状态和执行逻辑，降低流程调整成本，提升业务响应速度。

### 数据可视化与闭环追踪

通过任务、审批、组织与执行数据的汇总展示，让管理层和业务团队可以更快掌握执行情况与协同效率。

## 适用场景

- 企业内部流程审批
- 跨部门任务协同
- 部门负责人派工与成员执行
- 运营流程可视化管理
- 组织协同效率提升

## 核心能力矩阵

| 模块 | 能力说明 |
| --- | --- |
| 流程审批 | 支持发起、审核、驳回、指派、完成等流程节点 |
| 任务协同 | 支持跨部门任务发起、承接、处理与反馈 |
| 组织管理 | 支持部门树、负责人、成员管理 |
| 权限控制 | 支持按角色与部门边界控制操作权限 |
| 流程设计器 | 支持流程节点与状态流转的可视化定义 |
| 数据分析 | 支持任务、审批、执行数据的汇总查看 |
| 反馈闭环 | 支持成员反馈、附件回显、操作日志沉淀 |

## 项目架构概览

NovaOffice OA 当前提供两套运行模式：

### 本地联调模式

- 前端：Vue 3 + TypeScript + Vite
- 集成服务：Node.js `server.ts`
- 数据库：SQLite

适合前端联调、界面验证和单机预览。

### 生产交付模式

- 前端：`dist/` 静态资源
- 后端：Go 服务 `backend-go`
- 数据库：MySQL / MariaDB
- 反向代理：Nginx

适合 Linux 服务器交付和正式部署。

更完整的架构说明见：

- [系统说明文档](docs/系统说明文档.md)

## 项目目录

```text
.
├─ src/                     前端源码
├─ backend-go/              Go 生产后端
├─ deploy/linux/            Linux 部署文件
├─ docs/                    项目文档
├─ server.ts                本地联调服务
├─ database.ts              本地 SQLite 数据层
└─ README.md
```

## 交付与部署

仓库已提供完整的 Linux 生产部署文件：

- [deploy/linux/DEPLOY.md](deploy/linux/DEPLOY.md)
- [deploy/linux/mysql/novaoffice_oa.sql](deploy/linux/mysql/novaoffice_oa.sql)
- [deploy/linux/systemd/novaoffice-oa.service](deploy/linux/systemd/novaoffice-oa.service)
- [deploy/linux/nginx/novaoffice-oa.conf](deploy/linux/nginx/novaoffice-oa.conf)

当前推荐交付方案：

- 本机 MariaDB/mysql + Nginx + Go 二进制

该方案已经过真实服务器部署验收。

## 当前版本状态

当前版本已完成以下验证：

- 前端类型检查通过
- 前端生产构建通过
- Go 后端构建通过
- Linux 单机部署成功
- MySQL / MariaDB 连接通过
- 登录、审核、指派、反馈、附件回显链路验证通过

## 默认账号

- 管理员账号：`admin@novaoffice.com`
- 默认密码：`123456`

建议上线后立即修改默认密码。

## 补充说明

- 默认流程属于内置流程，不允许直接删除
- 用户如需定制流程，应先新建自己的流程后再进行编辑和管理
- 生产交付以 `backend-go + MySQL / MariaDB` 为准
