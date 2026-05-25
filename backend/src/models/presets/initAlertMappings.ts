import { db } from '../database';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

export function initializeAlertMappings() {
  const firstWorkflow = db.prepare('SELECT id FROM workflows WHERE is_template = 1 LIMIT 1').get() as { id: string } | undefined;
  
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
