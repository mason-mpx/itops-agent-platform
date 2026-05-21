import { Router, Request, Response } from 'express';
import db from '../models/database';
import { safeLog, safeError, maskApiKey } from '../utils/sensitiveMask';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsObj: Record<string, string> = {};
    settings.forEach((s: any) => {
      settingsObj[s.key] = s.value;
    });
    res.json({ success: true, data: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

router.put('/', (req: Request, res: Response) => {
  try {
    const settings = req.body;
    
    // 输入验证
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid settings data' });
    }
    
    // 处理其他设置
    if (Object.keys(settings).length > 0) {
      const upsertStmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
      `);
      
      for (const [key, value] of Object.entries(settings)) {
        if (typeof key !== 'string' || key.length > 100) {
          continue; // 跳过无效的键
        }
        const stringValue = String(value);
        upsertStmt.run(key, stringValue, stringValue);
      }
    }
    
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// 辅助函数：获取API 密钥（优先从数据库读取，无则回退到环境变量）
function getApiKey(db: any, keyName: string, envName: string): string | undefined {
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as any).value) {
      const value = (result as any).value;
      // 忽略占位符密钥
      if (value && value !== 'your-doubao-api-key-here' && value !== 'your-openai-api-key-here') {
        return value;
      }
    }
  } catch (error) {
    // 忽略数据库错误，回退到环境变量
  }
  const envValue = process.env[envName];
  if (envValue && envValue !== 'your-doubao-api-key-here' && envValue !== 'your-openai-api-key-here') {
    return envValue;
  }
  return undefined;
}

// 辅助函数：获取模型ID（优先从数据库读取，无则回退到环境变量）
function getModelId(db: any, keyName: string, envName: string, defaultValue: string): string {
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as any).value) {
      return (result as any).value;
    }
  } catch (error) {
    // 忽略数据库错误，回退到环境变量
  }
  return process.env[envName] || defaultValue;
}

// 辅助函数：获取API 基础地址（优先从数据库读取，无则回退到环境变量）
function getApiBase(db: any, keyName: string, envName: string, defaultValue: string): string {
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as any).value) {
      return (result as any).value;
    }
  } catch (error) {
    // 忽略数据库错误，回退到环境变量
  }
  return process.env[envName] || defaultValue;
}

router.get('/api-keys', (_req: Request, res: Response) => {
  try {
    const doubaoKey = getApiKey(db, 'DOUBAO_API_KEY', 'DOUBAO_API_KEY');
    const openaiKey = getApiKey(db, 'OPENAI_API_KEY', 'OPENAI_API_KEY');
    const doubaoModel = getModelId(db, 'DOUBAO_MODEL', 'DOUBAO_MODEL', 'doubao-4o');
    const openaiModel = getModelId(db, 'OPENAI_MODEL', 'OPENAI_MODEL', 'gpt-4o');
    const doubaoApiBase = getApiBase(db, 'DOUBAO_API_BASE', 'DOUBAO_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3');
    const openaiApiBase = getApiBase(db, 'OPENAI_API_BASE', 'OPENAI_API_BASE', 'https://api.openai.com/v1');
    
    res.json({
      success: true,
      data: {
        doubao: {
          configured: !!doubaoKey,
          masked: doubaoKey ? '***' + doubaoKey.slice(-4) : null,
          model: doubaoModel,
          apiBase: doubaoApiBase
        },
        openai: {
          configured: !!openaiKey,
          masked: openaiKey ? '***' + openaiKey.slice(-4) : null,
          model: openaiModel,
          apiBase: openaiApiBase
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch API key status' });
  }
});

// 获取可用模型列表
router.get('/models', (_req: Request, res: Response) => {
  try {
    const doubaoModel = getModelId(db, 'DOUBAO_MODEL', 'DOUBAO_MODEL', 'doubao-4o');
    const openaiModel = getModelId(db, 'OPENAI_MODEL', 'OPENAI_MODEL', 'gpt-4o');
    const doubaoKey = getApiKey(db, 'DOUBAO_API_KEY', 'DOUBAO_API_KEY');
    const openaiKey = getApiKey(db, 'OPENAI_API_KEY', 'OPENAI_API_KEY');
    
    const models: Array<{
      id: string;
      name: string;
      provider: 'doubao' | 'openai';
      enabled: boolean;
    }> = [];
    
    // 添加用户配置的豆包模型（如果已配置）
    if (doubaoKey && doubaoModel) {
      models.push({
        id: doubaoModel,
        name: `豆包 (${doubaoModel})`,
        provider: 'doubao',
        enabled: true
      });
    }
    
    // 添加用户配置的 OpenAI 模型（如果已配置）
    if (openaiKey && openaiModel) {
      models.push({
        id: openaiModel,
        name: `OpenAI (${openaiModel})`,
        provider: 'openai',
        enabled: true
      });
    }
    
    // 总是添加一些默认模型作为备选（即使没有配置 API 密钥）
    // 这样用户可以在配置 API 之前先创建 Agent
    if (!models.some(m => m.id === 'doubao-4o')) {
      models.push({
        id: 'doubao-4o',
        name: '豆包 4o',
        provider: 'doubao',
        enabled: !doubaoKey
      });
    }
    
    if (!models.some(m => m.id === 'gpt-4o')) {
      models.push({
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        enabled: !openaiKey
      });
    }
    
    if (!models.some(m => m.id === 'gpt-4-turbo')) {
      models.push({
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        enabled: !openaiKey
      });
    }
    
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch models' });
  }
});

// 保存 API 密钥和模型配置
router.put('/api-keys', (req: Request, res: Response) => {
  try {
    const { doubaoApiKey, openaiApiKey, doubaoModel, openaiModel, doubaoApiBase, openaiApiBase } = req.body;
    
    safeLog('🔧 Saving API key settings...');
    
    const upsertStmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    
    // 保存豆包 API 密钥（如果提供）
    if (doubaoApiKey !== undefined) {
      if (doubaoApiKey === '') {
        safeLog('Deleting DOUBAO_API_KEY');
        db.prepare('DELETE FROM settings WHERE key = ?').run('DOUBAO_API_KEY');
      } else {
        safeLog('Saving DOUBAO_API_KEY:', maskApiKey(doubaoApiKey));
        upsertStmt.run('DOUBAO_API_KEY', doubaoApiKey, doubaoApiKey);
      }
    }
    
    // 保存 OpenAI API 密钥（如果提供）
    if (openaiApiKey !== undefined) {
      if (openaiApiKey === '') {
        safeLog('Deleting OPENAI_API_KEY');
        db.prepare('DELETE FROM settings WHERE key = ?').run('OPENAI_API_KEY');
      } else {
        safeLog('Saving OPENAI_API_KEY:', maskApiKey(openaiApiKey));
        upsertStmt.run('OPENAI_API_KEY', openaiApiKey, openaiApiKey);
      }
    }
    
    // 保存豆包模型 ID（如果提供）
    if (doubaoModel !== undefined) {
      if (doubaoModel === '') {
        db.prepare('DELETE FROM settings WHERE key = ?').run('DOUBAO_MODEL');
      } else {
        upsertStmt.run('DOUBAO_MODEL', doubaoModel, doubaoModel);
      }
    }
    
    // 保存 OpenAI 模型 ID（如果提供）
    if (openaiModel !== undefined) {
      if (openaiModel === '') {
        db.prepare('DELETE FROM settings WHERE key = ?').run('OPENAI_MODEL');
      } else {
        upsertStmt.run('OPENAI_MODEL', openaiModel, openaiModel);
      }
    }
    
    // 保存豆包 API 地址（如果提供）
    if (doubaoApiBase !== undefined) {
      if (doubaoApiBase === '') {
        db.prepare('DELETE FROM settings WHERE key = ?').run('DOUBAO_API_BASE');
      } else {
        upsertStmt.run('DOUBAO_API_BASE', doubaoApiBase, doubaoApiBase);
      }
    }
    
    // 保存 OpenAI API 地址（如果提供）
    if (openaiApiBase !== undefined) {
      if (openaiApiBase === '') {
        db.prepare('DELETE FROM settings WHERE key = ?').run('OPENAI_API_BASE');
      } else {
        upsertStmt.run('OPENAI_API_BASE', openaiApiBase, openaiApiBase);
      }
    }
    
    // 自动更新预设Agent的模型字段
    // 先确定用户配置的模型
    let configuredModel = null;
    
    // 优先检查豆包模型
    const doubaoKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY');
    const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL');
    
    safeLog('🔍 DEBUG - doubaoApiKey:', doubaoKeyResult ? maskApiKey((doubaoKeyResult as any).value) : 'null');
    safeLog('🔍 DEBUG - doubaoModel from DB:', doubaoModelResult ? (doubaoModelResult as any).value : 'null');
    
    if (doubaoKeyResult && (doubaoKeyResult as any).value && (doubaoKeyResult as any).value !== 'your-doubao-api-key-here') {
      configuredModel = (doubaoModelResult && (doubaoModelResult as any).value) ? (doubaoModelResult as any).value : 'doubao-4o';
    } else {
      // 如果豆包没有配置，检查OpenAI
      const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY');
      const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL');
      
      safeLog('🔍 DEBUG - openaiApiKey:', openaiKeyResult ? maskApiKey((openaiKeyResult as any).value) : 'null');
      safeLog('🔍 DEBUG - openaiModel from DB:', openaiModelResult ? (openaiModelResult as any).value : 'null');
      
      if (openaiKeyResult && (openaiKeyResult as any).value && (openaiKeyResult as any).value !== 'your-openai-api-key-here') {
        configuredModel = (openaiModelResult && (openaiModelResult as any).value) ? (openaiModelResult as any).value : 'gpt-4o';
      }
    }
    
    safeLog('🔍 DEBUG - Final configuredModel to use for presets:', configuredModel);
    
    // 如果有配置的模型，更新所有预设Agent
    if (configuredModel) {
      const updateStmt = db.prepare(`
        UPDATE agents 
        SET model = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE is_preset = 1
      `);
      const result = updateStmt.run(configuredModel);
      safeLog(`✅ Updated ${(result as any).changes} preset agents with model: ${configuredModel}`);
    } else {
      // 如果没有配置模型，清空所有预设Agent的model字段
      const updateStmt = db.prepare(`
        UPDATE agents 
        SET model = NULL, updated_at = CURRENT_TIMESTAMP 
        WHERE is_preset = 1
      `);
      const result = updateStmt.run();
      safeLog(`✅ Cleared model from ${(result as any).changes} preset agents`);
    }
    
    safeLog('✅ API key settings saved successfully');
    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    safeError('❌ Failed to save settings:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to save settings' });
  }
});

// 删除特定提供商的API配置
router.delete('/api-keys/:provider', (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    safeLog(`🗑️ Deleting API configuration for provider: ${provider}`);

    if (provider === 'doubao') {
      db.prepare('DELETE FROM settings WHERE key = ?').run('DOUBAO_API_KEY');
      db.prepare('DELETE FROM settings WHERE key = ?').run('DOUBAO_MODEL');
      db.prepare('DELETE FROM settings WHERE key = ?').run('DOUBAO_API_BASE');
    } else if (provider === 'openai') {
      db.prepare('DELETE FROM settings WHERE key = ?').run('OPENAI_API_KEY');
      db.prepare('DELETE FROM settings WHERE key = ?').run('OPENAI_MODEL');
      db.prepare('DELETE FROM settings WHERE key = ?').run('OPENAI_API_BASE');
    } else {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }
    
    // 删除配置后，检查是否还有其他可用配置
    let hasRemainingConfig = false;
    
    // 检查豆包是否还有配置
    const doubaoKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY');
    if (doubaoKey && (doubaoKey as any).value && (doubaoKey as any).value !== 'your-doubao-api-key-here') {
      hasRemainingConfig = true;
    } else {
      // 检查OpenAI是否还有配置
      const openaiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY');
      if (openaiKey && (openaiKey as any).value && (openaiKey as any).value !== 'your-openai-api-key-here') {
        hasRemainingConfig = true;
      }
    }
    
    if (!hasRemainingConfig) {
      // 如果没有配置了，清空所有预设Agent的model字段
      const updateStmt = db.prepare(`
        UPDATE agents 
        SET model = NULL, updated_at = CURRENT_TIMESTAMP 
        WHERE is_preset = 1
      `);
      const result = updateStmt.run();
      safeLog(`✅ Cleared model from ${(result as any).changes} preset agents (no API keys configured)`);
    } else {
      // 还有其他配置，重新确定应该用哪个模型
      let configuredModel = null;
      
      // 优先检查豆包模型
      if (doubaoKey && (doubaoKey as any).value && (doubaoKey as any).value !== 'your-doubao-api-key-here') {
        const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL');
        configuredModel = (doubaoModelResult && (doubaoModelResult as any).value) ? (doubaoModelResult as any).value : 'doubao-4o';
      } else {
        // 检查OpenAI
        const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY');
        if (openaiKeyResult && (openaiKeyResult as any).value && (openaiKeyResult as any).value !== 'your-openai-api-key-here') {
          const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL');
          configuredModel = (openaiModelResult && (openaiModelResult as any).value) ? (openaiModelResult as any).value : 'gpt-4o';
        }
      }
      
      if (configuredModel) {
        const updateStmt = db.prepare(`
          UPDATE agents 
          SET model = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE is_preset = 1
        `);
        const result = updateStmt.run(configuredModel);
        safeLog(`✅ Updated ${(result as any).changes} preset agents with model: ${configuredModel} (after deleting one provider)`);
      }
    }

    safeLog(`✅ API configuration deleted for provider: ${provider}`);
    res.json({ success: true, message: 'Configuration deleted' });
  } catch (error) {
    safeError('❌ Failed to delete configuration:', error);
    res.status(500).json({ success: false, error: 'Failed to delete configuration' });
  }
});

export default router;
