import { db } from './database';
import { logger } from '../utils/logger';

export function runMigrations() {
  migrateServerColumns();
  createNewColumnIndexes();
  migrateTasksContextColumn();
  migrateTasksExecutionOrderColumn();
  migrateTasksReportIdColumn();
  migrateAgentTable();
}

function migrateServerColumns() {
  try {
    const columns = db.prepare("PRAGMA table_info(servers)").all() as Array<{ name: string; type: string }>;
    const existingColumns = new Set(columns.map(col => col.name));
    
    const newServerColumns = [
      { name: 'os', type: 'TEXT' },
      { name: 'cpu_cores', type: 'INTEGER' },
      { name: 'memory_gb', type: 'REAL' },
      { name: 'disk_gb', type: 'REAL' },
      { name: 'ip_address', type: 'TEXT' },
      { name: 'private_ip', type: 'TEXT' },
      { name: 'cloud_provider', type: 'TEXT' },
      { name: 'cloud_instance_id', type: 'TEXT' }
    ];
    
    for (const col of newServerColumns) {
      if (!existingColumns.has(col.name)) {
        logger.info(`🔄 Adding column: ${col.name} to servers table`);
        try {
          db.prepare(`ALTER TABLE servers ADD COLUMN ${col.name} ${col.type}`).run();
        } catch {
          logger.info(`ℹ️ Column ${col.name} may already exist, skipping`);
        }
      }
    }
    logger.info('✅ Server table extension columns migration complete');
  } catch (e: unknown) {
    logger.info('⚠️ Server migration may have already run, continuing:', e instanceof Error ? e.message : String(e));
  }
}

function createNewColumnIndexes() {
  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_servers_cloud_provider ON servers(cloud_provider)').run();
  } catch {
    /* ignore */
  }
}

function migrateTasksContextColumn() {
  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const hasContextColumn = columns.some(col => col.name === 'context');
    if (!hasContextColumn) {
      logger.info('🔄 Migrating: adding context column to tasks table');
      db.prepare('ALTER TABLE tasks ADD COLUMN context TEXT').run();
      logger.info('✅ Migration complete: context column added');
    }
  } catch (e: unknown) {
    logger.info('ℹ️ Context column migration skipped:', e instanceof Error ? e.message : String(e));
  }
}

function migrateTasksExecutionOrderColumn() {
  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const hasExecutionOrderColumn = columns.some(col => col.name === 'execution_order');
    if (!hasExecutionOrderColumn) {
      logger.info('🔄 Migrating: adding execution_order column to tasks table');
      db.prepare('ALTER TABLE tasks ADD COLUMN execution_order TEXT').run();
      logger.info('✅ Migration complete: execution_order column added');
    }
  } catch (e: unknown) {
    logger.info('ℹ️ Execution_order column migration skipped:', e instanceof Error ? e.message : String(e));
  }
}

function migrateTasksReportIdColumn() {
  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const hasReportIdColumn = columns.some(col => col.name === 'report_id');
    if (!hasReportIdColumn) {
      logger.info('🔄 Migrating: adding report_id column to tasks table');
      db.prepare('ALTER TABLE tasks ADD COLUMN report_id TEXT').run();
      logger.info('✅ Migration complete: report_id column added');
    }
  } catch (e: unknown) {
    logger.info('ℹ️ Report_id column migration skipped:', e instanceof Error ? e.message : String(e));
  }
}

function migrateAgentTable() {
  try {
    logger.info('🔄 Checking agent table columns...');
    const columns = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>;
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
        } catch {
          logger.info(`ℹ️ Column ${col.name} may already exist, skipping`);
        }
      }
    }
    
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
    
    try {
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions(agent_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at ON agent_executions(created_at)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(status)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_agents_usage ON agents(usage_count)').run();
    } catch {
      logger.info('ℹ️ Index may already exist, skipping');
    }
    
    logger.info('✅ Agent table migration complete');
  } catch (e: unknown) {
    logger.info('⚠️ Migration may have already run, continuing:', e instanceof Error ? e.message : String(e));
  }
}
