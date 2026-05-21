import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../models/database';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM scripts WHERE 1=1';
    const params: any[] = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    const scripts = db.prepare(query).all(...params);
    const processedScripts = (scripts as any[]).map(script => ({
      ...script,
      parameters: script.parameters ? JSON.parse(script.parameters) : []
    }));

    res.json({ success: true, data: processedScripts });
  } catch (error) {
    console.error('Error fetching scripts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch scripts' });
  }
});

router.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = db.prepare('SELECT DISTINCT category FROM scripts WHERE category IS NOT NULL').all() as any[];
    res.json({ success: true, data: categories.map(c => c.category) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id);
    if (!script) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }
    const processedScript = {
      ...script as any,
      parameters: (script as any).parameters ? JSON.parse((script as any).parameters) : []
    };
    res.json({ success: true, data: processedScript });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch script' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, type, content, parameters, category } = req.body;
    const id = randomUUID();

    db.prepare(`
      INSERT INTO scripts (id, name, description, type, content, parameters, category, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      name,
      description,
      type,
      content,
      parameters ? JSON.stringify(parameters) : null,
      category
    );

    const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
    const processedScript = {
      ...script as any,
      parameters: (script as any).parameters ? JSON.parse((script as any).parameters) : []
    };

    res.status(201).json({ success: true, data: processedScript });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create script' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, description, type, content, parameters, category } = req.body;

    db.prepare(`
      UPDATE scripts
      SET name = ?, description = ?, type = ?, content = ?,
          parameters = ?, category = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      description,
      type,
      content,
      parameters ? JSON.stringify(parameters) : null,
      category,
      req.params.id
    );

    const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id);
    const processedScript = {
      ...script as any,
      parameters: (script as any).parameters ? JSON.parse((script as any).parameters) : []
    };

    res.json({ success: true, data: processedScript });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update script' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id);
    if (!script) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }

    db.prepare('DELETE FROM scripts WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Script deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete script' });
  }
});

export default router;
