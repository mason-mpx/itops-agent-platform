import { randomUUID } from 'crypto';
import db from '../models/database';
import { logger } from '../utils/logger';
import { callDoubaoAPI } from './llmService';

interface AgentDB {
  id: string;
  name: string;
  role?: string;
  description?: string;
  system_prompt?: string;
  temperature?: number;
  enabled?: number;
}

interface AgentCollaborationContext {
  taskId: string;
  currentAgentId: string;
  currentAgentName: string;
  conversationHistory: CollaborationMessage[];
  context: Record<string, unknown>;
  startTime: number;
}

interface CollaborationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  name?: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class MultiAgentOrchestrator {
  private context: AgentCollaborationContext;
  private maxRounds: number = 10;
  private maxThinkingTime: number = 5 * 60 * 1000; // 5分钟

  constructor(taskId: string, initialContext: Record<string, unknown> = {}) {
    this.context = {
      taskId,
      currentAgentId: '',
      currentAgentName: '',
      conversationHistory: [],
      context: initialContext,
      startTime: Date.now()
    };
  }

  /**
   * 智能路由：决定由哪个Agent处理当前任务
   */
  async routeToBestAgent(
    userQuery: string,
    availableAgents: AgentDB[]
  ): Promise<string> {
    if (availableAgents.length === 0) {
      throw new Error('No agents available');
    }

    // 如果只有一个Agent，直接返回
    if (availableAgents.length === 1) {
      return availableAgents[0].id;
    }

    // 使用LLM智能路由
    const agentDescriptions = availableAgents.map(agent => 
      `${agent.name} (${agent.id}): ${agent.role || agent.description || '通用Agent'}`
    ).join('\n');

    const routingPrompt = `你是一个智能任务分发器，需要将用户请求分发给最适合的Agent处理。

可用的Agent列表:
${agentDescriptions}

用户请求: ${userQuery}

请选择最适合处理此请求的Agent，只返回Agent的ID，不要其他内容。`;

    try {
      const result = await callDoubaoAPI(
        routingPrompt,
        '你是一个智能的Agent选择助手，擅长将任务分配给最适合的专家。',
        'Agent Router',
        0.3
      );

      // 解析返回的Agent ID
      const matchedAgent = availableAgents.find(agent => 
        result.includes(agent.id) || result.includes(agent.name)
      );

      if (matchedAgent) {
        return matchedAgent.id;
      }

      // 如果没有匹配到，返回第一个启用的Agent
      return availableAgents.find((a) => a.enabled)?.id || availableAgents[0].id;
    } catch {
      logger.error('Agent routing failed, falling back to first agent');
      return availableAgents[0].id;
    }
  }

  /**
   * 多Agent协作解决问题
   */
  async collaborate(
    initialQuery: string,
    agentIds: string[],
    options: { 
      enableRAG?: boolean;
      enableToolUse?: boolean;
      maxRounds?: number;
    } = {}
  ): Promise<CollaborationMessage[]> {
    const {
      enableRAG = true,
      maxRounds = 5
    } = options;

    this.maxRounds = maxRounds;

    // 获取所有参与的Agent
    const agents = agentIds.map(id => 
      db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    ).filter(Boolean);

    if (agents.length === 0) {
      throw new Error('No valid agents found');
    }

    // 初始化对话
    this.context.conversationHistory.push({
      role: 'user',
      content: initialQuery,
      timestamp: Date.now()
    });

    // RAG知识检索
    if (enableRAG) {
      const knowledge = await this.retrieveRelevantKnowledge(initialQuery);
      if (knowledge.length > 0) {
        this.context.conversationHistory.push({
          role: 'system',
          name: 'Knowledge Base',
          content: `以下是从知识库中检索到的相关信息：\n\n${knowledge.map(k => `- ${k.title}\n  ${k.content}`).join('\n\n')}`,
          timestamp: Date.now()
        });
      }
    }

    // 智能选择主要负责Agent
    const primaryAgentId = await this.routeToBestAgent(initialQuery, agents as AgentDB[]);
    this.context.currentAgentId = primaryAgentId;
    
    const primaryAgent = agents.find(a => (a as AgentDB).id === primaryAgentId);
    this.context.currentAgentName = (primaryAgent as AgentDB)?.name || 'Unknown';

    // 开始协作对话
    let currentRound = 0;
    let shouldContinue = true;

    while (shouldContinue && currentRound < this.maxRounds) {
      currentRound++;

      // 检查是否超时
      if (Date.now() - this.context.startTime > this.maxThinkingTime) {
        this.context.conversationHistory.push({
          role: 'system',
          content: '协作已超时，正在总结结果...',
          timestamp: Date.now()
        });
        break;
      }

      // 当前Agent处理
      const result = await this.processAgentTurn(agents as AgentDB[]);
      
      if (result.type === 'final') {
        shouldContinue = false;
      } else if (result.type === 'delegate') {
        // 委托给其他Agent
        this.context.currentAgentId = result.delegateTo || '';
        const nextAgent = agents.find(a => (a as AgentDB).id === result.delegateTo);
        this.context.currentAgentName = (nextAgent as AgentDB)?.name || 'Unknown';
      }

      // 检查是否需要继续
      shouldContinue = shouldContinue && !this.isTaskComplete();
    }

    // 生成最终总结
    await this.generateFinalSummary();

    return this.context.conversationHistory;
  }

  /**
   * 单个Agent的处理回合
   */
  private async processAgentTurn(
    agents: AgentDB[]
  ): Promise<{ type: 'continue' | 'final' | 'delegate', delegateTo?: string }> {
    const currentAgent = agents.find(a => a.id === this.context.currentAgentId);
    if (!currentAgent) {
      throw new Error('Current agent not found');
    }

    // 构建对话历史
    const conversation = this.formatConversationForAgent(currentAgent);
    
    try {
      // 调用Agent
      const response = await callDoubaoAPI(
        conversation,
        currentAgent.system_prompt || '你是一个专业的IT运维助手。',
        currentAgent.name,
        currentAgent.temperature || 0.7
      );

      // 记录响应
      this.context.conversationHistory.push({
        role: 'assistant',
        name: currentAgent.name,
        content: response,
        timestamp: Date.now()
      });

      // 解析响应，判断下一步
      return this.parseAgentResponse(response, agents);

    } catch (error) {
      logger.error(`Agent ${currentAgent.name} failed:`, error);
      
      this.context.conversationHistory.push({
        role: 'system',
        content: `Agent ${currentAgent.name} 执行出错: ${(error as Error).message}`,
        timestamp: Date.now()
      });

      return { type: 'continue' };
    }
  }

  /**
   * 从知识库检索相关信息
   */
  private async retrieveRelevantKnowledge(query: string): Promise<Array<{ score: number; [key: string]: unknown }>> {
    try {
      const allKnowledge = db.prepare('SELECT * FROM knowledge_base ORDER BY usage_count DESC LIMIT 20').all() as Array<{
        id: string;
        title: string;
        content: string;
        category: string;
        usage_count: number;
      }>;
      
      if (allKnowledge.length === 0) return [];

      // 简单关键词匹配（真实生产环境应该用向量数据库）
      const queryLower = query.toLowerCase();
      const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);

      const scoredKnowledge = allKnowledge.map(k => {
        const searchFields = `${k.title} ${k.content} ${k.category}`.toLowerCase();
        let score = 0;
        
        for (const keyword of keywords) {
          if (searchFields.includes(keyword)) {
            score += 1;
          }
        }

        // 增加基于使用量的权重
        score += Math.min((k.usage_count || 0) * 0.1, 2);

        return { ...k, score };
      }).filter(k => k.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

      return scoredKnowledge;

    } catch (error) {
      logger.error('Knowledge retrieval failed:', error);
      return [];
    }
  }

  /**
   * 格式化对话历史供Agent使用
   */
  private formatConversationForAgent(currentAgent: AgentDB): string {
    const formatted = this.context.conversationHistory.map(msg => {
      const prefix = msg.name ? `[${msg.name}]` : msg.role;
      return `${prefix}: ${msg.content}`;
    }).join('\n\n');

    return `当前时间: ${new Date().toLocaleString('zh-CN')}

你是 ${currentAgent.name}，你的专业领域是: ${currentAgent.role || 'IT运维'}

对话历史:
${formatted}

请根据对话历史继续处理任务。如果你认为需要其他专业Agent的帮助，可以明确提出要咨询哪个Agent。如果你认为任务已完成，可以输出"任务完成"并给出总结。`;
  }

  /**
   * 解析Agent响应，决定下一步
   */
  private parseAgentResponse(
    response: string,
    agents: AgentDB[]
  ): { type: 'continue' | 'final' | 'delegate', delegateTo?: string } {
    
    // 检查是否任务完成
    if (response.includes('任务完成') || 
        response.includes('已完成') || 
        response.includes('总结:')) {
      return { type: 'final' };
    }

    // 检查是否需要委托给其他Agent
    for (const agent of agents) {
      if (agent.id !== this.context.currentAgentId) {
        if (response.includes(agent.name) || 
            (agent.role && response.includes(agent.role))) {
          return { type: 'delegate', delegateTo: agent.id };
        }
      }
    }

    return { type: 'continue' };
  }

  /**
   * 检查任务是否完成
   */
  private isTaskComplete(): boolean {
    const recentMessages = this.context.conversationHistory.slice(-3);
    return recentMessages.some(msg => 
      msg.content.includes('任务完成') || 
      msg.content.includes('已完成所有步骤') ||
      msg.content.includes('问题已解决')
    );
  }

  /**
   * 生成最终总结
   */
  private async generateFinalSummary(): Promise<void> {
    const conversationText = this.context.conversationHistory.map(msg => 
      `${msg.name || msg.role}: ${msg.content}`
    ).join('\n\n');

    const summaryPrompt = `请对以下多Agent协作过程进行总结，包括：
1. 问题概述
2. 主要发现
3. 解决方案
4. 后续建议

对话历史:
${conversationText}

请提供一个专业、结构化的总结报告。`;

    try {
      const summary = await callDoubaoAPI(
        summaryPrompt,
        '你是一个专业的报告生成助手，擅长总结复杂的技术讨论。',
        'Summary Generator',
        0.5
      );

      this.context.conversationHistory.push({
        role: 'assistant',
        name: '系统总结',
        content: summary,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Summary generation failed:', error);
    }
  }

  /**
   * 将Agent协作结果存入知识库
   */
  async saveToKnowledgeBase(title: string, category: string = '协作案例'): Promise<string> {
    const conversationText = this.context.conversationHistory.map(msg => 
      `**${msg.name || msg.role}** (${new Date(msg.timestamp).toLocaleString()}):\n${msg.content}\n`
    ).join('\n');

    const id = randomUUID();
    
    db.prepare(`
      INSERT INTO knowledge_base (id, title, category, content, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, title, category, conversationText);

    return id;
  }

  /**
   * 获取协作上下文
   */
  getContext(): AgentCollaborationContext {
    return { ...this.context };
  }
}

/**
 * Agent间消息传递工具
 */
class AgentMessageBus {
  private messages: Map<string, CollaborationMessage[]> = new Map();

  sendMessage(
    fromAgent: string,
    toAgent: string,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    const key = `${fromAgent}:${toAgent}`;
    if (!this.messages.has(key)) {
      this.messages.set(key, []);
    }

    this.messages.get(key)!.push({
      role: 'assistant',
      name: fromAgent,
      content,
      timestamp: Date.now(),
      metadata
    });
  }

  getMessages(fromAgent: string, toAgent: string): CollaborationMessage[] {
    return this.messages.get(`${fromAgent}:${toAgent}`) || [];
  }
}

// 导出
export {
  MultiAgentOrchestrator,
  AgentMessageBus,
  CollaborationMessage,
  AgentCollaborationContext
};
