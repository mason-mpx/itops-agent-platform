# API 文档

本文档详细描述了企业IT运维多Agent自动化平台的所有API接口。

## 基础信息

- **Base URL**: `http://localhost:3001`
- **认证方式**: JWT Bearer Token
- **数据格式**: JSON

## 认证

### 登录
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### 使用Token
在后续请求的Header中添加：
```
Authorization: Bearer <your_token>
```

## 服务器管理

### 获取服务器列表
```http
GET /api/servers
Authorization: Bearer <token>
```

### 获取单个服务器
```http
GET /api/servers/:id
Authorization: Bearer <token>
```

### 创建服务器
```http
POST /api/servers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "生产服务器",
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "authType": "password",
  "password": "your_password",
  "description": "生产环境服务器",
  "tags": "生产,Web"
}
```

### 更新服务器
```http
PUT /api/servers/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "更新后的名称",
  "description": "新的描述"
}
```

### 删除服务器
```http
DELETE /api/servers/:id
Authorization: Bearer <token>
```

### 测试服务器连接
```http
POST /api/servers/:id/test
Authorization: Bearer <token>
```

### 执行命令
```http
POST /api/servers/:id/exec
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "df -h"
}
```

### 获取命令历史
```http
GET /api/servers/:id/command-history
Authorization: Bearer <token>
```

### 执行合规检查
```http
POST /api/servers/:id/compliance
Authorization: Bearer <token>
```

### 获取合规检查历史
```http
GET /api/servers/:id/compliance-history
Authorization: Bearer <token>
```

## Agent管理

### 获取Agent列表
```http
GET /api/agents
Authorization: Bearer <token>
```

### 获取单个Agent
```http
GET /api/agents/:id
Authorization: Bearer <token>
```

### 创建Agent
```http
POST /api/agents
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "自定义Agent",
  "emoji": "🤖",
  "description": "Agent描述",
  "systemPrompt": "系统提示词",
  "config": {}
}
```

### 更新Agent
```http
PUT /api/agents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "更新后的名称",
  "description": "新的描述"
}
```

### 删除Agent
```http
DELETE /api/agents/:id
Authorization: Bearer <token>
```

## 工作流管理

### 获取工作流列表
```http
GET /api/workflows
Authorization: Bearer <token>
```

### 获取单个工作流
```http
GET /api/workflows/:id
Authorization: Bearer <token>
```

### 创建工作流
```http
POST /api/workflows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "自定义工作流",
  "description": "工作流描述",
  "nodes": [],
  "edges": []
}
```

### 更新工作流
```http
PUT /api/workflows/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "更新后的名称",
  "nodes": [],
  "edges": []
}
```

### 删除工作流
```http
DELETE /api/workflows/:id
Authorization: Bearer <token>
```

## 任务执行

### 获取任务列表
```http
GET /api/tasks
Authorization: Bearer <token>
```

### 获取任务详情
```http
GET /api/tasks/:id
Authorization: Bearer <token>
```

### 创建并启动任务
```http
POST /api/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflowId": 1,
  "context": {
    "serverId": 1
  }
}
```

### 暂停任务
```http
PUT /api/tasks/:id/pause
Authorization: Bearer <token>
```

### 继续任务
```http
PUT /api/tasks/:id/resume
Authorization: Bearer <token>
```

### 取消任务
```http
PUT /api/tasks/:id/cancel
Authorization: Bearer <token>
```

## 告警管理

### 获取告警列表
```http
GET /api/alerts
Authorization: Bearer <token>

# 查询参数
?source=zabbix
&severity=critical
&status=open
```

### 创建告警
```http
POST /api/alerts
Authorization: Bearer <token>
Content-Type: application/json

{
  "source": "manual",
  "severity": "medium",
  "title": "告警标题",
  "content": "告警详细内容"
}
```

### 确认告警
```http
PUT /api/alerts/:id/acknowledge
Authorization: Bearer <token>
```

### 解决告警
```http
PUT /api/alerts/:id/resolve
Authorization: Bearer <token>
```

## 告警自动处理

### 获取映射列表
```http
GET /api/alert-mappings
Authorization: Bearer <token>
```

### 创建映射
```http
POST /api/alert-mappings
Authorization: Bearer <token>
Content-Type: application/json

{
  "source": "zabbix",
  "severity": "critical",
  "titlePattern": "CPU",
  "workflowId": 1,
  "enabled": true
}
```

### 更新映射
```http
PUT /api/alert-mappings/:id
Authorization: Bearer <token>
```

### 删除映射
```http
DELETE /api/alert-mappings/:id
Authorization: Bearer <token>
```

## 告警降噪

### 获取降噪规则
```http
GET /api/alert-noise
Authorization: Bearer <token>
```

### 创建降噪规则
```http
POST /api/alert-noise
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "规则名称",
  "type": "merge",
  "config": {}
}
```

## 根因分析

### 分析告警根因
```http
POST /api/root-cause-analysis
Authorization: Bearer <token>
Content-Type: application/json

{
  "alertId": 1
}
```

### 获取分析历史
```http
GET /api/root-cause-analysis/:alertId
Authorization: Bearer <token>
```

## 脚本管理

### 获取脚本列表
```http
GET /api/scripts
Authorization: Bearer <token>
```

### 创建脚本
```http
POST /api/scripts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "脚本名称",
  "content": "#!/bin/bash\necho hello",
  "description": "描述",
  "category": "系统监控"
}
```

### 执行脚本
```http
POST /api/scripts/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "serverId": 1,
  "params": {}
}
```

## 定时任务

### 获取定时任务列表
```http
GET /api/scheduled-tasks
Authorization: Bearer <token>
```

### 创建定时任务
```http
POST /api/scheduled-tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "任务名称",
  "description": "描述",
  "cronExpression": "0 0 * * *",
  "workflowId": 1,
  "enabled": true
}
```

### 立即执行定时任务
```http
POST /api/scheduled-tasks/:id/trigger
Authorization: Bearer <token>
```

## 报告系统

### 生成报告
```http
POST /api/reports/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "templateId": 1,
  "variables": {}
}
```

### 获取报告Markdown
```http
GET /api/reports/:taskId/markdown
Authorization: Bearer <token>
```

## 知识库

### 获取知识列表
```http
GET /api/knowledge
Authorization: Bearer <token>
```

### 搜索知识
```http
GET /api/knowledge/search?q=关键词
Authorization: Bearer <token>
```

### 创建知识条目
```http
POST /api/knowledge
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "标题",
  "content": "内容",
  "category": "分类",
  "tags": "标签"
}
```

## 审计日志

### 获取审计日志
```http
GET /api/audit-logs
Authorization: Bearer <token>

# 查询参数
?userId=1
&action=create
&startDate=2024-01-01
&endDate=2024-12-31
```

## 通知系统

### 获取通知列表
```http
GET /api/notifications
Authorization: Bearer <token>
```

### 标记为已读
```http
PUT /api/notifications/:id/read
Authorization: Bearer <token>
```

### 通知配置
```http
GET /api/notification-configs
POST /api/notification-configs
PUT /api/notification-configs/:id
DELETE /api/notification-configs/:id
```

## 用户管理

### 获取用户列表
```http
GET /api/users
Authorization: Bearer <token>
```

### 创建用户
```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123",
  "role": "operator"
}
```

### 更新用户
```http
PUT /api/users/:id
Authorization: Bearer <token>
```

### 删除用户
```http
DELETE /api/users/:id
Authorization: Bearer <token>
```

## 系统设置

### 获取设置
```http
GET /api/settings
Authorization: Bearer <token>
```

### 更新设置
```http
PUT /api/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "doubanApiKey": "your_key",
  "openaiApiKey": "your_key"
}
```

## Webhook

### Prometheus Alertmanager
```http
POST /api/webhooks/prometheus
Content-Type: application/json

{
  "alerts": [...]
}
```

### Zabbix
```http
POST /api/webhooks/zabbix
Content-Type: application/json

{
  "trigger": "告警名称",
  "host": "主机名",
  "severity": "high"
}
```

### 通用Webhook
```http
POST /api/webhooks/generic
Content-Type: application/json

{
  "source": "your-system",
  "severity": "medium",
  "title": "标题",
  "content": "内容"
}
```

## Copilot

### 发送消息
```http
POST /api/copilot/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "帮我检查服务器状态"
}
```

## 仪表盘

### 获取仪表盘数据
```http
GET /api/dashboard
Authorization: Bearer <token>
```

### 获取告警趋势
```http
GET /api/dashboard/alert-trends
Authorization: Bearer <token>

# 查询参数
?days=7
```

### 获取任务统计
```http
GET /api/dashboard/task-stats
Authorization: Bearer <token>
```

## 服务器分组管理

### 获取分组列表
```http
GET /api/server-groups
Authorization: Bearer <token>
```

### 创建分组
```http
POST /api/server-groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "生产环境",
  "description": "生产环境服务器",
  "parentId": null,
  "sortOrder": 1
}
```

### 更新分组
```http
PUT /api/server-groups/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "更新后的名称",
  "description": "新描述"
}
```

### 删除分组
```http
DELETE /api/server-groups/:id
Authorization: Bearer <token>
```

### 获取分组下的服务器
```http
GET /api/server-groups/:id/servers
Authorization: Bearer <token>
```

### 添加服务器到分组
```http
POST /api/server-groups/:id/servers
Authorization: Bearer <token>
Content-Type: application/json

{
  "serverId": "server-uuid"
}
```

### 从分组移除服务器
```http
DELETE /api/server-groups/:id/servers/:serverId
Authorization: Bearer <token>
```

## 多 Agent 协作

### 创建多 Agent 任务
```http
POST /api/multi-agent
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentIds": ["agent-1", "agent-2"],
  "task": "任务描述",
  "collaborationMode": "sequential"
}
```

### 获取多 Agent 任务状态
```http
GET /api/multi-agent/:id
Authorization: Bearer <token>
```

## 健康检查

```http
GET /health
```

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## WebSocket事件

### 客户端 → 服务端
- `task:subscribe` - 订阅任务执行
- `task:unsubscribe` - 取消订阅
- `alert:subscribe` - 订阅告警

### 服务端 → 客户端
- `task:started`
- `task:node:started`
- `task:node:thinking`
- `task:node:output`
- `task:node:completed`
- `task:completed`
- `task:failed`
- `alert:new`
- `alert:updated`
- `notification:new`

## 错误响应

所有API在出错时返回统一格式：

```json
{
  "success": false,
  "error": "错误信息",
  "code": "ERROR_CODE"
}
```

HTTP状态码：
- 200: 成功
- 400: 请求参数错误
- 401: 未认证
- 403: 无权限
- 404: 资源不存在
- 500: 服务器内部错误
