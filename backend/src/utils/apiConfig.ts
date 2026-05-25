import type Database from 'better-sqlite3';

interface SettingsRecord {
  value: string;
}

/**
 * 获取 API 密钥（优先从数据库读取，无则回退到环境变量）
 */
export function getApiKey(database: Database.Database, keyName: string, envName: string): string | undefined {
  try {
    const result = database.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as SettingsRecord).value) {
      const value = (result as SettingsRecord).value;
      if (value && value !== 'your-doubao-api-key-here' && value !== 'your-openai-api-key-here') {
        return value;
      }
    }
  } catch {
    // 忽略数据库错误，回退到环境变量
  }
  const envValue = process.env[envName];
  if (envValue && envValue !== 'your-doubao-api-key-here' && envValue !== 'your-openai-api-key-here') {
    return envValue;
  }
  return undefined;
}

/**
 * 获取模型 ID（优先从数据库读取，无则回退到环境变量）
 */
export function getModelId(database: Database.Database, keyName: string, envName: string, defaultValue: string): string {
  try {
    const result = database.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as SettingsRecord).value) {
      return (result as SettingsRecord).value;
    }
  } catch {
    // 忽略数据库错误，回退到环境变量
  }
  return process.env[envName] || defaultValue;
}

/**
 * 获取 API 基础地址（优先从数据库读取，无则回退到环境变量）
 */
export function getApiBase(database: Database.Database, keyName: string, envName: string, defaultValue: string): string {
  try {
    const result = database.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as SettingsRecord).value) {
      return (result as SettingsRecord).value;
    }
  } catch {
    // 忽略数据库错误，回退到环境变量
  }
  return process.env[envName] || defaultValue;
}

/**
 * 构建完整的 API 端点地址，避免路径重复
 */
export function buildApiEndpoint(apiBase: string, endpoint: string): string {
  const cleanApiBase = apiBase.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  return `${cleanApiBase}/${cleanEndpoint}`;
}
