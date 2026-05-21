import axios from 'axios';
import db from '../models/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}



// 熔断状态接口
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  halfOpenAttempts: number;
  maxHalfOpenAttempts: number;
}

// 简单的熔断器实现
class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
    halfOpenAttempts: 0,
    maxHalfOpenAttempts: 3
  };
  
  constructor(
    private readonly maxFailures = 5,
    private readonly resetTimeout = 60000
  ) {}
  
  canCall(): boolean {
    if (this.state.isOpen) {
      const now = Date.now();
      if (now - this.state.lastFailureTime > this.resetTimeout) {
        if (this.state.halfOpenAttempts >= this.state.maxHalfOpenAttempts) {
          logger.info('� Circuit breaker half-open limit reached, still blocking');
          return false;
        }
        logger.info('🔄 Circuit breaker half-open, allowing test request');
        this.state.halfOpenAttempts++;
        return true;
      }
      return false;
    }
    return true;
  }
  
  recordSuccess(): void {
    this.state.failures = 0;
    this.state.isOpen = false;
    this.state.halfOpenAttempts = 0;
  }
  
  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    if (this.state.failures >= this.maxFailures) {
      logger.info('🔌 Circuit breaker opened due to too many failures');
      this.state.isOpen = true;
      this.state.halfOpenAttempts = 0;
    }
  }
}

// 全局熔断器实例
const circuitBreaker = new CircuitBreaker();

// 辅助函数：获取 API 密钥（优先从数据库读取，无则回退到环境变量）
function getApiKey(db: any, keyName: string, envName: string): string | undefined {
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as any).value) {
      const value = (result as any).value;
      if (value && value !== 'your-doubao-api-key-here' && value !== 'your-openai-api-key-here') {
        return value;
      }
    }
  } catch (error) {
    // 忽略错误
  }
  const envValue = process.env[envName];
  if (envValue && envValue !== 'your-doubao-api-key-here' && envValue !== 'your-openai-api-key-here') {
    return envValue;
  }
  return undefined;
}

// 辅助函数：获取模型 ID（优先从数据库读取，无则回退到环境变量）
function getModelId(db: any, keyName: string, envName: string, defaultValue: string): string {
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as any).value) {
      return (result as any).value;
    }
  } catch (error) {
    // 忽略错误
  }
  return process.env[envName] || defaultValue;
}

// 辅助函数：获取 API 基础地址（优先从数据库读取，无则回退到环境变量）
function getApiBase(db: any, keyName: string, envName: string, defaultValue: string): string {
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
    if (result && (result as any).value) {
      return (result as any).value;
    }
  } catch (error) {
    // 忽略错误
  }
  return process.env[envName] || defaultValue;
}

// 辅助函数：构建完整的 API 端点地址，避免路径重复
function buildApiEndpoint(apiBase: string, endpoint: string): string {
  // 移除末尾的斜杠
  const cleanApiBase = apiBase.replace(/\/+$/, '');
  // 移除开头的斜杠
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  return `${cleanApiBase}/${cleanEndpoint}`;
}

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的 API 调用
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 10000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`✅ Request succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error as Error;
      logger.warn(`⚠️ Request attempt ${attempt} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        // 指数退避
        const delayMs = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        logger.info(`⏳ Waiting ${delayMs}ms before retry...`);
        await delay(delayMs + Math.random() * baseDelay); // 添加抖动避免雪崩
      }
    }
  }
  
  logger.error(`❌ All ${maxRetries} retries failed`);
  throw lastError;
}

// 记录 Agent 执行历史
function recordAgentExecution(
  agentId: string,
  agentName: string,
  inputText: string,
  outputText: string,
  status: 'success' | 'failure',
  errorMessage?: string,
  executionTimeMs?: number,
  metadata?: any
): void {
  try {
    db.prepare(`
      INSERT INTO agent_executions (
        id, agent_id, agent_name, input_text, output_text, status, error_message, execution_time_ms, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      agentId,
      agentName,
      inputText,
      outputText,
      status,
      errorMessage || null,
      executionTimeMs || null,
      metadata ? JSON.stringify(metadata) : null
    );
  } catch (error) {
    logger.error('Failed to record agent execution:', error);
  }
}

// 更新 Agent 使用统计
function updateAgentStats(agentId: string): void {
  try {
    db.prepare(`
      UPDATE agents 
      SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(agentId);
  } catch (error) {
    logger.error('Failed to update agent stats:', error);
  }
}

// 通用 API 配置接口
interface LLMProviderConfig {
  providerName: string;
  apiKeySetting: string;
  apiKeyEnv: string;
  apiBaseSetting: string;
  apiBaseEnv: string;
  defaultApiBase: string;
  modelSetting: string;
  modelEnv: string;
  defaultModel: string;
  placeholderKey: string;
}

// 豆包配置
const DOUBAO_CONFIG: LLMProviderConfig = {
  providerName: 'Doubao',
  apiKeySetting: 'DOUBAO_API_KEY',
  apiKeyEnv: 'DOUBAO_API_KEY',
  apiBaseSetting: 'DOUBAO_API_BASE',
  apiBaseEnv: 'DOUBAO_API_BASE',
  defaultApiBase: 'https://ark.cn-beijing.volces.com/api/v3',
  modelSetting: 'DOUBAO_MODEL',
  modelEnv: 'DOUBAO_MODEL',
  defaultModel: 'doubao-4o',
  placeholderKey: 'your-doubao-api-key-here'
};

// OpenAI配置
const OPENAI_CONFIG: LLMProviderConfig = {
  providerName: 'OpenAI',
  apiKeySetting: 'OPENAI_API_KEY',
  apiKeyEnv: 'OPENAI_API_KEY',
  apiBaseSetting: 'OPENAI_API_BASE',
  apiBaseEnv: 'OPENAI_API_BASE',
  defaultApiBase: 'https://api.openai.com/v1',
  modelSetting: 'OPENAI_MODEL',
  modelEnv: 'OPENAI_MODEL',
  defaultModel: 'gpt-4o',
  placeholderKey: 'your-openai-api-key-here'
};

/**
 * 通用的LLM API调用函数
 */
async function callLLMAPI(
  config: LLMProviderConfig,
  systemPrompt: string,
  userInput: string,
  agentName: string,
  temperature: number
): Promise<string> {
  const startTime = Date.now();
  const apiKey = getApiKey(db, config.apiKeySetting, config.apiKeyEnv);
  const apiBase = getApiBase(db, config.apiBaseSetting, config.apiBaseEnv, config.defaultApiBase);
  const model = getModelId(db, config.modelSetting, config.modelEnv, config.defaultModel);

  // 检查 API Key 配置
  if (!apiKey || apiKey === config.placeholderKey) {
    const errorMsg = `${config.providerName}_API_KEY not configured - please configure API key in Settings page`;
    logger.error(`❌ [${agentName}] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 检查熔断器
  if (!circuitBreaker.canCall()) {
    const errorMsg = 'Circuit breaker is OPEN, rejecting request - service temporarily unavailable';
    logger.error(`🔌 [${agentName}] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  try {
    logger.info(`🤖 [${agentName}] Calling ${config.providerName} API...`);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ];

    const requestBody = {
      model,
      messages,
      temperature,
      max_tokens: 2048
    };

    // 检查并清理 API 地址
    let finalApiBase = apiBase;
    if (finalApiBase.includes('/chat/completions')) {
      finalApiBase = finalApiBase.replace('/chat/completions', '');
    }
    
    const response = await callWithRetry(() =>
      axios.post(
        buildApiEndpoint(finalApiBase, 'chat/completions'),
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 60000
        }
      )
    );

    circuitBreaker.recordSuccess();

    if (response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content;
      logger.info(`✅ [${agentName}] ${config.providerName} API call successful, response length: ${content?.length || 0} chars`);
      
      recordAgentExecution(
        '',
        agentName,
        userInput,
        content || '',
        'success',
        undefined,
        Date.now() - startTime,
        { tokens: response.data.usage }
      );
      
      return content || '';
    } else {
      throw new Error('API returned empty choices');
    }
  } catch (error: any) {
    circuitBreaker.recordFailure();
    
    logger.error(`❌ [${agentName}] ${config.providerName} API call failed:`, error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('Invalid API key - please check your configuration');
    } else if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded - please try again later');
    } else if (error.response?.status >= 500) {
      throw new Error('Server error - please try again later');
    } else {
      throw new Error(`LLM call failed: ${error.message}`);
    }
  }
}

/**
 * 调用豆包 API 获取响应
 * @param systemPrompt 系统提示词
 * @param userInput 用户输入
 * @param agentName Agent 名称（用于日志）
 * @param temperature 温度参数
 */
export async function callDoubaoAPI(
  systemPrompt: string,
  userInput: string,
  agentName: string = 'Agent',
  temperature: number = 0.7
): Promise<string> {
  return callLLMAPI(DOUBAO_CONFIG, systemPrompt, userInput, agentName, temperature);
}

/**
 * 调用 OpenAI API 获取响应
 * @param systemPrompt 系统提示词
 * @param userInput 用户输入
 * @param agentName Agent 名称（用于日志）
 * @param temperature 温度参数
 */
export async function callOpenAIAPI(
  systemPrompt: string,
  userInput: string,
  agentName: string = 'Agent',
  temperature: number = 0.7
): Promise<string> {
  return callLLMAPI(OPENAI_CONFIG, systemPrompt, userInput, agentName, temperature);
}

/**
 * 通用的 LLM 完成生成函数
 * @param prompt 用户提示词
 * @param systemPrompt 系统提示词（可选）
 * @param temperature 温度参数
 * @param model 模型ID（可选）
 */
export async function generateCompletion(
  prompt: string,
  systemPrompt: string = '你是一个专业的助手。',
  temperature: number = 0.7,
  model?: string
): Promise<string> {
  const provider = model ? getProviderForModel(model) : 'doubao';
  
  if (provider === 'openai') {
    return await callOpenAIAPI(
      systemPrompt,
      prompt,
      'LLM',
      temperature
    );
  } else {
    return await callDoubaoAPI(
      systemPrompt,
      prompt,
      'LLM',
      temperature
    );
  }
}

/**
 * 判断模型属于哪个API提供商
 * @param modelId 模型ID
 * @returns 提供商名称 'doubao' 或 'openai'
 */
function getProviderForModel(modelId: string): 'doubao' | 'openai' {
  if (!modelId) return 'doubao';
  
  const doubaoKeywords = ['doubao', 'volcengine', 'ark'];
  for (const keyword of doubaoKeywords) {
    if (modelId.toLowerCase().includes(keyword)) {
      return 'doubao';
    }
  }
  
  const openaiKeywords = ['gpt', 'dall-e', 'text-', 'gpt-'];
  for (const keyword of openaiKeywords) {
    if (modelId.toLowerCase().includes(keyword)) {
      return 'openai';
    }
  }
  
  return 'doubao';
}

/**
 * 获取 Agent 的配置并调用 LLM
 * @param agentId Agent ID
 * @param userInput 用户输入
 */
export async function executeAgentWithLLM(
  agentId: string,
  userInput: string
): Promise<string> {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  updateAgentStats(agentId);

  const systemPrompt = agent.system_prompt || `你是一个专业的${agent.name || 'IT运维'}助手。`;
  const temperature = agent.temperature || 0.7;
  const model = agent.model || 'doubao-4o';
  const provider = getProviderForModel(model);

  if (provider === 'openai') {
    return await callOpenAIAPI(
      systemPrompt,
      userInput,
      agent.name,
      temperature
    );
  } else {
    return await callDoubaoAPI(
      systemPrompt,
      userInput,
      agent.name,
      temperature
    );
  }
}

/**
 * 检查 LLM 服务是否可用
 */
export async function checkLLMAvailability(): Promise<{ available: boolean; message: string }> {
  const apiKey = getApiKey(db, 'DOUBAO_API_KEY', 'DOUBAO_API_KEY');
  
  if (!apiKey || apiKey === 'your-doubao-api-key-here') {
    return { available: false, message: 'API Key not configured' };
  }
  
  if (!circuitBreaker.canCall()) {
    return { available: false, message: 'Circuit breaker is open - service currently unavailable' };
  }
  
  return { available: true, message: 'LLM service available' };
}

export { circuitBreaker };
