import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../utils/env';
import { logger } from '../utils/logger';
import { runMigrations } from './migrations';
import { initializePresetAgents } from './presets/initAgents';
import { initializePresetWorkflows } from './presets/initWorkflows';
import { initializePresetReportTemplates } from './presets/initReports';
import { initializePresetKnowledge } from './presets/initKnowledge';
import { initializePresetScripts } from './presets/initScripts';
import { initializeAlertMappings } from './presets/initAlertMappings';
import { initializePresetScheduledTasks } from './presets/initScheduledTasks';
import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setIOInstance(io: SocketIOServer) {
  ioInstance = io;
}

export function getIOInstance() {
  return ioInstance;
}

const DB_PATH = env.DATABASE_PATH;
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: Database.Database = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
export { db };

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_blacklist (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id TEXT,
      reason TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token);
    CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      password TEXT,
      private_key TEXT,
      use_ssh_key INTEGER DEFAULT 0,
      description TEXT,
      tags TEXT,
      enabled INTEGER DEFAULT 1,
      last_connected DATETIME,
      os TEXT,
      cpu_cores INTEGER,
      memory_gb REAL,
      disk_gb REAL,
      ip_address TEXT,
      private_ip TEXT,
      cloud_provider TEXT,
      cloud_instance_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(enabled);

    CREATE TABLE IF NOT EXISTS server_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES server_groups(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_server_groups_parent ON server_groups(parent_id);

    CREATE TABLE IF NOT EXISTS server_group_mapping (
      server_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      PRIMARY KEY (server_id, group_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES server_groups(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_server_group_mapping_server ON server_group_mapping(server_id);
    CREATE INDEX IF NOT EXISTS idx_server_group_mapping_group ON server_group_mapping(group_id);

    CREATE TABLE IF NOT EXISTS server_command_history (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      command TEXT NOT NULL,
      stdout TEXT,
      stderr TEXT,
      success INTEGER DEFAULT 0,
      execution_time_ms INTEGER,
      executed_by TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cmd_history_server_id ON server_command_history(server_id);
    CREATE INDEX IF NOT EXISTS idx_cmd_history_executed_at ON server_command_history(executed_at);

    CREATE TABLE IF NOT EXISTS compliance_checks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      check_name TEXT NOT NULL,
      check_results TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_compliance_server_id ON compliance_checks(server_id);
    CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_checks(status);
    CREATE INDEX IF NOT EXISTS idx_compliance_created_at ON compliance_checks(created_at);

    CREATE TABLE IF NOT EXISTS encryption_keys (
      id TEXT PRIMARY KEY,
      key_type TEXT NOT NULL,
      key_value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_encryption_active ON encryption_keys(active);

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      role TEXT,
      system_prompt TEXT,
      model TEXT DEFAULT 'doubao-4o',
      temperature REAL DEFAULT 0.7,
      enabled INTEGER DEFAULT 1,
      is_preset INTEGER DEFAULT 0,
      category TEXT,
      tags TEXT,
      description TEXT,
      usage_count INTEGER DEFAULT 0,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_executions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      input_text TEXT,
      output_text TEXT,
      status TEXT,
      error_message TEXT,
      execution_time_ms INTEGER,
      token_count INTEGER,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at ON agent_executions(created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(status);

    CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
    CREATE INDEX IF NOT EXISTS idx_agents_usage ON agents(usage_count);

    CREATE INDEX IF NOT EXISTS idx_agents_is_preset ON agents(is_preset);
    CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT,
      edges TEXT,
      agent_configs TEXT,
      is_template INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workflows_is_template ON workflows(is_template);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workflow_id TEXT,
      name TEXT,
      status TEXT DEFAULT 'pending',
      start_time DATETIME,
      end_time DATETIME,
      current_node_id TEXT,
      node_results TEXT,
      logs TEXT,
      context TEXT,
      metrics TEXT,
      execution_order TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      metadata TEXT,
      related_task_id TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      content TEXT NOT NULL,
      tags TEXT,
      solutions TEXT,
      related_alerts TEXT,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
    CREATE INDEX IF NOT EXISTS idx_kb_usage ON knowledge_base(usage_count);

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'bash',
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS report_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'inspection',
      content TEXT NOT NULL,
      variables TEXT,
      is_preset INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS generated_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'inspection',
      content TEXT NOT NULL,
      format TEXT DEFAULT 'markdown',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      format TEXT DEFAULT 'markdown',
      task_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_reports_task_id ON reports(task_id);

    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template_id TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      recipients TEXT,
      format TEXT DEFAULT 'markdown',
      last_generated DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      workflow_id TEXT NOT NULL,
      schedule TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_run DATETIME,
      next_run DATETIME,
      context TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_enabled ON scheduled_tasks(enabled);

    CREATE TABLE IF NOT EXISTS alert_workflow_mappings (
      id TEXT PRIMARY KEY,
      alert_source TEXT,
      alert_severity TEXT,
      alert_title_pattern TEXT,
      workflow_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_alert_mapping_enabled ON alert_workflow_mappings(enabled);

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      status TEXT DEFAULT 'unread',
      recipient TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

    CREATE TABLE IF NOT EXISTS notification_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_enabled INTEGER DEFAULT 1,
      webhook_url TEXT,
      email_enabled INTEGER DEFAULT 0,
      email_config TEXT,
      wechat_enabled INTEGER DEFAULT 0,
      wechat_config TEXT,
      dingtalk_enabled INTEGER DEFAULT 0,
      dingtalk_config TEXT,
      alert_notification TEXT,
      task_notification TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS root_cause_analyses (
      id TEXT PRIMARY KEY,
      alert_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      root_cause TEXT,
      symptoms TEXT,
      timeline TEXT,
      evidence TEXT,
      recommendations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (alert_id) REFERENCES alerts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rca_alert_id ON root_cause_analyses(alert_id);
    CREATE INDEX IF NOT EXISTS idx_rca_status ON root_cause_analyses(status);
    CREATE INDEX IF NOT EXISTS idx_rca_created ON root_cause_analyses(created_at);
    
    CREATE TABLE IF NOT EXISTS copilot_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_copilot_user_id ON copilot_conversations(user_id);
  `);

  runMigrations();

  const groupCount = db.prepare('SELECT COUNT(*) as count FROM server_groups').get() as { count: number };
  if (groupCount.count === 0) {
    const insertGroup = db.prepare(`
      INSERT INTO server_groups (id, name, description, parent_id, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const defaultGroup = randomUUID();
    const prodGroup = randomUUID();
    const devGroup = randomUUID();
    const testGroup = randomUUID();
    
    insertGroup.run(defaultGroup, '全部服务器', '所有服务器的根分组', null, 0);
    insertGroup.run(prodGroup, '生产环境', '生产环境服务器', defaultGroup, 1);
    insertGroup.run(devGroup, '开发环境', '开发环境服务器', defaultGroup, 2);
    insertGroup.run(testGroup, '测试环境', '测试环境服务器', defaultGroup, 3);
    
    logger.info('✅ 成功创建默认服务器分组');
  }

  const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (usersCount.count === 0) {
    initializeDefaultUsers();
  }

  logger.info('🔄 Initializing preset templates (always included)');
  
  const presetCount = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_preset = 1').get() as { count: number };
  if (presetCount.count === 0) {
    initializePresetAgents();
  }
  
  logger.info('🔄 Updating preset agent model configurations...');
  
  let configuredModel: string | null = null;
  try {
    const doubaoKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY') as { value: string } | undefined;
    const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL') as { value: string } | undefined;
    
    if (doubaoKeyResult && doubaoKeyResult.value && doubaoKeyResult.value !== 'your-doubao-api-key-here') {
      if (doubaoModelResult && doubaoModelResult.value) {
        configuredModel = doubaoModelResult.value;
      } else {
        configuredModel = 'doubao-4o';
      }
    } else {
      const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY') as { value: string } | undefined;
      const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL') as { value: string } | undefined;
      
      if (openaiKeyResult && openaiKeyResult.value && openaiKeyResult.value !== 'your-openai-api-key-here') {
        if (openaiModelResult && openaiModelResult.value) {
          configuredModel = openaiModelResult.value;
        } else {
          configuredModel = 'gpt-4o';
        }
      }
    }
  } catch (error: unknown) {
    logger.info('Error checking configured model, skipping preset agent update:', error);
  }
  
  if (configuredModel) {
    const updateStmt = db.prepare(`
      UPDATE agents 
      SET model = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE is_preset = 1
    `);
    const result = updateStmt.run(configuredModel);
    logger.info(`✅ Updated ${result.changes} preset agents with model: ${configuredModel}`);
  } else {
    const updateStmt = db.prepare(`
      UPDATE agents 
      SET model = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE is_preset = 1
    `);
    const result = updateStmt.run();
    logger.info(`✅ Cleared model from ${result.changes} preset agents (no API keys configured)`);
  }

  const workflowCount = db.prepare('SELECT COUNT(*) as count FROM workflows WHERE is_template = 1').get() as { count: number };
  if (workflowCount.count === 0) {
    initializePresetWorkflows();
  }

  const reportTemplatesCount = db.prepare('SELECT COUNT(*) as count FROM report_templates WHERE is_preset = 1').get() as { count: number };
  if (reportTemplatesCount.count === 0) {
    initializePresetReportTemplates();
  }

  logger.info('🔄 Initializing preset configurations');
  
  const knowledgeCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_base').get() as { count: number };
  if (knowledgeCount.count === 0) {
    initializePresetKnowledge();
  }

  const scriptsCount = db.prepare('SELECT COUNT(*) as count FROM scripts').get() as { count: number };
  if (scriptsCount.count === 0) {
    initializePresetScripts();
  }

  const mappingsCount = db.prepare('SELECT COUNT(*) as count FROM alert_workflow_mappings').get() as { count: number };
  if (mappingsCount.count === 0) {
    initializeAlertMappings();
  }

  const scheduledTasksCount = db.prepare('SELECT COUNT(*) as count FROM scheduled_tasks').get() as { count: number };
  if (scheduledTasksCount.count === 0) {
    initializePresetScheduledTasks();
  }

  logger.info('✅ Database initialized successfully with preset configurations');
}

function initializeDefaultUsers() {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, password, email, role, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', hashedPassword, 'admin@example.com', 'admin', 1);
  logger.info('✅ 默认用户创建成功: admin');
}

// 告警数据通过Webhook或API接口从监控系统接收，不再提供模拟数据
