import { Router, Request, Response } from 'express';
import { copilotService } from '../services/copilotService';

const router = Router();

router.get('/suggestions', (_req: Request, res: Response) => {
  try {
    const suggestions = copilotService.getQuickSuggestions();
    res.json({ success: true, data: suggestions });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get suggestions' });
  }
});

router.get('/conversations', (req: Request, res: Response) => {
  try {
    const userId = (req as { user?: { id: string } }).user?.id || 'default';
    const conversations = copilotService.getUserConversations(userId);
    res.json({ success: true, data: conversations });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get conversations' });
  }
});

router.post('/conversations', (req: Request, res: Response) => {
  try {
    const userId = (req as { user?: { id: string } }).user?.id || 'default';
    const conversation = copilotService.createConversation(userId);
    res.status(201).json({ success: true, data: conversation });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create conversation' });
  }
});

router.get('/conversations/:id', (req: Request, res: Response) => {
  try {
    const conversation = copilotService.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }
    res.json({ success: true, data: conversation });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get conversation' });
  }
});

router.delete('/conversations/:id', (req: Request, res: Response) => {
  try {
    const deleted = copilotService.deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }
    res.json({ success: true, message: '对话已删除' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { conversationId, message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: '消息不能为空' });
    }

    const userId = (req as { user?: { id: string } }).user?.id || 'default';
    const response = await copilotService.processNaturalLanguage(
      conversationId,
      message,
      userId
    );

    res.json({ success: true, data: { response } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to process chat' });
  }
});

export default router;
