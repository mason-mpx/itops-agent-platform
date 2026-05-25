import { Router, Request, Response } from 'express';
import { db } from '../models/database';

const router = Router();

// 获取通知配置
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configs = db.prepare('SELECT * FROM settings WHERE key LIKE ?').all('notification_%') as Array<{ key: string; value: string }>;
    
    const config: Record<string, unknown> = {};
    configs.forEach((c) => {
      const key = c.key.replace('notification_', '');
      try {
        config[key] = JSON.parse(c.value);
      } catch {
        config[key] = c.value;
      }
    });

    res.json({
      success: true,
      data: {
        webhook_enabled: config.webhook_enabled ?? true,
        email_enabled: config.email_enabled ?? false,
        wechat_enabled: config.wechat_enabled ?? false,
        dingtalk_enabled: config.dingtalk_enabled ?? false,
        email_config: config.email_config ?? {},
        wechat_config: config.wechat_config ?? {},
        dingtalk_config: config.dingtalk_config ?? {},
        alert_notification: config.alert_notification ?? {
          critical: true,
          warning: true,
          info: false
        },
        task_notification: config.task_notification ?? {
          success: true,
          failed: true,
          running: false
        }
      }
    });
  } catch (error) {
    console.error('获取通知配置失败:', error);
    res.status(500).json({ success: false, error: '获取通知配置失败' });
  }
});

// 更新通知配置
router.put('/', async (req: Request, res: Response) => {
  try {
    const {
      webhook_enabled,
      email_enabled,
      wechat_enabled,
      dingtalk_enabled,
      email_config,
      wechat_config,
      dingtalk_config,
      alert_notification,
      task_notification
    } = req.body;

    const updates = [
      { key: 'notification_webhook_enabled', value: JSON.stringify(webhook_enabled) },
      { key: 'notification_email_enabled', value: JSON.stringify(email_enabled) },
      { key: 'notification_wechat_enabled', value: JSON.stringify(wechat_enabled) },
      { key: 'notification_dingtalk_enabled', value: JSON.stringify(dingtalk_enabled) },
      { key: 'notification_email_config', value: JSON.stringify(email_config) },
      { key: 'notification_wechat_config', value: JSON.stringify(wechat_config) },
      { key: 'notification_dingtalk_config', value: JSON.stringify(dingtalk_config) },
      { key: 'notification_alert_notification', value: JSON.stringify(alert_notification) },
      { key: 'notification_task_notification', value: JSON.stringify(task_notification) }
    ];

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    updates.forEach(update => {
      stmt.run(update.key, update.value);
    });

    res.json({
      success: true,
      message: '通知配置已更新'
    });
  } catch (error) {
    console.error('更新通知配置失败:', error);
    res.status(500).json({ success: false, error: '更新通知配置失败' });
  }
});

export default router;
