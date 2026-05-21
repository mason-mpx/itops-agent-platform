import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit, Trash2, Server, Terminal, CheckCircle2,
  AlertCircle, ShieldCheck, Wifi, History, Clock
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';

interface Server {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  use_ssh_key: number;
  description?: string;
  tags?: string[];
  enabled: number;
  last_connected?: string;
  created_at: string;
}

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
  duration: number;
  aiAnalysis?: string;
}

interface CommandHistoryItem {
  id: string;
  server_id: string;
  command: string;
  stdout: string;
  stderr: string;
  success: number;
  execution_time_ms: number;
  executed_by: string;
  executed_at: string;
}

interface ComplianceCheck {
  id: string;
  server_id: string;
  check_name: string;
  check_results: string;
  status: string;
  started_at: string;
  completed_at: string;
  created_at: string;
}

export default function Servers() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    port: 22,
    username: '',
    password: '',
    private_key: '',
    use_ssh_key: false,
    description: '',
    tags: ''
  });
  const [command, setCommand] = useState('');
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [complianceResults, setComplianceResults] = useState<Record<string, CommandResult> | null>(null);
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const [activeTab, setActiveTab] = useState<'servers' | 'compliance' | 'command-history' | 'compliance-history'>('servers');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as Server[];
    },
  });

  // 获取所有唯一的标签
  const allTags = Array.from(new Set(
    (servers || []).flatMap((server: Server) => server.tags || [])
  )).sort();

  // 根据选中的标签筛选服务器
  const filteredServers = selectedTag
    ? (servers || []).filter((server: Server) => (server.tags || []).includes(selectedTag))
    : (servers || []);

  const { data: commandHistory, refetch: refetchCommandHistory } = useQuery({
    queryKey: ['commandHistory', selectedServer?.id],
    queryFn: async () => {
      if (!selectedServer) return [];
      const res = await api.get(`/api/servers/${selectedServer.id}/command-history`);
      return res.data.data as CommandHistoryItem[];
    },
    enabled: !!selectedServer && activeTab === 'command-history',
  });

  const { data: complianceHistory, refetch: refetchComplianceHistory } = useQuery({
    queryKey: ['complianceHistory', selectedServer?.id],
    queryFn: async () => {
      if (!selectedServer) return [];
      const res = await api.get(`/api/servers/${selectedServer.id}/compliance-history`);
      return res.data.data as ComplianceCheck[];
    },
    enabled: !!selectedServer && activeTab === 'compliance-history',
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()) : []
      };
      const res = await api.post('/api/servers', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      resetForm();
      setIsModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const payload = {
        ...data,
        tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()) : undefined
      };
      const res = await api.put(`/api/servers/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      resetForm();
      setIsModalOpen(false);
      setSelectedServer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/servers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/server-commands/${id}/test`);
      return res.data;
    },
  });

  const executeCommandMutation = useMutation({
    mutationFn: async ({ id, command }: { id: string; command: string }) => {
      const res = await api.post(`/api/server-commands/${id}/exec`, { command });
      return res.data;
    },
    onSuccess: () => {
      refetchCommandHistory();
    },
  });

  const runComplianceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/server-commands/${id}/compliance`);
      return res.data;
    },
    onSuccess: () => {
      refetchComplianceHistory();
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      hostname: '',
      port: 22,
      username: '',
      password: '',
      private_key: '',
      use_ssh_key: false,
      description: '',
      tags: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedServer) {
      updateMutation.mutate({ id: selectedServer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (server: Server) => {
    setSelectedServer(server);
    setFormData({
      name: server.name,
      hostname: server.hostname,
      port: server.port,
      username: server.username,
      password: '',
      private_key: '',
      use_ssh_key: !!server.use_ssh_key,
      description: server.description || '',
      tags: server.tags ? server.tags.join(', ') : ''
    });
    setIsModalOpen(true);
  };

  const handleTestConnection = (server: Server) => {
    testConnectionMutation.mutate(server.id, {
      onSuccess: (data) => {
        alert(data.data.message);
      },
    });
  };

  const handleExecuteCommand = () => {
    if (!selectedServer || !command) return;
    setIsExecuting(true);
    executeCommandMutation.mutate(
      { id: selectedServer.id, command },
      {
        onSuccess: (data) => {
          setCommandResult(data.data);
        },
        onSettled: () => {
          setIsExecuting(false);
        },
      }
    );
  };

  const handleRunCompliance = (server: Server) => {
    setSelectedServer(server);
    setIsRunningCompliance(true);
    setActiveTab('compliance');
    runComplianceMutation.mutate(
      server.id,
      {
        onSuccess: (data) => {
          setComplianceResults(data.data);
        },
        onSettled: () => {
          setIsRunningCompliance(false);
        },
      }
    );
  };

  const renderTabContent = () => {
    if (activeTab === 'servers') {
      return (
        <>
          {/* 标签筛选器 */}
          {allTags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag(null)}
                className={clsx(
                  'px-3 py-1 rounded-full text-sm transition-colors',
                  !selectedTag
                    ? 'bg-primary text-white'
                    : 'bg-background border border-border text-text-secondary hover:bg-surface'
                )}
              >
                全部
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-sm transition-colors',
                    selectedTag === tag
                      ? 'bg-primary text-white'
                      : 'bg-background border border-border text-text-secondary hover:bg-surface'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-surface border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-border rounded w-1/2 mb-2" />
                  <div className="h-3 bg-border rounded w-3/4" />
                </div>
              ))
            ) : filteredServers.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
                <Server className="w-12 h-12 mb-4 opacity-50" />
                <p>{selectedTag ? `没有带标签 "${selectedTag}" 的服务器` : '暂无服务器，请添加第一个服务器'}</p>
              </div>
            ) : filteredServers.map((server) => (
              <div key={server.id} className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Server className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-text-primary">{server.name}</h3>
                      <p className="text-xs text-text-secondary">{server.hostname}:{server.port}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTestConnection(server)}
                      className="p-1 hover:bg-background rounded transition-colors"
                      title="测试连接"
                    >
                      <Wifi className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button
                      onClick={() => handleEdit(server)}
                      className="p-1 hover:bg-background rounded transition-colors"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(server.id)}
                      className="p-1 hover:bg-background rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4 text-text-secondary" />
                    </button>
                  </div>
                </div>
                {server.description && (
                  <p className="text-xs text-text-secondary mb-3">{server.description}</p>
                )}
                
                {/* 标签展示 */}
                {server.tags && server.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {server.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-2 mb-3">
                  {server.last_connected ? (
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <CheckCircle2 className="w-3 h-3 text-status-success" />
                      最后连接: {new Date(server.last_connected).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <AlertCircle className="w-3 h-3 text-status-warning" />
                      未连接过
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedServer(server);
                      setCommandResult(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-background rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Terminal className="w-4 h-4" />
                    执行命令
                  </button>
                  <button
                    onClick={() => handleRunCompliance(server)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    合规检查
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      setSelectedServer(server);
                      setActiveTab('command-history');
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-background rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <History className="w-3 h-3" />
                    命令历史
                  </button>
                  <button
                    onClick={() => {
                      setSelectedServer(server);
                      setActiveTab('compliance-history');
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-background rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Clock className="w-3 h-3" />
                    检查历史
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      );
    } else if (activeTab === 'compliance' && selectedServer) {
      return (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-text-primary">合规检查结果</h2>
              <p className="text-sm text-text-secondary">{selectedServer.name} - {selectedServer.hostname}</p>
            </div>
            {isRunningCompliance && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                正在执行检查...
              </div>
            )}
          </div>
          {complianceResults ? (
            <div className="space-y-4">
              {Object.entries(complianceResults).map(([checkName, result]) => (
                <div key={checkName} className="bg-background rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-text-primary">
                      {checkName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h4>
                    <span className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      result.success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                    )}>
                      {result.success ? '成功' : '失败'}
                    </span>
                  </div>
                  
                  {/* AI 分析结果 */}
                  {result.aiAnalysis && (
                    <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 text-primary">🤖</div>
                        <span className="text-sm font-medium text-primary">AI 分析建议</span>
                      </div>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap">{result.aiAnalysis}</p>
                    </div>
                  )}
                  
                  <details className="mt-2">
                    <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                      查看原始命令和输出
                    </summary>
                    <div className="mt-2">
                      <div className="text-sm text-text-secondary mb-1">命令: <code className="font-mono text-xs bg-surface px-1 rounded">{result.command}</code></div>
                      {result.stdout && (
                        <div className="mt-2">
                          <p className="text-xs text-text-secondary mb-1">输出:</p>
                          <pre className="bg-surface p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-40 overflow-y-auto">
                            {result.stdout}
                          </pre>
                        </div>
                      )}
                      {result.stderr && (
                        <div className="mt-2">
                          <p className="text-xs text-status-warning mb-1">错误:</p>
                          <pre className="bg-status-failed/5 p-3 rounded text-xs overflow-x-auto text-status-failed font-mono max-h-40 overflow-y-auto">
                            {result.stderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-text-secondary">
              <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>点击"合规检查"按钮开始执行检查</p>
            </div>
          )}
        </div>
      );
    } else if (activeTab === 'command-history' && selectedServer) {
      const handleExportCommandHistory = async () => {
        try {
          const response = await api.get(`/api/servers/${selectedServer.id}/command-history/export`, {
            responseType: 'blob'
          });
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `command-history-${selectedServer.id}-${Date.now()}.json`);
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          console.error('导出失败:', error);
        }
      };

      return (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary">命令历史 - {selectedServer.name}</h2>
            <button
              onClick={handleExportCommandHistory}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <span>📥</span>
              导出历史
            </button>
          </div>
          <div className="space-y-4">
            {commandHistory?.map((item) => (
              <div key={item.id} className="bg-background rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-text-secondary" />
                    <span className="text-xs text-text-secondary">
                      {new Date(item.executed_at).toLocaleString()}
                    </span>
                  </div>
                  <span className={clsx(
                    'px-2 py-1 rounded text-xs font-medium',
                    item.success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                  )}>
                    {item.success ? '成功' : '失败'}
                  </span>
                </div>
                <div className="mb-2">
                  <code className="font-mono text-sm bg-surface px-2 py-1 rounded text-text-primary">
                    {item.command}
                  </code>
                </div>
                {item.stdout && (
                  <details className="mt-2">
                    <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                      输出 ({item.stdout.length} 字符)
                    </summary>
                    <pre className="mt-2 bg-surface p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-40 overflow-y-auto">
                      {item.stdout}
                    </pre>
                  </details>
                )}
                {item.stderr && (
                  <details className="mt-2">
                    <summary className="text-xs text-status-warning cursor-pointer hover:text-text-primary">
                      错误 ({item.stderr.length} 字符)
                    </summary>
                    <pre className="mt-2 bg-status-failed/5 p-3 rounded text-xs overflow-x-auto text-status-failed font-mono max-h-40 overflow-y-auto">
                      {item.stderr}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {(!commandHistory || commandHistory.length === 0) && (
              <div className="text-center py-12 text-text-secondary">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暂无命令历史</p>
              </div>
            )}
          </div>
        </div>
      );
    } else if (activeTab === 'compliance-history' && selectedServer) {
      const handleExportComplianceHistory = async () => {
        try {
          const response = await api.get(`/api/servers/${selectedServer.id}/compliance-history/export`, {
            responseType: 'blob'
          });
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `compliance-history-${selectedServer.id}-${Date.now()}.json`);
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          console.error('导出失败:', error);
        }
      };

      return (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary">合规检查历史 - {selectedServer.name}</h2>
            <button
              onClick={handleExportComplianceHistory}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <span>📥</span>
              导出历史
            </button>
          </div>
          <div className="space-y-4">
            {complianceHistory?.map((check) => (
              <div key={check.id} className="bg-background rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-text-primary">{check.check_name}</h4>
                  <span className={clsx(
                    'px-2 py-1 rounded text-xs font-medium',
                    check.status === 'completed' ? 'bg-status-success/10 text-status-success' : 
                    check.status === 'running' ? 'bg-status-running/10 text-status-running' : 
                    'bg-status-failed/10 text-status-failed'
                  )}>
                    {check.status === 'completed' ? '已完成' : check.status === 'running' ? '执行中' : '失败'}
                  </span>
                </div>
                <div className="text-xs text-text-secondary space-y-1">
                  <p>开始: {check.started_at ? new Date(check.started_at).toLocaleString() : '-'}</p>
                  <p>完成: {check.completed_at ? new Date(check.completed_at).toLocaleString() : '-'}</p>
                </div>
                {check.check_results && (
                  <details className="mt-3">
                    <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                      查看结果
                    </summary>
                    <pre className="mt-2 bg-surface p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-60 overflow-y-auto">
                      {check.check_results}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {(!complianceHistory || complianceHistory.length === 0) && (
              <div className="text-center py-12 text-text-secondary">
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暂无合规检查历史</p>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">服务器管理</h1>
            <p className="text-text-secondary">管理和监控您的服务器</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setSelectedServer(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加服务器
          </button>
        </div>

        {/* 标签页导航 */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => {
              setActiveTab('servers');
              setSelectedServer(null);
            }}
            className={clsx(
              'px-4 py-2 border-b-2 text-sm transition-colors',
              activeTab === 'servers'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            服务器列表
          </button>
          {selectedServer && (
            <>
              <button
                onClick={() => setActiveTab('compliance')}
                className={clsx(
                  'px-4 py-2 border-b-2 text-sm transition-colors',
                  activeTab === 'compliance'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                合规检查
              </button>
              <button
                onClick={() => setActiveTab('command-history')}
                className={clsx(
                  'px-4 py-2 border-b-2 text-sm transition-colors',
                  activeTab === 'command-history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                命令历史
              </button>
              <button
                onClick={() => setActiveTab('compliance-history')}
                className={clsx(
                  'px-4 py-2 border-b-2 text-sm transition-colors',
                  activeTab === 'compliance-history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                检查历史
              </button>
            </>
          )}
        </div>

        {/* 内容区域 */}
        {renderTabContent()}

        {/* 命令执行模态框 */}
        {selectedServer && (activeTab === 'servers' || activeTab === 'compliance') && commandResult !== null && (
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">命令执行结果</h3>
              <button
                onClick={() => setCommandResult(null)}
                className="p-1 hover:bg-background rounded transition-colors"
              >
                <Trash2 className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-secondary mb-1">执行的命令:</p>
                <code className="font-mono text-sm bg-background px-2 py-1 rounded text-text-primary">
                  {commandResult.command}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">状态:</span>
                <span className={clsx(
                  'px-2 py-1 rounded text-xs font-medium',
                  commandResult.success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                )}>
                  {commandResult.success ? '成功' : '失败'}
                </span>
                <span className="text-xs text-text-secondary ml-4">
                  耗时: {commandResult.duration}ms
                </span>
              </div>
              {commandResult.stdout && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">输出:</p>
                  <pre className="bg-background p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-60 overflow-y-auto">
                    {commandResult.stdout}
                  </pre>
                </div>
              )}
              {commandResult.stderr && (
                <div>
                  <p className="text-xs text-status-warning mb-1">错误:</p>
                  <pre className="bg-status-failed/5 p-3 rounded text-xs overflow-x-auto text-status-failed font-mono max-h-60 overflow-y-auto">
                    {commandResult.stderr}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 快速命令执行区域 */}
        {selectedServer && (activeTab === 'servers' || activeTab === 'compliance') && (
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              在 {selectedServer.name} 上执行命令
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">命令</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="输入要执行的命令..."
                    className="flex-1 px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    disabled={isExecuting}
                  />
                  <button
                    onClick={handleExecuteCommand}
                    disabled={!command || isExecuting}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        执行中...
                      </>
                    ) : (
                      <>
                        <Terminal className="w-4 h-4" />
                        执行
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-text-secondary">常用命令:</span>
                {['uname -a', 'df -h', 'free -h', 'uptime', 'whoami', 'ps aux'].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => setCommand(cmd)}
                    className="px-2 py-1 bg-background border border-border rounded text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 添加/编辑服务器模态框 */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-text-primary mb-6">
                {selectedServer ? '编辑服务器' : '添加服务器'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">名称 *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例如: 生产服务器"
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">主机名/IP *</label>
                    <input
                      type="text"
                      value={formData.hostname}
                      onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                      placeholder="例如: 192.168.1.100"
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">端口</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                      placeholder="22"
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">用户名 *</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="例如: root"
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="use_ssh_key"
                    checked={formData.use_ssh_key}
                    onChange={(e) => setFormData({ ...formData, use_ssh_key: e.target.checked })}
                    className="rounded border-border"
                  />
                  <label htmlFor="use_ssh_key" className="text-sm text-text-secondary">使用 SSH 密钥</label>
                </div>

                {!formData.use_ssh_key ? (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">密码</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={selectedServer ? '留空以保持不变' : '输入密码'}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">SSH 私钥</label>
                    <textarea
                      value={formData.private_key}
                      onChange={(e) => setFormData({ ...formData, private_key: e.target.value })}
                      placeholder={selectedServer ? '留空以保持不变' : '粘贴您的私钥...'}
                      rows={6}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary font-mono text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">描述</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="服务器描述..."
                    rows={3}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    标签 (用逗号分隔)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="例如: 生产, Linux, Web"
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                      setSelectedServer(null);
                    }}
                    className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {selectedServer ? '保存更改' : '添加服务器'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
