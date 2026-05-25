import { Router, Request, Response } from 'express';
import db, { getIOInstance } from '../models/database';
import { randomUUID } from 'crypto';
import { createAuditLog } from '../services/auditService';
import { createNotification } from './notificationRoutes';
import { env } from '../utils/env';
import crypto from 'crypto';

const router = Router();

interface WebhookSignatureConfig {
  enabled: boolean;
  secret?: string;
  headerName: string;
  algorithm?: string;
}

function getWebhookConfig(source: string): WebhookSignatureConfig {
  const enabled = env.WEBHOOK_VERIFY_ENABLED || false;
  const secret = env.WEBHOOK_SECRET;
  return {
    enabled,
    secret,
    headerName: `X-Webhook-Signature-${source}`,
    algorithm: 'sha256'
  };
}

function verifyWebhookSignature(req: Request, source: string): boolean {
  const config = getWebhookConfig(source);
  if (!config.enabled || !config.secret) {
    return true;
  }

  const signature = req.headers[config.headerName.toLowerCase()] as string;
  if (!signature) {
    return false;
  }

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac(config.algorithm || 'sha256', config.secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// 查找匹配的工作流并触发
function findAndTriggerWorkflow(alertId: string, source: string, severity: string, title: string) {
  try {
    const mappings = db.prepare(`
      SELECT * FROM alert_workflow_mappings
      WHERE enabled = 1
      AND (alert_source = ? OR alert_source IS NULL)
      AND (alert_severity = ? OR alert_severity IS NULL)
    `).all(source, severity);
    
    const matchingMappings = (mappings as Array<{ alert_title_pattern?: string; workflow_id: string }>).filter(mapping => {
      if (!mapping.alert_title_pattern) return true;
      try {
        return title.includes(mapping.alert_title_pattern);
      } catch {
        return false;
      }
    });
    
    if (matchingMappings.length > 0) {
      const mapping = matchingMappings[0];
      
      const taskId = randomUUID();
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO tasks (id, workflow_id, name, status, created_at, initial_input, related_alert_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        mapping.workflow_id,
        `自动处理告警: ${title.substring(0, 50)}`,
        'pending',
        now,
        JSON.stringify({ alertId, source, severity, title }),
        alertId
      );
      
      db.prepare('UPDATE alerts SET related_task_id = ? WHERE id = ?').run(taskId, alertId);
      
      createAuditLog({
        action: 'auto_trigger_workflow',
        resource_type: 'task',
        resource_id: taskId,
        details: { alertId, workflowId: mapping.workflow_id }
      });
      
      const io = getIOInstance();
      if (io) {
        io.emit('task:created', { id: taskId, name: `自动处理告警: ${title}`, workflowId: mapping.workflow_id });
      }
      
      return taskId;
    }
    
    return null;
  } catch (error) {
    console.error('Error triggering workflow:', error);
    return null;
  }
}

// Prometheus Alertmanager Webhook
router.post('/prometheus', (req: Request, res: Response) => {
  try {
    if (!verifyWebhookSignature(req, 'prometheus')) {
      createAuditLog({
        action: 'webhook_signature_failed',
        resource_type: 'webhook',
        details: { source: 'prometheus', ip: req.ip }
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    const { alerts } = req.body;
    
    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Prometheus alert format'
      });
    }
    
    const io = getIOInstance();
    const processedAlerts: string[] = [];
    const triggeredTasks: string[] = [];
    
    for (const alert of alerts) {
      const id = randomUUID();
      const severity = alert.labels?.severity || 'medium';
      const title = alert.annotations?.summary || alert.labels?.alertname || 'Prometheus Alert';
      const content = alert.annotations?.description || JSON.stringify(alert, null, 2);
      const source = 'prometheus';
      
      db.prepare(`
        INSERT INTO alerts (id, source, severity, title, content, metadata, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        source,
        severity,
        title,
        content,
        JSON.stringify(alert),
        'new'
      );
      
      processedAlerts.push(id);
      
      const taskId = findAndTriggerWorkflow(id, source, severity, title);
      if (taskId) {
        triggeredTasks.push(taskId);
      }
      
      createNotification({
        type: 'alert',
        title: `新告警: ${title}`,
        content: content.substring(0, 200),
        related_alert_id: id
      });
      
      createAuditLog({
        action: 'alert_received',
        resource_type: 'alert',
        resource_id: id,
        details: { source, severity, title, taskId }
      });
      
      if (io) {
        io.emit('alert:new', { id, source, severity, title, content, taskId });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${processedAlerts.length} alerts`,
      data: { alertIds: processedAlerts, taskIds: triggeredTasks }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Zabbix Webhook
router.post('/zabbix', (req: Request, res: Response) => {
  try {
    if (!verifyWebhookSignature(req, 'zabbix')) {
      createAuditLog({
        action: 'webhook_signature_failed',
        resource_type: 'webhook',
        details: { source: 'zabbix', ip: req.ip }
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    const { trigger, host, item, value, severity } = req.body;
    
    if (!trigger) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Zabbix alert format'
      });
    }
    
    const io = getIOInstance();
    const id = randomUUID();
    const alertSeverity = severity || 'medium';
    const title = `[Zabbix] ${trigger}`;
    const hostName = host || 'Unknown Host';
    const content = `Host: ${hostName}\nTrigger: ${trigger}\nItem: ${item || 'N/A'}\nValue: ${value || 'N/A'}`;
    const source = 'zabbix';
    
    db.prepare(`
      INSERT INTO alerts (id, source, severity, title, content, metadata, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      source,
      alertSeverity,
      title,
      content,
      JSON.stringify(req.body),
      'new'
    );
    
    const taskId = findAndTriggerWorkflow(id, source, alertSeverity, title);
    
    createNotification({
      type: 'alert',
      title: `新告警: ${title}`,
      content: content.substring(0, 200),
      related_alert_id: id
    });
    
    createAuditLog({
      action: 'alert_received',
      resource_type: 'alert',
      resource_id: id,
      details: { source, severity: alertSeverity, title, taskId }
    });
    
    if (io) {
      io.emit('alert:new', { id, source, severity: alertSeverity, title, content, taskId });
    }
    
    res.json({
      success: true,
      message: 'Zabbix alert processed',
      data: { alertId: id, taskId }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// 通用Webhook
router.post('/generic', (req: Request, res: Response) => {
  try {
    if (!verifyWebhookSignature(req, 'generic')) {
      createAuditLog({
        action: 'webhook_signature_failed',
        resource_type: 'webhook',
        details: { source: 'generic', ip: req.ip }
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    const { 
      source = 'generic',
      severity = 'medium',
      title = 'Alert',
      content,
      metadata 
    } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }
    
    const io = getIOInstance();
    const id = randomUUID();
    
    db.prepare(`
      INSERT INTO alerts (id, source, severity, title, content, metadata, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      source,
      severity,
      title,
      content || JSON.stringify(req.body, null, 2),
      metadata ? JSON.stringify(metadata) : JSON.stringify(req.body),
      'new'
    );
    
    const taskId = findAndTriggerWorkflow(id, source, severity, title);
    
    createNotification({
      type: 'alert',
      title: `新告警: ${title}`,
      content: (content || '').substring(0, 200),
      related_alert_id: id
    });
    
    createAuditLog({
      action: 'alert_received',
      resource_type: 'alert',
      resource_id: id,
      details: { source, severity, title, taskId }
    });
    
    if (io) {
      io.emit('alert:new', { id, source, severity, title, content, taskId });
    }
    
    res.json({
      success: true,
      message: 'Generic alert processed',
      data: { alertId: id, taskId }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
