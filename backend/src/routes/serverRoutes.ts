import { Router, Request, Response } from 'express';
import db from '../models/database';
import { randomUUID } from 'crypto';
import { encrypt } from '../services/encryptionService';
import { safeError } from '../utils/sensitiveMask';

const router = Router();

// 获取所有服务器
router.get('/', (_req: Request, res: Response) => {
  try {
    const servers = db.prepare('SELECT * FROM servers ORDER BY created_at DESC').all();
    const processedServers = (servers as Array<{ id: string; tags?: string; [key: string]: unknown }>).map(server => {
      const groups = db.prepare(`
        SELECT sg.id, sg.name FROM server_groups sg
        JOIN server_group_mapping sgm ON sg.id = sgm.group_id
        WHERE sgm.server_id = ?
      `).all(server.id);
      return {
        ...server,
        tags: server.tags ? JSON.parse(server.tags) : [],
        groups
      };
    });
    res.json({ success: true, data: processedServers });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get servers' });
  }
});

// 获取单个服务�?
router.get('/:id', (req: Request, res: Response) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    // 不返回敏感信息，并解析标�?
    const { password: _password, private_key: _private_key, ...safeServer } = server as { password?: string; private_key?: string; tags?: string; [key: string]: unknown };
    res.json({ 
      success: true, 
      data: { 
        ...safeServer, 
        tags: safeServer.tags ? JSON.parse(safeServer.tags) : [] 
      } 
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get server' });
  }
});

// 创建服务�?
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, hostname, port, username, password, private_key, use_ssh_key, description, tags } = req.body;
    
    if (!name || !hostname || !username) {
      return res.status(400).json({ success: false, error: 'Name, hostname and username are required' });
    }

    const id = randomUUID();
    const tagsJson = tags ? JSON.stringify(tags) : null;

    // 加密敏感信息
    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedPrivateKey = private_key ? encrypt(private_key) : null;

    db.prepare(`
      INSERT INTO servers (id, name, hostname, port, username, password, private_key, use_ssh_key, description, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, hostname, port || 22, username, encryptedPassword, encryptedPrivateKey, use_ssh_key ? 1 : 0, description || null, tagsJson);

    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create server' });
  }
});

// 更新服务�?
router.put('/:id', (req: Request, res: Response) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const { name, hostname, port, username, password, private_key, use_ssh_key, description, tags, enabled } = req.body;
    const tagsJson = tags ? JSON.stringify(tags) : null;

    // 加密敏感信息（如果提供了新值）
    let encryptedPassword: string | null | undefined;
    let encryptedPrivateKey: string | null | undefined;
    
    if (password !== undefined) {
      encryptedPassword = password ? encrypt(password) : null;
    }
    
    if (private_key !== undefined) {
      encryptedPrivateKey = private_key ? encrypt(private_key) : null;
    }

    db.prepare(`
      UPDATE servers
      SET name = COALESCE(?, name),
          hostname = COALESCE(?, hostname),
          port = COALESCE(?, port),
          username = COALESCE(?, username),
          password = CASE WHEN ? IS NOT NULL THEN ? ELSE password END,
          private_key = CASE WHEN ? IS NOT NULL THEN ? ELSE private_key END,
          use_ssh_key = COALESCE(?, use_ssh_key),
          description = COALESCE(?, description),
          tags = COALESCE(?, tags),
          enabled = COALESCE(?, enabled),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, hostname, port, username, 
      password !== undefined ? encryptedPassword : undefined, 
      password !== undefined ? encryptedPassword : undefined, 
      private_key !== undefined ? encryptedPrivateKey : undefined, 
      private_key !== undefined ? encryptedPrivateKey : undefined, 
      use_ssh_key !== undefined ? (use_ssh_key ? 1 : 0) : undefined, 
      description, tagsJson, enabled, req.params.id
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update server' });
  }
});

// 删除服务�?
router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete server' });
  }
});

// 获取服务器命令历�?
router.get('/:id/command-history', (req: Request, res: Response) => {
  try {
    const history = db.prepare(`
      SELECT * FROM server_command_history 
      WHERE server_id = ? 
      ORDER BY executed_at DESC 
      LIMIT 50
    `).all(req.params.id);
    
    res.json({ success: true, data: history });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get command history' });
  }
});

// 获取服务器合规检查历�?
router.get('/:id/compliance-history', (req: Request, res: Response) => {
  try {
    const checks = db.prepare(`
      SELECT * FROM compliance_checks 
      WHERE server_id = ? 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all(req.params.id);
    
    res.json({ success: true, data: checks });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get compliance history' });
  }
});

// 导出服务器命令历�?(JSON格式)
router.get('/:id/command-history/export', (req: Request, res: Response) => {
  try {
    const serverId = req.params.id;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as { id: string; name: string; hostname: string; [key: string]: unknown } | undefined;
    
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    
    const history = db.prepare(`
      SELECT * FROM server_command_history 
      WHERE server_id = ? 
      ORDER BY executed_at DESC
    `).all(serverId);
    
    const exportData = {
      server: {
        id: server.id,
        name: server.name,
        hostname: server.hostname,
        exportTime: new Date().toISOString()
      },
      commandHistory: history
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="command-history-${serverId}-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    safeError('Failed to export command history:', error);
    res.status(500).json({ success: false, error: 'Failed to export command history' });
  }
});

// 导出合规检查历�?(JSON格式)
router.get('/:id/compliance-history/export', (req: Request, res: Response) => {
  try {
    const serverId = req.params.id;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as { id: string; name: string; hostname: string } | undefined;
    
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    
    const checks = db.prepare(`
      SELECT * FROM compliance_checks 
      WHERE server_id = ? 
      ORDER BY created_at DESC
    `).all(serverId);
    
    const exportData = {
      server: {
        id: server.id,
        name: server.name,
        hostname: server.hostname,
        exportTime: new Date().toISOString()
      },
      complianceHistory: checks
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-history-${serverId}-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error: unknown) {
    safeError('Failed to export compliance history:', error);
    res.status(500).json({ success: false, error: 'Failed to export compliance history' });
  }
});

export default router;
