import { db } from '../database';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

function getUserConfiguredModel(): string | null {
  try {
    const doubaoKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_API_KEY') as { value: string } | undefined;
    if (doubaoKeyResult && doubaoKeyResult.value && doubaoKeyResult.value !== 'your-doubao-api-key-here') {
      const doubaoModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('DOUBAO_MODEL') as { value: string } | undefined;
      if (doubaoModelResult && doubaoModelResult.value) {
        return doubaoModelResult.value;
      }
      return 'doubao-4o';
    }
    const openaiKeyResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_API_KEY') as { value: string } | undefined;
    if (openaiKeyResult && openaiKeyResult.value && openaiKeyResult.value !== 'your-openai-api-key-here') {
      const openaiModelResult = db.prepare('SELECT value FROM settings WHERE key = ?').get('OPENAI_MODEL') as { value: string } | undefined;
      if (openaiModelResult && openaiModelResult.value) {
        return openaiModelResult.value;
      }
      return 'gpt-4o';
    }
  } catch {
    logger.info('检查用户配置的模型时出错，不设置默认模型');
  }
  return null;
}

export function initializePresetAgents() {
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
