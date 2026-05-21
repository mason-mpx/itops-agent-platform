import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../models/database';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM knowledge_base';
    const params: any[] = [];
    
    const conditions = [];
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (search) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY usage_count DESC, created_at DESC';
    
    const knowledge = db.prepare(query).all(...params);
    knowledge.forEach((k: any) => {
      if (k.tags) k.tags = JSON.parse(k.tags);
      if (k.solutions) k.solutions = JSON.parse(k.solutions);
      if (k.related_alerts) k.related_alerts = JSON.parse(k.related_alerts);
    });
    res.json({ success: true, data: knowledge });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch knowledge' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { title, category, tags, content, solutions, related_alerts } = req.body;
    const id = randomUUID();
    
    db.prepare(`
      INSERT INTO knowledge_base (id, title, category, tags, content, solutions, related_alerts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      category,
      JSON.stringify(tags || []),
      content,
      JSON.stringify(solutions || []),
      JSON.stringify(related_alerts || [])
    );
    
    const knowledge = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: knowledge });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create knowledge entry' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { title, category, tags, content, solutions, related_alerts } = req.body;
    
    db.prepare(`
      UPDATE knowledge_base 
      SET title = ?, category = ?, tags = ?, content = ?, 
          solutions = ?, related_alerts = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title,
      category,
      JSON.stringify(tags || []),
      content,
      JSON.stringify(solutions || []),
      JSON.stringify(related_alerts || []),
      req.params.id
    );
    
    const knowledge = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: knowledge });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update knowledge entry' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Knowledge entry deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete knowledge entry' });
  }
});

router.get('/search', (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }
    
    const knowledge = db.prepare(`
      SELECT * FROM knowledge_base 
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY usage_count DESC
    `).all(`%${q}%`, `%${q}%`);
    
    knowledge.forEach((k: any) => {
      if (k.tags) k.tags = JSON.parse(k.tags);
      if (k.solutions) k.solutions = JSON.parse(k.solutions);
    });
    
    res.json({ success: true, data: knowledge });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to search knowledge' });
  }
});

export default router;
