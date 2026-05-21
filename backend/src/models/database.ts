import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../utils/env';
import { logger } from '../utils/logger';

let ioInstance: any = null;

export function setIOInstance(io: any) {
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

const db = new Database(DB_PATH) as any;
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(enabled);

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

  // 数据库迁移：为 tasks 表添加 context 字段（如果不存在）
  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    const hasContextColumn = columns.some(col => col.name === 'context');
    if (!hasContextColumn) {
      logger.info('🔄 Migrating: adding context column to tasks table');
      db.prepare('ALTER TABLE tasks ADD COLUMN context TEXT').run();
      logger.info('✅ Migration complete: context column added');
    }
  } catch (e) {
    logger.info('ℹ️ Context column migration skipped:', (e as Error).message);
  }

  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    const hasExecutionOrderColumn = columns.some(col => col.name === 'execution_order');
    if (!hasExecutionOrderColumn) {
      logger.info('🔄 Migrating: adding execution_order column to tasks table');
      db.prepare('ALTER TABLE tasks ADD COLUMN execution_order TEXT').run();
      logger.info('✅ Migration complete: execution_order column added');
    }
  } catch (e) {
    logger.info('ℹ️ Execution_order column migration skipped:', (e as Error).message);
  }

  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    const hasReportIdColumn = columns.some(col => col.name === 'report_id');
    if (!hasReportIdColumn) {
      logger.info('🔄 Migrating: adding report_id column to tasks table');
      db.prepare('ALTER TABLE tasks ADD COLUMN report_id TEXT').run();
      logger.info('✅ Migration complete: report_id column added');
    }
  } catch (e) {
    logger.info('ℹ️ Report_id column migration skipped:', (e as Error).message);
  }

  // 数据库迁移：为agents表添加新字段
  try {
    logger.info('🔄 Checking agent table columns...');
    const columns = db.prepare("PRAGMA table_info(agents)").all() as any[];
    const existingColumns = new Set(columns.map(col => col.name));
    
    const newColumns = [
      { name: 'category', type: 'TEXT' },
      { name: 'tags', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
      { name: 'usage_count', type: 'INTEGER DEFAULT 0' },
      { name: 'last_used_at', type: 'DATETIME' }
    ];
    
    for (const col of newColumns) {
      if (!existingColumns.has(col.name)) {
        logger.info(`🔄 Adding column: ${col.name}`);
        try {
          db.prepare(`ALTER TABLE agents ADD COLUMN ${col.name} ${col.type}`).run();
        } catch (e) {
          logger.info(`ℹ️ Column ${col.name} may already exist, skipping`);
        }
      }
    }
    
    // 创建agent_executions表（如果不存在）
    db.prepare(`
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
      )
    `).run();
    
    // 创建索引（如果不存在）
    try {
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions(agent_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at ON agent_executions(created_at)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(status)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agents_usage ON agents(usage_count)').run();
    } catch (e) {
      logger.info('ℹ️ Index may already exist, skipping');
    }
    
    logger.info('✅ Agent table migration complete');
  } catch (e) {
    logger.info('⚠️ Migration may have already run, continuing:', (e as Error).message);
  }

  // 初始化默认用户（始终需要，这是基本功能）
  const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

  if (usersCount.count === 0) {
    initializeDefaultUsers();
  }

  logger.info('🔄 Initializing preset templates (always included)');
  
  // 初始化预设 Agent
  const presetCount = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_preset = 1').get() as { count: number };
  if (presetCount.count === 0) {
    initializePresetAgents();
  }
  
  // 【重要】每次启动都更新预设Agent的模型配置，确保用户配置了API密钥后，预设Agent能自动使用！
  // 这样即使用户之前已经创建了数据库，添加API密钥后，刷新页面预设Agent也会正确显示。
  logger.info('🔄 Updating preset agent model configurations...');
  
  // 获取用户当前配置的模型
  let configuredModel = null;
  try {
    // 优先检查豆包模型（如果已配置API密钥，且不是占位符）
    const doubaoKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY');
    const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL');
    
    logger.info('🔍 DB_INIT DEBUG - doubaoApiKey configured:', !!doubaoKeyResult && (doubaoKeyResult as any).value !== 'your-doubao-api-key-here');
    logger.info('🔍 DB_INIT DEBUG - doubaoModel from DB:', doubaoModelResult ? (doubaoModelResult as any).value : 'null');
    
    if (doubaoKeyResult && (doubaoKeyResult as any).value && (doubaoKeyResult as any).value !== 'your-doubao-api-key-here') {
      if (doubaoModelResult && (doubaoModelResult as any).value) {
        configuredModel = (doubaoModelResult as any).value;
      } else {
        configuredModel = 'doubao-4o'; // 如果密钥已配置但没有模型，用默认豆包模型
      }
    } else {
      // 如果豆包没有配置，检查OpenAI（且不是占位符）
      const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY');
      const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL');
      
      logger.info('🔍 DB_INIT DEBUG - openaiApiKey configured:', !!openaiKeyResult && (openaiKeyResult as any).value !== 'your-openai-api-key-here');
      logger.info('🔍 DB_INIT DEBUG - openaiModel from DB:', openaiModelResult ? (openaiModelResult as any).value : 'null');
      
      if (openaiKeyResult && (openaiKeyResult as any).value && (openaiKeyResult as any).value !== 'your-openai-api-key-here') {
        if (openaiModelResult && (openaiModelResult as any).value) {
          configuredModel = (openaiModelResult as any).value;
        } else {
          configuredModel = 'gpt-4o'; // 如果密钥已配置但没有模型，用默认OpenAI模型
        }
      }
    }
  } catch (error) {
    logger.info('Error checking configured model, skipping preset agent update:', error);
  }
  
  logger.info('🔍 DB_INIT DEBUG - Final configuredModel:', configuredModel);
  
  // 更新所有预设Agent的模型配置
  if (configuredModel) {
    const updateStmt = db.prepare(`
      UPDATE agents 
      SET model = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE is_preset = 1
    `);
    const result = updateStmt.run(configuredModel);
    logger.info(`✅ Updated ${(result as any).changes} preset agents with model: ${configuredModel}`);
  } else {
    // 如果没有配置模型，清空所有预设Agent的model字段
    const updateStmt = db.prepare(`
      UPDATE agents 
      SET model = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE is_preset = 1
    `);
    const result = updateStmt.run();
    logger.info(`✅ Cleared model from ${(result as any).changes} preset agents (no API keys configured)`);
  }

  // 初始化预设工作流
  const workflowCount = db.prepare('SELECT COUNT(*) as count FROM workflows WHERE is_template = 1').get() as { count: number };
  if (workflowCount.count === 0) {
    initializePresetWorkflows();
  }

  // 初始化预设报告模板
  const reportTemplatesCount = db.prepare('SELECT COUNT(*) as count FROM report_templates WHERE is_preset = 1').get() as { count: number };
  if (reportTemplatesCount.count === 0) {
    initializePresetReportTemplates();
  }

  // 初始化预设配置（知识库、脚本、告警映射、定时任务）
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

function initializePresetAgents() {
  // 首先检查用户是否已经配置了AI模型
  // 辅助函数：获取用户配置的模型
  function getUserConfiguredModel() {
    try {
      // 优先检查豆包模型（如果已配置API密钥，且不是占位符）
      const doubaoKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY');
      if (doubaoKeyResult && (doubaoKeyResult as any).value && (doubaoKeyResult as any).value !== 'your-doubao-api-key-here') {
        const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL');
        if (doubaoModelResult && (doubaoModelResult as any).value) {
          return (doubaoModelResult as any).value;
        }
        return 'doubao-4o';
      }
      // 如果豆包没有配置，检查OpenAI（且不是占位符）
      const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY');
      if (openaiKeyResult && (openaiKeyResult as any).value && (openaiKeyResult as any).value !== 'your-openai-api-key-here') {
        const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL');
        if (openaiModelResult && (openaiModelResult as any).value) {
          return (openaiModelResult as any).value;
        }
        // 如果OpenAI密钥已配置但没有模型，返回默认OpenAI模型
        return 'gpt-4o';
      }
    } catch (error) {
      logger.info('检查用户配置的模型时出错，不设置默认模型');
    }
    // 如果没有配置任何API密钥，返回null
    return null;
  }

  const configuredModel = getUserConfiguredModel();
  logger.info(`📝 预设Agent将使用模型: ${configuredModel || '（未配置，留空）'}`);

  const presetAgents = [
    {
      id: randomUUID(),
      name: '告警处理 Agent',
      avatar: '🚨',
      role: '告警分析与处理专家',
      category: '告警处理',
      description: '负责分析告警信息，评估严重程度，并提供处理建议',
      system_prompt: '你是一个专业的告警处理专家。你的任务是分析告警信息，评估严重程度，并提供具体的处理建议。你的回答应该包括：1. 告警摘要 2. 严重程度评估 3. 可能的原因 4. 处理建议 5. 后续步骤。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '故障诊断 Agent',
      avatar: '🔍',
      role: '故障诊断专家',
      category: '故障诊断',
      description: '分析系统故障，识别根因，并提供解决方案',
      system_prompt: '你是一个专业的故障诊断专家。你的任务是分析系统故障症状，识别可能的根因，并提供详细的排查步骤和解决方案。你的回答应该包括：1. 症状分析 2. 可能的原因 3. 排查步骤 4. 建议的解决方案。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '日志分析 Agent',
      avatar: '📝',
      role: '日志分析专家',
      category: '日志分析',
      description: '分析系统和应用日志，识别错误模式和异常事件',
      system_prompt: '你是一个专业的日志分析专家。你的任务是分析系统和应用日志，识别错误模式、异常事件和性能问题。你的回答应该包括：1. 日志摘要 2. 发现的问题 3. 错误模式 4. 建议的后续分析步骤。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '系统巡检 Agent',
      avatar: '🔎',
      role: '系统健康检查专家',
      category: '系统巡检',
      description: '执行系统健康检查，评估各项指标状态',
      system_prompt: '你是一个专业的系统巡检专家。你的任务是分析系统各项指标，评估整体健康状态，并提供优化建议。你的回答应该包括：1. 资源使用情况 2. 服务状态 3. 发现的问题 4. 优化建议。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '变更执行 Agent',
      avatar: '⚙️',
      role: '变更执行专家',
      category: '变更执行',
      description: '执行系统变更操作，验证操作结果',
      system_prompt: '你是一个专业的变更执行专家。你的任务是执行系统变更操作，并验证操作结果。你的回答应该包括：1. 操作摘要 2. 执行结果 3. 验证结果 4. 回滚方案（如果需要）。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '文档生成 Agent',
      avatar: '📄',
      role: '文档生成专家',
      category: '文档生成',
      description: '根据任务执行结果，生成结构化的运维报告',
      system_prompt: '你是一个专业的文档生成专家。你的任务是根据任务执行结果，生成结构化的运维报告。报告应该包括：1. 执行摘要 2. 详细结果 3. 发现的问题 4. 建议措施。请用中文回答，使用 Markdown 格式。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '合规检查 Agent',
      avatar: '🛡️',
      role: '合规检查专家',
      category: '合规检查',
      description: '验证系统配置是否符合安全基线和合规要求',
      system_prompt: '你是一个专业的合规检查专家。你的任务是验证系统配置是否符合安全基线和合规要求。你的回答应该包括：1. 检查范围 2. 合规情况 3. 不符合项 4. 修复建议。请用中文回答，使用清晰的结构。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '服务器命令执行 Agent',
      avatar: '💻',
      role: '服务器操作专家',
      category: '服务器操作',
      description: '在目标服务器上执行命令并返回结果',
      system_prompt: '你是一个专业的服务器操作专家。你的任务是在目标服务器上执行命令，并分析结果。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    },
    {
      id: randomUUID(),
      name: '自动巡检 Agent',
      avatar: '🤖',
      role: '自动巡检专家',
      category: '系统巡检',
      description: '对多台服务器执行自动化巡检任务',
      system_prompt: '你是一个专业的自动巡检专家。你的任务是对多台服务器执行自动化巡检任务，并生成巡检报告。',
      model: configuredModel,
      temperature: 0.7,
      is_preset: 1,
      enabled: 1
    }
  ];

  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, avatar, role, system_prompt, model, temperature, is_preset, enabled, category, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  presetAgents.forEach(agent => {
    insertAgent.run(agent.id, agent.name, agent.avatar, agent.role, agent.system_prompt, agent.model, agent.temperature, agent.is_preset, agent.enabled, agent.category, agent.description);
  });

  logger.info(`✅ 成功创建 ${presetAgents.length} 个预设 Agent`);
}

function initializePresetWorkflows() {
  // 获取预设 agents 的 ID
  const alertAgent = db.prepare("SELECT id FROM agents WHERE name = '告警处理 Agent'").get() as any;
  const diagnosticAgent = db.prepare("SELECT id FROM agents WHERE name = '故障诊断 Agent'").get() as any;
  const logAgent = db.prepare("SELECT id FROM agents WHERE name = '日志分析 Agent'").get() as any;
  const systemCheckAgent = db.prepare("SELECT id FROM agents WHERE name = '系统巡检 Agent'").get() as any;
  const changeAgent = db.prepare("SELECT id FROM agents WHERE name = '变更执行 Agent'").get() as any;
  const docAgent = db.prepare("SELECT id FROM agents WHERE name = '文档生成 Agent'").get() as any;
  const complianceAgent = db.prepare("SELECT id FROM agents WHERE name = '合规检查 Agent'").get() as any;
  const commandAgent = db.prepare("SELECT id FROM agents WHERE name = '服务器命令执行 Agent'").get() as any;

  // 1. 日常健康检查工作流
  const healthNode1 = randomUUID();
  const healthNode2 = randomUUID();
  const healthNode3 = randomUUID();
  
  const dailyHealthCheckNodes = JSON.stringify([
    { id: healthNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '系统巡检 Agent', agentId: systemCheckAgent?.id || null, avatar: '🔎' } },
    { id: healthNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: healthNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const dailyHealthCheckEdges = JSON.stringify([
    { id: randomUUID(), source: healthNode1, target: healthNode2 },
    { id: randomUUID(), source: healthNode2, target: healthNode3 }
  ]);

  // 2. 告警处理工作流
  const alertNode1 = randomUUID();
  const alertNode2 = randomUUID();
  const alertNode3 = randomUUID();
  
  const alertHandlingNodes = JSON.stringify([
    { id: alertNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '告警处理 Agent', agentId: alertAgent?.id || null, avatar: '🚨' } },
    { id: alertNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '日志分析 Agent', agentId: logAgent?.id || null, avatar: '📝' } },
    { id: alertNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const alertHandlingEdges = JSON.stringify([
    { id: randomUUID(), source: alertNode1, target: alertNode2 },
    { id: randomUUID(), source: alertNode2, target: alertNode3 }
  ]);

  // 3. 故障诊断工作流
  const diagNode1 = randomUUID();
  const diagNode2 = randomUUID();
  const diagNode3 = randomUUID();
  const diagNode4 = randomUUID();
  
  const diagnosticNodes = JSON.stringify([
    { id: diagNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '故障诊断 Agent', agentId: diagnosticAgent?.id || null, avatar: '🔍' } },
    { id: diagNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '日志分析 Agent', agentId: logAgent?.id || null, avatar: '📝' } },
    { id: diagNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: diagNode4, type: 'agent', position: { x: 1000, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const diagnosticEdges = JSON.stringify([
    { id: randomUUID(), source: diagNode1, target: diagNode2 },
    { id: randomUUID(), source: diagNode2, target: diagNode3 },
    { id: randomUUID(), source: diagNode3, target: diagNode4 }
  ]);

  // 4. 合规检查工作流
  const compNode1 = randomUUID();
  const compNode2 = randomUUID();
  const compNode3 = randomUUID();
  
  const complianceNodes = JSON.stringify([
    { id: compNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '合规检查 Agent', agentId: complianceAgent?.id || null, avatar: '🛡️' } },
    { id: compNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: compNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const complianceEdges = JSON.stringify([
    { id: randomUUID(), source: compNode1, target: compNode2 },
    { id: randomUUID(), source: compNode2, target: compNode3 }
  ]);

  // 5. 变更执行工作流
  const changeNode1 = randomUUID();
  const changeNode2 = randomUUID();
  const changeNode3 = randomUUID();
  
  const changeNodes = JSON.stringify([
    { id: changeNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '变更执行 Agent', agentId: changeAgent?.id || null, avatar: '⚙️' } },
    { id: changeNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: changeNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const changeEdges = JSON.stringify([
    { id: randomUUID(), source: changeNode1, target: changeNode2 },
    { id: randomUUID(), source: changeNode2, target: changeNode3 }
  ]);

  // 6. 日志分析工作流
  const logNode1 = randomUUID();
  const logNode2 = randomUUID();
  const logNode3 = randomUUID();
  
  const logAnalysisNodes = JSON.stringify([
    { id: logNode1, type: 'agent', position: { x: 100, y: 100 }, data: { label: '日志分析 Agent', agentId: logAgent?.id || null, avatar: '📝' } },
    { id: logNode2, type: 'agent', position: { x: 400, y: 100 }, data: { label: '服务器命令执行 Agent', agentId: commandAgent?.id || null, avatar: '💻' } },
    { id: logNode3, type: 'agent', position: { x: 700, y: 100 }, data: { label: '文档生成 Agent', agentId: docAgent?.id || null, avatar: '📄' } }
  ]);
  
  const logAnalysisEdges = JSON.stringify([
    { id: randomUUID(), source: logNode1, target: logNode2 },
    { id: randomUUID(), source: logNode2, target: logNode3 }
  ]);
  
  const presetWorkflows = [
    {
      id: randomUUID(),
      name: '日常健康检查',
      description: '对服务器进行日常健康检查，包括系统巡检、命令执行和报告生成',
      nodes: dailyHealthCheckNodes,
      edges: dailyHealthCheckEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '告警处理',
      description: '处理系统告警，分析告警信息，检查日志并生成处理报告',
      nodes: alertHandlingNodes,
      edges: alertHandlingEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '故障诊断',
      description: '对系统故障进行全面诊断，分析症状、检查日志、执行命令并生成诊断报告',
      nodes: diagnosticNodes,
      edges: diagnosticEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '合规检查',
      description: '验证服务器配置是否符合安全基线和合规要求，生成合规检查报告',
      nodes: complianceNodes,
      edges: complianceEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '变更执行',
      description: '执行系统变更操作，验证操作结果，生成变更执行报告',
      nodes: changeNodes,
      edges: changeEdges,
      is_template: 1
    },
    {
      id: randomUUID(),
      name: '日志分析',
      description: '分析系统和应用日志，识别错误模式和异常事件，生成分析报告',
      nodes: logAnalysisNodes,
      edges: logAnalysisEdges,
      is_template: 1
    }
  ];

  const insertWorkflow = db.prepare(`
    INSERT INTO workflows (id, name, description, nodes, edges, is_template)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  presetWorkflows.forEach(workflow => {
    insertWorkflow.run(workflow.id, workflow.name, workflow.description, workflow.nodes, workflow.edges, workflow.is_template);
  });

  logger.info(`✅ 成功创建 ${presetWorkflows.length} 个预设工作流`);
}

function initializePresetReportTemplates() {
  const presetTemplates = [
    {
      id: randomUUID(),
      name: '工作流执行报告',
      description: '工作流执行完成后自动生成的执行报告',
      type: 'inspection',
      content: '# 工作流执行报告\n\n## 基本信息\n- **工作流名称: {{workflow_name}}\n- **执行任务ID**: {{task_id}}\n- **执行状态: {{execution_status}}\n- **开始时间: {{start_time}}\n- **结束时间**: {{end_time}}\n\n## 执行顺序\n{{execution_order}}\n\n## 节点执行详情\n{{node_details}}\n\n## 执行总结\n{{execution_summary}}\n\n{{error_section}}\n\n---\n报告生成时间: {{generated_time}}',
      variables: JSON.stringify(['workflow_name', 'task_id', 'execution_status', 'start_time', 'end_time', 'execution_order', 'node_details', 'execution_summary', 'error_section', 'generated_time']),
      is_preset: 1
    },
    {
      id: randomUUID(),
      name: '系统巡检报告',
      description: '服务器系统巡检的详细报告',
      type: 'inspection',
      content: '# 系统巡检报告\n\n## 巡检时间\n{{inspection_time}}\n\n## 目标服务器\n{{server_list}}\n\n## 巡检结果摘要\n- **检查项目总数**: {{total_checks}}\n- **通过项目**: {{passed_checks}}\n- **失败项目**: {{failed_checks}}\n- **总体状态: {{overall_status}}\n\n## 详细检查结果\n{{detailed_results}}\n\n## 建议措施\n{{recommendations}}\n\n---\n报告生成时间: {{generated_time}}',
      variables: JSON.stringify(['inspection_time', 'server_list', 'total_checks', 'passed_checks', 'failed_checks', 'overall_status', 'detailed_results', 'recommendations', 'generated_time']),
      is_preset: 1
    }
  ];

  const insertTemplate = db.prepare(`
    INSERT INTO report_templates (id, name, description, type, content, variables, is_preset)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  presetTemplates.forEach(template => {
    insertTemplate.run(template.id, template.name, template.description, template.type, template.content, template.variables, template.is_preset);
  });

  logger.info(`✅ 成功创建 ${presetTemplates.length} 个预设报告模板`);
}

function initializePresetKnowledge() {
  const presetKnowledge = [
    {
      id: randomUUID(),
      title: 'Linux 系统健康检查指南',
      category: '运维指南',
      content: '# Linux 系统健康检查指南\n\n## 1. CPU 检查\n使用 `top` 或 `htop` 检查 CPU 使用率\n\n## 2. 内存检查\n使用 `free -h` 检查内存使用情况\n\n## 3. 磁盘检查\n使用 `df -h` 检查磁盘空间\n\n## 4. 网络检查\n使用 `netstat` 或 `ss` 检查网络连接',
      tags: JSON.stringify(['Linux', '系统检查', '运维']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '常见告警处理手册',
      category: '故障处理',
      content: '# 常见告警处理手册\n\n## CPU 使用率过高\n1. 检查进程占用\n2. 分析日志\n3. 考虑扩容\n\n## 内存告警\n1. 检查内存泄漏\n2. 调整 JVM 参数\n3. 增加内存\n\n## 磁盘空间告警\n1. 清理临时文件\n2. 清理旧日志\n3. 检查大文件',
      tags: JSON.stringify(['告警处理', '故障处理']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'SSH 密钥配置最佳实践',
      category: '安全配置',
      content: '# SSH 密钥配置最佳实践\n\n1. 使用 ed25519 密钥类型\n2. 设置强密码保护私钥\n3. 定期轮换密钥\n4. 使用 ssh-agent 管理密钥',
      tags: JSON.stringify(['SSH', '安全', '配置']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'MySQL 数据库性能优化',
      category: '数据库',
      content: '# MySQL 数据库性能优化\n\n## 1. 索引优化\n确保经常查询的字段有合适的索引\n\n## 2. 查询优化\n避免 SELECT *，只查询需要的字段\n\n## 3. 缓存策略\n合理使用 Redis 缓存热点数据\n\n## 4. 慢查询日志\n定期分析慢查询日志，优化性能瓶颈',
      tags: JSON.stringify(['MySQL', '数据库', '性能优化']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'Docker 容器化部署指南',
      category: '容器化',
      content: '# Docker 容器化部署指南\n\n## 1. 镜像管理\n使用官方基础镜像\n定期更新基础镜像\n\n## 2. 容器网络\n使用 Docker Compose 管理多容器应用\n\n## 3. 数据持久化\n使用 Volume 持久化数据\n\n## 4. 日志管理\n配置合适的日志驱动',
      tags: JSON.stringify(['Docker', '容器化', '部署']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '系统备份和恢复策略',
      category: '数据保护',
      content: '# 系统备份和恢复策略\n\n## 1. 定期备份\n设置每日自动备份\n保留最近 7 天的备份\n\n## 2. 异地备份\n重要数据需要异地备份\n\n## 3. 定期测试恢复\n定期测试备份的恢复功能\n\n## 4. 备份加密\n敏感数据备份需要加密',
      tags: JSON.stringify(['备份', '恢复', '数据保护']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '网络安全加固检查清单',
      category: '安全',
      content: '# 网络安全加固检查清单\n\n## 1. 防火墙配置\n只开放必要的端口\n\n## 2. SSH 安全\n禁用 root 登录\n使用密钥认证\n\n## 3. 系统更新\n定期更新系统安全补丁\n\n## 4. 日志审计\n定期检查系统和应用日志',
      tags: JSON.stringify(['安全', '加固', '检查清单']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '应用部署标准流程',
      category: '部署',
      content: '# 应用部署标准流程\n\n## 1. 部署前准备\n- 备份当前版本\n- 准备回滚方案\n- 通知相关人员\n\n## 2. 部署执行\n- 执行部署脚本\n- 监控应用状态\n- 检查关键功能\n\n## 3. 部署后验证\n- 功能测试\n- 性能检查\n- 日志监控\n\n## 4. 问题处理\n- 问题分类\n- 快速定位\n- 必要时回滚',
      tags: JSON.stringify(['部署', '流程', '标准']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'Nginx 配置优化指南',
      category: 'Web服务器',
      content: '# Nginx 配置优化指南\n\n## 1. 基本优化\n- worker_processes auto\n- worker_connections 65535\n- keepalive_timeout 65\n\n## 2. Gzip 压缩\n启用 gzip 压缩文本资源\n\n## 3. 缓存策略\n配置静态资源缓存\n\n## 4. 日志配置\n设置合适的日志格式和轮替',
      tags: JSON.stringify(['Nginx', 'Web服务器', '优化']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'Redis 性能调优实践',
      category: '缓存',
      content: '# Redis 性能调优实践\n\n## 1. 内存优化\n设置 maxmemory 限制\n选择合适的淘汰策略\n\n## 2. 持久化配置\n合理使用 RDB 和 AOF\n\n## 3. 集群模式\n数据量大时使用集群模式\n\n## 4. 监控指标\n关注内存使用、命中率、延迟',
      tags: JSON.stringify(['Redis', '缓存', '性能调优']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'Kubernetes 快速入门',
      category: '容器编排',
      content: '# Kubernetes 快速入门\n\n## 1. 核心概念\n- Pod: 最小部署单元\n- Service: 服务发现和负载均衡\n- Deployment: 部署管理\n\n## 2. 常用命令\n- kubectl get pods\n- kubectl logs\n- kubectl apply -f\n\n## 3. 部署应用\n编写 Deployment YAML\n配置 Service 暴露服务',
      tags: JSON.stringify(['Kubernetes', 'K8s', '容器编排']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'CI/CD 最佳实践',
      category: 'DevOps',
      content: '# CI/CD 最佳实践\n\n## 1. 代码管理\n使用 Git 进行版本控制\n分支策略：main、develop、feature\n\n## 2. 自动构建\n代码提交后自动触发构建\n运行单元测试和代码质量检查\n\n## 3. 自动化测试\n集成测试、E2E 测试\n\n## 4. 自动部署\n蓝绿部署或金丝雀发布',
      tags: JSON.stringify(['CI/CD', 'DevOps', '自动化']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '监控告警系统建设',
      category: '监控',
      content: '# 监控告警系统建设\n\n## 1. 监控指标\n- 系统指标：CPU、内存、磁盘、网络\n- 应用指标：QPS、延迟、错误率\n- 业务指标：订单量、用户数\n\n## 2. 告警规则\n合理设置阈值\n避免告警风暴\n\n## 3. 可视化\n使用 Grafana 构建监控面板',
      tags: JSON.stringify(['监控', '告警', 'Prometheus', 'Grafana']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '灾难恢复预案',
      category: '应急处理',
      content: '# 灾难恢复预案\n\n## 1. RTO/RPO 定义\nRTO (Recovery Time Objective): 恢复时间目标\nRPO (Recovery Point Objective): 恢复点目标\n\n## 2. 灾难等级划分\n- 一级故障：完全不可用\n- 二级故障：部分功能受影响\n- 三级故障：性能下降\n\n## 3. 应急响应流程\n- 故障发现和上报\n- 故障分析和定位\n- 故障处理和恢复\n- 事后复盘和改进',
      tags: JSON.stringify(['灾难恢复', '应急处理', '预案']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '系统性能基准测试',
      category: '性能测试',
      content: '# 系统性能基准测试\n\n## 1. 基准指标\n- 吞吐量 (Throughput)\n- 响应时间 (Latency)\n- 并发用户数\n- 错误率\n\n## 2. 测试工具\n- Apache Bench (ab)\n- JMeter\n- Locust\n- k6\n\n## 3. 测试场景\n- 单接口基准测试\n- 混合场景测试\n- 稳定性测试\n- 峰值测试',
      tags: JSON.stringify(['性能测试', '基准测试', '压测']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '容量规划指南',
      category: '规划',
      content: '# 容量规划指南\n\n## 1. 数据收集\n历史性能数据\n业务增长预期\n\n## 2. 资源需求分析\n- 计算资源 (CPU、内存\n- 存储资源 (磁盘空间、IOPS)\n- 网络资源 (带宽、延迟\n\n## 3. 扩容策略\n- 垂直扩容：升级单节点配置\n- 水平扩容：增加节点数量\n\n## 4. 定期评估\n每季度评估一次容量使用情况',
      tags: JSON.stringify(['容量规划', '扩容', '资源规划']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'API 安全最佳实践',
      category: 'API安全',
      content: '# API 安全最佳实践\n\n## 1. 认证授权\n- 使用 OAuth2.0 / JWT\n- 令牌过期时间合理设置\n\n## 2. 接口安全\n- 参数验证和过滤\n- 防止 SQL 注入\n- 防止 XSS 攻击\n\n## 3. 限流控制\n防止接口被滥用\n\n## 4. 日志记录\n记录关键操作日志',
      tags: JSON.stringify(['API', '安全', '认证']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '自动化运维工具概览',
      category: '工具',
      content: '# 自动化运维工具概览\n\n## 1. 配置管理\n- Ansible\n- SaltStack\n- Chef\n\n## 2. 持续集成\n- Jenkins\n- GitLab CI\n- GitHub Actions\n\n## 3. 监控系统\n- Prometheus + Grafana\n- Zabbix\n- Nagios\n\n## 4. 日志管理\n- ELK Stack (Elasticsearch + Logstash + Kibana)\n- Loki',
      tags: JSON.stringify(['工具', '自动化', 'Ansible', 'Jenkins']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'PostgreSQL 数据库管理',
      category: '数据库',
      content: '# PostgreSQL 数据库管理\n\n## 1. 基础配置\n- shared_buffers 配置\n- work_mem 配置\n- effective_cache_size 配置\n\n## 2. 备份恢复\n- pg_dump 逻辑备份\n- 基于 WAL 的物理备份\n\n## 3. 性能优化\n- EXPLAIN ANALYZE 分析查询计划\n- 索引优化\n- VACUUM 和 ANALYZE',
      tags: JSON.stringify(['PostgreSQL', '数据库', '管理']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: 'Git 工作流规范',
      category: '版本控制',
      content: '# Git 工作流规范\n\n## 1. 分支模型\n- main: 生产环境代码\n- develop: 开发环境代码\n- feature/*: 功能分支\n- hotfix/*: 紧急修复分支\n\n## 2. 提交规范\n- feat: 新功能\n- fix: 修复bug\n- docs: 文档更新\n- refactor: 重构\n\n## 3. 代码审核\n- PR (Pull Request) 流程\n- 至少一人审核\n- CI 通过后合并',
      tags: JSON.stringify(['Git', '版本控制', '工作流']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    },
    {
      id: randomUUID(),
      title: '日志分析实战',
      category: '日志管理',
      content: '# 日志分析实战\n\n## 1. 日志分类\n- 系统日志：var/log/\n- 应用日志：自定义位置\n- 访问日志：Nginx/Apache\n\n## 2. 常用工具\n- grep: 文本搜索\n- awk: 文本处理\n- sed: 流编辑\n\n## 3. 日志查询\n- 按时间范围过滤\n- 按关键字搜索\n- 统计分析',
      tags: JSON.stringify(['日志', '分析', 'grep', 'awk']),
      solutions: null,
      related_alerts: null,
      usage_count: 0
    }
  ];

  const insertKnowledge = db.prepare(`
    INSERT INTO knowledge_base (id, title, category, content, tags, solutions, related_alerts, usage_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  presetKnowledge.forEach(item => {
    insertKnowledge.run(item.id, item.title, item.category, item.content, item.tags, item.solutions, item.related_alerts, item.usage_count);
  });

  logger.info(`✅ 成功创建 ${presetKnowledge.length} 条预设知识库条目`);
}

function initializePresetScripts() {
  const presetScripts = [
    {
      id: randomUUID(),
      name: '系统健康检查脚本',
      description: '检查 CPU、内存、磁盘使用情况',
      content: '#!/bin/bash\n\necho "=== 系统健康检查 ==="\necho "日期: $(date)"\necho ""\n\necho "--- CPU 使用情况 ---"\ntop -bn1 | head -5\n\necho ""\necho "--- 内存使用情况 ---"\nfree -h\n\necho ""\necho "--- 磁盘使用情况 ---"\ndf -h',
      language: 'bash',
      tags: JSON.stringify(['系统检查', '监控'])
    },
    {
      id: randomUUID(),
      name: '日志清理脚本',
      description: '清理旧的日志文件',
      content: '#!/bin/bash\n\n# 清理 30 天前的日志文件\nLOG_DIR="/var/log"\necho "正在清理 $LOG_DIR 目录下 30 天前的日志.."\nfind $LOG_DIR -name "*.log" -type f -mtime +30 -delete\necho "完成!"',
      language: 'bash',
      tags: JSON.stringify(['日志', '清理'])
    },
    {
      id: randomUUID(),
      name: '服务状态检查',
      description: '检查关键服务的运行状态',
      content: '#!/bin/bash\n\necho "=== 服务状态检查 ==="\necho ""\n\nservices=("nginx" "mysql" "redis" "docker")\n\nfor service in "${services[@]}"; do\n  if systemctl is-active --quiet $service; then\n    echo "✅$service - 运行中\n  else\n    echo "❌$service - 未运行\n  fi\ndone',
      language: 'bash',
      tags: JSON.stringify(['服务', '监控'])
    },
    {
      id: randomUUID(),
      name: '数据库备份脚本',
      description: '自动备份 MySQL 数据库',
      content: '#!/bin/bash\n\nBACKUP_DIR="/backup/mysql"\nDATE=$(date +"%Y%m%d_%H%M%S")\nMYSQL_USER="root"\nMYSQL_PASSWORD="password"\n\nmkdir -p $BACKUP_DIR\n\necho "开始备份数据库..."\nmysqldump -u $MYSQL_USER -p$MYSQL_PASSWORD --all-databases | gzip > $BACKUP_DIR/backup_$DATE.sql.gz\n\nif [ $? -eq 0 ]; then\n  echo "✅ 备份成功: backup_$DATE.sql.gz"\n  # 只保留最近 7 天的备份\n  find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete\nelse\n  echo "❌ 备份失败"\n  exit 1\nfi',
      language: 'bash',
      tags: JSON.stringify(['数据库', '备份', 'MySQL'])
    },
    {
      id: randomUUID(),
      name: '系统资源报告',
      description: '生成详细的系统资源使用报告',
      content: '#!/bin/bash\n\necho "=== 系统资源详细报告 ==="\necho "生成时间: $(date)"\necho ""\n\necho "1. 系统信息:"\nuname -a\necho ""\n\necho "2. CPU信息:"\nlscpu | grep "Model name\\|CPU(s)\\|Core(s)\\|Thread(s)"\necho ""\n\necho "3. 内存使用:"\nfree -h\necho ""\n\necho "4. 磁盘使用:"\ndf -h\n echo ""\n\necho "5. 网络连接:"\nss -tuln | head -10\necho ""\n\necho "6. 系统负载:"\nuptime',
      language: 'bash',
      tags: JSON.stringify(['系统报告', '资源监控', '诊断'])
    },
    {
      id: randomUUID(),
      name: 'Docker 容器清理脚本',
      description: '清理停止的容器和未使用的镜像',
      content: '#!/bin/bash\n\necho "=== Docker 资源清理 ===\n\n# 清理停止的容器\nSTOPPED=$(docker ps -aq -f status=exited | wc -l)\necho "清理停止的容器 $STOPPED 个\ndocker container prune -f\n\n# 清理未使用的镜像\nUNUSED=$(docker images -f "dangling=true" -q | wc -l)\necho "清理未使用的镜像: $UNUSED 个\ndocker image prune -f\n\n# 清理未使用的卷\nVOLUMES=$(docker volume ls -qf dangling=true | wc -l)\necho "清理未使用的卷 $VOLUMES 个\ndocker volume prune -f\n\necho "清理完成!"',
      language: 'bash',
      tags: JSON.stringify(['Docker', '清理', '容器'])
    },
    {
      id: randomUUID(),
      name: 'Nginx 访问日志分析',
      description: '分析 Nginx 访问日志的基本统计',
      content: '#!/bin/bash\n\nLOG_FILE="/var/log/nginx/access.log"\n\nif [ ! -f "$LOG_FILE" ]; then\n  echo "日志文件不存在: $LOG_FILE"\n  exit 1\nfi\n\necho "=== Nginx 访问日志分析 ===\n\n# 总请求数\necho "总请求数: $(wc -l < $LOG_FILE)"\n\n# 状态码统计\necho ""\necho "状态码分布:"\nawk \'{print $9}\' $LOG_FILE | sort | uniq -c | sort -rn\n\n# 访问量前10的IP\necho ""\necho "访问量前10的IP:"\nawk \'{print $1}\' $LOG_FILE | sort | uniq -c | sort -rn | head -10\n\n# 访问量前10的URL\necho ""\necho "访问量前10的URL:"\nawk \'{print $7}\' $LOG_FILE | sort | uniq -c | sort -rn | head -10',
      language: 'bash',
      tags: JSON.stringify(['Nginx', '日志分析', '统计'])
    }
  ];

  const insertScript = db.prepare(`
    INSERT INTO scripts (id, name, description, content, language, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  presetScripts.forEach(script => {
    insertScript.run(script.id, script.name, script.description, script.content, script.language, script.tags);
  });

  logger.info(`✅ 成功创建 ${presetScripts.length} 个预设脚本`);
}

// 服务器配置需要用户在UI中手动添加，不再提供演示数据

function initializeAlertMappings() {
  // 获取第一个工作流作为默认工作流
  const firstWorkflow = db.prepare('SELECT id FROM workflows WHERE is_template = 1 LIMIT 1').get() as any;
  
  if (!firstWorkflow) {
    logger.info('⚠️ 没有找到预设工作流，跳过告警映射初始化');
    return;
  }

  const mappings = [
    {
      id: randomUUID(),
      alert_severity: 'critical',
      workflow_id: firstWorkflow.id,
      enabled: 1
    }
  ];

  const insertMapping = db.prepare(`
    INSERT INTO alert_workflow_mappings (id, alert_severity, workflow_id, enabled)
    VALUES (?, ?, ?, ?)
  `);

  mappings.forEach(mapping => {
    insertMapping.run(mapping.id, mapping.alert_severity, mapping.workflow_id, mapping.enabled);
  });

  logger.info(`✅ 成功创建 ${mappings.length} 个告警映射`);
}

function initializePresetScheduledTasks() {
  // 获取预设工作流的ID
  const workflows = db.prepare('SELECT id, name FROM workflows WHERE is_template = 1').all() as any[];
  const workflowMap = new Map(workflows.map(w => [w.name, w.id]));
  
  const scheduledTasks = [
    {
      id: randomUUID(),
      name: '每日健康检查',
      description: '每天早上 8 点执行系统健康检查工作流',
      schedule: '0 8 * * *',
      enabled: 1,
      workflowName: '日常健康检查'
    },
    {
      id: randomUUID(),
      name: '每周合规检查',
      description: '每周日凌晨 2 点执行合规检查工作流',
      schedule: '0 2 * * 0',
      enabled: 1,
      workflowName: '合规检查'
    },
    {
      id: randomUUID(),
      name: '日志定期分析',
      description: '每天凌晨 3 点执行日志分析工作流',
      schedule: '0 3 * * *',
      enabled: 1,
      workflowName: '日志分析'
    },
    {
      id: randomUUID(),
      name: '数据库备份',
      description: '每天凌晨 1 点自动执行数据库备份工作流',
      schedule: '0 1 * * *',
      enabled: 1,
      workflowName: '变更执行'
    }
  ];

  const insertScheduledTask = db.prepare(`
    INSERT INTO scheduled_tasks (id, name, description, schedule, enabled, workflow_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  scheduledTasks.forEach(task => {
    const workflowId = workflowMap.get(task.workflowName) || workflows[0]?.id;
    insertScheduledTask.run(task.id, task.name, task.description, task.schedule, task.enabled, workflowId);
  });

  logger.info(`✅ 成功创建 ${scheduledTasks.length} 个预设定时任务`);
}

// 告警数据通过Webhook或API接口从监控系统接收，不再提供模拟数据
