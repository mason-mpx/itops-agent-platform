import { randomUUID } from 'crypto';
import db from '../models/database';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  item: KnowledgeItem;
  score: number;
  highlight: string;
}

class EnhancedRAGService {
  private stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'are',
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
  ]);

  /**
   * 智能检索：结合关键词匹配和语义相关度
   */
  async search(
    query: string,
    options: {
      category?: string;
      limit?: number;
      minScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      category,
      limit = 10,
      minScore = 0.1
    } = options;

    let sql = 'SELECT * FROM knowledge_base WHERE 1=1';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY usage_count DESC, created_at DESC LIMIT 50';

    const knowledgeItems = db.prepare(sql).all(...params) as any[];
    
    if (knowledgeItems.length === 0) {
      return [];
    }

    // 对每个结果进行评分
    const scoredResults = knowledgeItems.map(item => {
      const score = this.calculateRelevanceScore(query, item);
      const highlight = this.generateHighlight(query, item);
      
      return {
        item: this.transformItem(item),
        score,
        highlight
      };
    }).filter(result => result.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scoredResults;
  }

  /**
   * 计算相关度分数
   */
  private calculateRelevanceScore(query: string, item: any): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    const contentLower = `${item.title} ${item.content} ${item.category}`.toLowerCase();
    
    // 1. 精确匹配分数（最高）
    if (contentLower.includes(queryLower)) {
      score += 0.5;
    }

    // 2. 关键词匹配
    const keywords = this.extractKeywords(query);
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    if (keywords.length > 0) {
      score += (matchCount / keywords.length) * 0.3;
    }

    // 3. 使用频率权重（常用的知识更重要）
    score += Math.min((item.usage_count || 0) * 0.01, 0.15);

    // 4. 时间衰减因子（新内容略优）
    const itemDate = new Date(item.created_at);
    const now = new Date();
    const daysDiff = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.max(0, 1 - daysDiff / 365); // 一年内的有额外权重
    score += timeDecay * 0.05;

    return Math.min(score, 1.0); // 最高分1.0
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    return text.split(/[\s,.!?，。！？]+/)
      .filter(word => 
        word.length > 1 && 
        !this.stopWords.has(word.toLowerCase())
      );
  }

  /**
   * 生成高亮片段
   */
  private generateHighlight(query: string, item: any): string {
    const content = item.content || '';
    const keywords = this.extractKeywords(query);
    
    if (keywords.length === 0) {
      return content.substring(0, 200) + (content.length > 200 ? '...' : '');
    }

    // 找到第一个关键词的位置
    let bestPosition = -1;

    for (const keyword of keywords) {
      const position = content.toLowerCase().indexOf(keyword.toLowerCase());
      if (position >= 0 && (bestPosition === -1 || position < bestPosition)) {
        bestPosition = position;
      }
    }

    if (bestPosition === -1) {
      return content.substring(0, 200) + (content.length > 200 ? '...' : '');
    }

    // 截取关键词前后的内容
    const start = Math.max(0, bestPosition - 80);
    const end = Math.min(content.length, bestPosition + 120);
    let highlight = content.substring(start, end);

    if (start > 0) highlight = '...' + highlight;
    if (end < content.length) highlight += '...';

    return highlight;
  }

  /**
   * 转换知识库项目格式
   */
  private transformItem(item: any): KnowledgeItem {
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      category: item.category || '未分类',
      tags: item.tags ? JSON.parse(item.tags) : [],
      usageCount: item.usage_count || 0,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    };
  }

  /**
   * 增强知识注入：将相关知识格式化为LLM友好的提示
   */
  async injectKnowledge(
    query: string,
    options: {
      category?: string;
      maxItems?: number;
      minScore?: number;
    } = {}
  ): Promise<{ hasKnowledge: boolean; prompt: string }> {
    const searchResults = await this.search(query, {
      category: options.category,
      limit: options.maxItems || 5,
      minScore: options.minScore || 0.2
    });

    if (searchResults.length === 0) {
      return { hasKnowledge: false, prompt: '' };
    }

    // 增加使用计数
    for (const result of searchResults) {
      try {
        db.prepare(`
          UPDATE knowledge_base 
          SET usage_count = usage_count + 1, 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(result.item.id);
      } catch (error) {
        console.error('Failed to update usage count:', error);
      }
    }

    // 格式化为提示词
    let knowledgePrompt = `📚 以下是从知识库中检索到的相关信息（相关度排序）：\n\n`;
    
    searchResults.forEach((result, index) => {
      knowledgePrompt += `【资料 ${index + 1}】${result.item.title} (相关度: ${Math.round(result.score * 100)}%)\n`;
      knowledgePrompt += `${result.highlight}\n\n`;
    });

    knowledgePrompt += `请根据以上信息和你的专业知识回答问题。如果信息不足以回答问题，请说明。`;

    return { hasKnowledge: true, prompt: knowledgePrompt };
  }

  /**
   * 获取相似知识推荐
   */
  async getSimilarKnowledge(
    knowledgeId: string,
    limit: number = 5
  ): Promise<KnowledgeItem[]> {
    const sourceItem = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(knowledgeId) as any;
    
    if (!sourceItem) {
      return [];
    }

    const searchQuery = `${sourceItem.title} ${sourceItem.category}`;
    const results = await this.search(searchQuery, { limit: limit + 1 });
    
    // 移除源项目自身
    return results
      .filter(r => r.item.id !== knowledgeId)
      .slice(0, limit)
      .map(r => r.item);
  }

  /**
   * 添加知识并自动提取标签
   */
  async addKnowledge(
    title: string,
    content: string,
    category: string = '未分类',
    tags: string[] = []
  ): Promise<string> {
    const id = randomUUID();
    
    // 自动提取标签
    const autoTags = tags.length > 0 
      ? tags 
      : this.extractKeywords(`${title} ${content}`).slice(0, 10);

    db.prepare(`
      INSERT INTO knowledge_base (id, title, content, category, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, title, content, category, JSON.stringify(autoTags));

    return id;
  }

  /**
   * 批量导入知识
   */
  async batchImport(items: Array<{
    title: string;
    content: string;
    category?: string;
    tags?: string[];
  }>): Promise<{ imported: number; failed: number }> {
    let imported = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await this.addKnowledge(
          item.title,
          item.content,
          item.category || '未分类',
          item.tags || []
        );
        imported++;
      } catch (error) {
        console.error('Failed to import knowledge item:', error);
        failed++;
      }
    }

    return { imported, failed };
  }

  /**
   * 获取知识统计
   */
  getStatistics() {
    const totalItems = (db.prepare('SELECT COUNT(*) as count FROM knowledge_base').get() as any).count;
    const categoryStats = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM knowledge_base 
      GROUP BY category
      ORDER BY count DESC
    `).all();
    
    const topItems = db.prepare(`
      SELECT * FROM knowledge_base 
      ORDER BY usage_count DESC, created_at DESC 
      LIMIT 10
    `).all();

    return {
      totalItems,
      categoryStats,
      topItems: (topItems as any[]).map(this.transformItem)
    };
  }
}

export default EnhancedRAGService;
