import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Bot, User, Trash2, MessageSquare, Loader2, X, MinusCircle } from 'lucide-react';
import api from '../lib/api';
import MarkdownOutput from './MarkdownOutput';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  messages: Message[];
}

export default function ChatWidget() {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const { data: suggestions } = useQuery({
    queryKey: ['copilot-suggestions'],
    queryFn: async () => {
      const res = await api.get('/api/copilot/suggestions');
      return res.data.data || [];
    }
  });

  const { data: conversations } = useQuery({
    queryKey: ['copilot-conversations'],
    queryFn: async () => {
      const res = await api.get('/api/copilot/conversations');
      return res.data.data || [];
    }
  });

  const currentConversation = conversations?.find((c: Conversation) => c.id === currentConversationId);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId?: string, message: string }) => {
      const res = await api.post('/api/copilot/chat', {
        conversationId,
        message
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['copilot-conversations'] });
      setInputValue('');
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      console.log('正在创建新对话...');
      const res = await api.post('/api/copilot/conversations');
      console.log('新对话创建响应:', res.data);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        console.log('新对话创建成功:', data.data.id);
        setCurrentConversationId(data.data.id);
        queryClient.invalidateQueries({ queryKey: ['copilot-conversations'] });
      } else {
        console.error('新对话创建失败:', data.error);
        alert(`创建对话失败: ${data.error}`);
      }
    },
    onError: (error) => {
      console.error('创建对话出错:', error);
      alert(`创建对话出错: ${(error as any).message}`);
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/copilot/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['copilot-conversations'] });
      setCurrentConversationId(null);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages, sendMessageMutation.isPending]);

  const handleSend = async (msg?: string) => {
    const message = msg || inputValue;
    if (!message.trim()) return;

    if (!currentConversationId) {
      // 没有对话，先创建对话，再发送消息
      await createConversationMutation.mutateAsync().then((data) => {
        if (data && data.success) {
          sendMessageMutation.mutate({ conversationId: data.data.id, message });
        }
      });
    } else {
      // 有对话，直接发送
      sendMessageMutation.mutate({ conversationId: currentConversationId, message });
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center text-white hover:scale-110 z-50"
      >
        <Bot className="w-7 h-7" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {!isMinimized && (
        <div className="w-[420px] h-[600px] bg-slate-900 rounded-xl shadow-2xl border border-slate-700 flex flex-col mb-3 overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <h3 className="font-semibold text-white">IT运维助手</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:bg-white/20 rounded transition-all"
              >
                <MinusCircle className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded transition-all"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* 对话列表侧边栏 */}
            <div className="w-32 bg-slate-800 border-r border-slate-700 flex flex-col">
              <button
                onClick={() => {
                  console.log('点击了新对话按钮');
                  createConversationMutation.mutate();
                }}
                className="m-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-sm rounded-lg flex items-center justify-center gap-1.5 transition-all"
                disabled={createConversationMutation.isPending}
              >
                {createConversationMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5" />
                )}
                {createConversationMutation.isPending ? '创建中...' : '新对话'}
              </button>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {conversations?.map((c: Conversation) => (
                  <div
                    key={c.id}
                    onClick={() => setCurrentConversationId(c.id)}
                    className={`p-2 rounded-lg cursor-pointer transition-all text-sm ${
                      c.id === currentConversationId
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs">
                        {c.messages[0]?.content?.substring(0, 12) || '新对话'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversationMutation.mutate(c.id);
                        }}
                        className="ml-1 opacity-60 hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 聊天区域 */}
            <div className="flex-1 flex flex-col bg-slate-900">
              {!currentConversationId ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <Bot className="w-12 h-12 text-blue-400 mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">需要帮助？</h3>
                  <p className="text-slate-400 text-sm mb-6">
                    选择或创建对话开始
                  </p>
                  <div className="grid grid-cols-1 gap-2 w-full">
                    {suggestions?.slice(0, 3).map((suggestion: string, index: number) => (
                      <button
                        key={index}
                        onClick={() => {
                          handleSend(suggestion);
                        }}
                        className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-left text-sm text-slate-300 hover:text-white transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* 消息列表 */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {currentConversation?.messages?.map((msg: Message, index: number) => (
                      <div
                        key={index}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="flex items-start gap-2 max-w-[85%]">
                          {msg.role === 'assistant' && (
                            <div className="w-7 h-7 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div className={`p-3 rounded-lg ${
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-200'
                          }`}>
                            {msg.role === 'assistant' ? (
                              <MarkdownOutput content={msg.content} />
                            ) : (
                              <p className="text-sm">{msg.content}</p>
                            )}
                          </div>
                          {msg.role === 'user' && (
                            <div className="w-7 h-7 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {sendMessageMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          </div>
                          <div className="p-3 bg-slate-800 rounded-lg text-slate-300">
                            思考中...
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* 输入区域 */}
                  <div className="p-3 border-t border-slate-700 bg-slate-850">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="输入您的问题..."
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleSend()}
                        disabled={!inputValue.trim()}
                        className="px-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-all"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 最小化/关闭按钮 */}
      <div className="flex gap-2">
        {isMinimized && (
          <>
            <button
              onClick={() => setIsMinimized(false)}
              className="w-14 h-14 bg-slate-800 hover:bg-slate-700 rounded-full shadow-lg border border-slate-700 flex items-center justify-center text-white z-50"
            >
              <MessageSquare className="w-7 h-7" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="w-14 h-14 bg-red-600 hover:bg-red-500 rounded-full shadow-lg flex items-center justify-center text-white z-50"
            >
              <X className="w-7 h-7" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
