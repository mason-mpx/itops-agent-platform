import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../models/database';
import { notificationService } from '../services/notificationService';
import { alertNoiseReductionService } from '../services/alertNoiseReductionService';

const router = Router();

// 验证severity值的有效性
const validSeverities = ['critical', 'high', 'medium', 'low'];
const validStatuses = ['new', 'acknowledged', 'resolved'];

router.get('/', (req: Request, res: Response) => {
  try {
    const { status, severity, limit } = req.query;
    let query = 'SELECT * FROM alerts';
    const params: unknown[] = [];
    
    const conditions = [];
    if (status && validStatuses.includes(status as string)) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (severity && validSeverities.includes(severity as string)) {
      conditions.push('severity = ?');
      params.push(severity);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      const limitNum = parseInt(limit as string);
      if (!isNaN(limitNum) && limitNum > 0) {
        query += ' LIMIT ?';
        params.push(Math.min(limitNum, 100)); // 最多100条
      }
    }
    
    const alerts = db.prepare(query).all(...params) as Array<{ id: string; metadata?: string; [key: string]: unknown }>;
    alerts.forEach((a) => {
      if (a.metadata) {
        try {
          a.metadata = JSON.parse(a.metadata);
        } catch {
          a.metadata = '{}';
        }
      }
    });
    res.json({ success: true, data: alerts });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    
    const alertObj = alert as { metadata?: string; [key: string]: unknown };
    if (alertObj.metadata) {
      try {
        alertObj.metadata = JSON.parse(alertObj.metadata);
      } catch {
        alertObj.metadata = '{}';
      }
    }
    
    res.json({ success: true, data: alert });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch alert' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { source, severity, title, content, metadata, related_task_id } = req.body;

    // 输入验证
    if (!title || title.length === 0) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    if (severity && !validSeverities.includes(severity)) {
      return res.status(400).json({ success: false, error: 'Invalid severity value' });
    }

    // 告警降噪处理
    const noiseCheck = await alertNoiseReductionService.processAlert(
      source || 'unknown',
      title,
      content,
      severity
    );

    const id = randomUUID();

    db.prepare(`
      INSERT INTO alerts (id, source, severity, title, content, metadata, related_task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      source || 'unknown',
      severity || 'medium',
      title,
      content || '',
      JSON.stringify(metadata || {}),
      related_task_id
    );

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as { id: string; metadata?: string; title: string; severity: string; content: string; source: string; [key: string]: unknown } | undefined;
    if (alert && alert.metadata) {
      try {
        alert.metadata = JSON.parse(alert.metadata);
      } catch {
        alert.metadata = '{}';
      }
    }

    // 仅在未被抑制时发送告警通知
    if (noiseCheck.shouldNotify) {
      notificationService.sendAlertNotification(alert!).catch(() => {
        console.error('Failed to send alert notification');
      });
    }

    res.status(201).json({ 
      success: true, 
      data: {
        alert,
        noiseReduction: noiseCheck
      }
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create alert' });
  }
});

router.put('/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as { id: string; title: string; [key: string]: unknown } | undefined;
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    
    db.prepare('UPDATE alerts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('acknowledged', id);
    
    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    
    // 发送告警确认通知
    notificationService.sendSystemNotification(
      '告警已确认',
      `告警 "${alert.title}" 已确认处理`
    ).catch(() => console.error('Failed to send ack notification'));
    
    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to acknowledge alert' });
  }
});

router.put('/:id/resolve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as { id: string; title: string; [key: string]: unknown } | undefined;
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    
    db.prepare('UPDATE alerts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('resolved', id);
    
    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    
    // 发送告警解决通知
    notificationService.sendSystemNotification(
      '告警已解决',
      `告警 "${alert.title}" 已解决`
    ).catch(() => console.error('Failed to send resolve notification'));
    
    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to resolve alert' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    
    db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
    
    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete alert' });
  }
});

router.get('/stats/summary', (_req: Request, res: Response) => {
  try {
    const stats = db.prepare(`
      SELECT 
        status, 
        COUNT(*) as count 
      FROM alerts 
      GROUP BY status
    `).all();
    
    const severityStats = db.prepare(`
      SELECT 
        severity, 
        COUNT(*) as count 
      FROM alerts 
      GROUP BY severity
    `).all();
    
    res.json({
      success: true,
      data: {
        byStatus: stats,
        bySeverity: severityStats,
        total: (stats as Array<{ count: number }>).reduce((sum: number, s) => sum + s.count, 0)
      }
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get alert stats' });
  }
});

export default router;
