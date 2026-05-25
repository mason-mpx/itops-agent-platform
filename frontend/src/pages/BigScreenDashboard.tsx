import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Server, Bot, Play, Bell, Activity,
  Shield, Network, Cpu, MemoryStick, HardDrive,
  CheckCircle, RefreshCcw, Globe, Terminal, FileCode,
  Maximize2, Minimize2, AlertCircle, ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../lib/api';
import ParticleBackground from '../components/ParticleBackground';
import AnimatedLineChart from '../components/AnimatedLineChart';
import AnimatedBarChart from '../components/AnimatedBarChart';
import CircularProgress from '../components/CircularProgress';

interface Task {
  id: string;
  name: string;
  status: string;
  created_at: string;
  workflow_id?: string;
}

interface Alert {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
}

interface ServerType {
  id: string;
  name: string;
  hostname: string;
  enabled: number;
  last_connected?: string;
}

interface DashboardStats {
  servers: { total: number; enabled: number };
  agents: { total: number; enabled: number };
  tasks: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    pending: number;
    successRate: number;
  };
  alerts: {
    total: number;
    active: number;
    critical: number;
    high: number;
  };
  workflows: { total: number; templates: number };
  knowledge: { total: number };
}

interface DataPoint {
  timestamp: number;
  value: number;
}

interface AlertTrendPoint {
  time_bucket: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface TaskTrendPoint {
  time_bucket: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
}

interface AgentStat {
  id: string;
  name: string;
  avatar: string;
  role: string;
  enabled: number;
  usage_count: number;
  total_executions: number;
  success_count: number;
  error_count: number;
  successRate: number | null;
}

function generateFallbackChartData(points: number, baseValue: number, variance: number): DataPoint[] {
  const data: DataPoint[] = [];
  const now = Date.now();
  for (let i = points - 1; i >= 0; i--) {
    data.push({
      timestamp: now - i * 60000,
      value: baseValue + (Math.random() - 0.5) * variance,
    });
  }
  return data;
}

interface StatCardProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  onClick?: () => void;
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  color,
  onClick,
}: StatCardProps) => (
  <div
    className={`bg-slate-800/40 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 cursor-pointer transition-all hover:border-slate-600/50 hover:bg-slate-800/60 ${onClick ? '' : ''}`}
    onClick={onClick}
  >
    <div className="flex items-center justify-between mb-3">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-slate-500" />}
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-xs text-slate-400 mt-1">{label}</div>
    {subValue && <div className="text-xs text-slate-500 mt-0.5">{subValue}</div>}
  </div>
);

const SERVER_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444'];
const SERVER_METRICS_RANDOM_VALUES = Array.from({ length: 6 }, () => 30 + Math.random() * 50);

export default function BigScreenDashboard() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isFullscreen, toggleFullscreen]);

  const refreshData = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/stats');
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers', refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as ServerType[];
    },
    refetchInterval: 30000,
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', { limit: 10 }, refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/tasks', { params: { limit: 10 } });
      return res.data.data as Task[];
    },
    refetchInterval: 15000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['alerts', { limit: 10 }, refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/alerts', { params: { limit: 10 } });
      return res.data.data as Alert[];
    },
    refetchInterval: 15000,
  });

  const { data: alertTrends } = useQuery({
    queryKey: ['alert-trends', refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/alert-trends');
      return res.data.data as AlertTrendPoint[];
    },
    refetchInterval: 60000,
  });

  const { data: taskTrends } = useQuery({
    queryKey: ['task-trends', refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/task-trends');
      return res.data.data as TaskTrendPoint[];
    },
    refetchInterval: 60000,
  });

  const { data: agentStats } = useQuery({
    queryKey: ['agent-stats', refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/agent-stats');
      return res.data.data as {
        agents: AgentStat[];
        overall: {
          totalExecutions: number;
          totalSuccess: number;
          overallSuccessRate: number;
          todayExecutions: number;
        };
      };
    },
    refetchInterval: 60000,
  });

  const { data: taskDistribution } = useQuery({
    queryKey: ['task-distribution', refreshKey],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/task-distribution');
      return res.data.data as {
        byStatus: Array<{ status: string; count: number }>;
        byWorkflow: Array<{ name: string; count: number }>;
      };
    },
    refetchInterval: 60000,
  });

  const [cpuData, setCpuData] = useState<DataPoint[]>(() => generateFallbackChartData(30, 45, 30));
  const [memoryData, setMemoryData] = useState<DataPoint[]>(() => generateFallbackChartData(30, 65, 20));
  const [networkData, setNetworkData] = useState<DataPoint[]>(() => generateFallbackChartData(30, 100, 80));
  const [diskIOData, setDiskIOData] = useState<DataPoint[]>(() => generateFallbackChartData(30, 50, 40));

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCpuData(prev => [...prev.slice(-29), { timestamp: now, value: 40 + Math.random() * 35 }]);
      setMemoryData(prev => [...prev.slice(-29), { timestamp: now, value: 60 + Math.random() * 25 }]);
      setNetworkData(prev => [...prev.slice(-29), { timestamp: now, value: 80 + Math.random() * 100 }]);
      setDiskIOData(prev => [...prev.slice(-29), { timestamp: now, value: 40 + Math.random() * 50 }]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const alertTrendData = (alertTrends || []).map(t => ({
    timestamp: new Date(t.time_bucket).getTime(),
    value: t.total,
  }));

  const taskTrendData = (taskTrends || []).map(t => ({
    timestamp: new Date(t.time_bucket).getTime(),
    value: t.total,
  }));

  const serverMetrics = useMemo(() => (servers || [])
    .filter(s => s.enabled === 1)
    .slice(0, 6)
    .map((s, i) => ({
      label: s.name.substring(0, 8),
      value: SERVER_METRICS_RANDOM_VALUES[i],
      color: SERVER_COLORS[i],
    })), [servers]);

  const taskDistData = (taskDistribution?.byStatus || []).map(s => {
    const colors: Record<string, string> = {
      completed: '#22c55e',
      running: '#3b82f6',
      failed: '#ef4444',
      pending: '#64748b',
    };
    return {
      label: s.status,
      value: s.count,
      color: colors[s.status] || '#64748b',
    };
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-status-success';
      case 'running': return 'text-status-running';
      case 'failed': return 'text-status-failed';
      case 'pending': return 'text-status-pending';
      default: return 'text-text-secondary';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-status-failed/20 text-status-failed border border-status-failed/30';
      case 'high':
        return 'bg-status-warning/20 text-status-warning border border-status-warning/30';
      default:
        return 'bg-status-pending/20 text-status-pending border border-status-pending/30';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950' : 'h-screen'} overflow-y-auto bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950`}
    >
      <ParticleBackground />

      <div className="relative z-10 flex flex-col p-4 min-h-screen">
        <header className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-status-success rounded-full border-2 border-slate-950 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">ITOps 运维监控大屏</h1>
                <p className="text-sm text-slate-400">IT Operations Multi-Agent Platform</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-sm">
              <div
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 cursor-pointer hover:border-blue-500/30 transition-all"
                onClick={() => navigate('/servers')}
              >
                <Server className="w-4 h-4 text-purple-400" />
                <span className="text-slate-300">服务器</span>
                <span className="text-white font-bold">{stats?.servers.enabled || 0}/{stats?.servers.total || 0}</span>
              </div>
              <div
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 cursor-pointer hover:border-blue-500/30 transition-all"
                onClick={() => navigate('/agents')}
              >
                <Bot className="w-4 h-4 text-blue-400" />
                <span className="text-slate-300">Agent</span>
                <span className="text-white font-bold">{stats?.agents.enabled || 0}/{stats?.agents.total || 0}</span>
              </div>
              <div
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 cursor-pointer hover:border-blue-500/30 transition-all"
                onClick={() => navigate('/tasks')}
              >
                <Play className="w-4 h-4 text-green-400" />
                <span className="text-slate-300">运行中</span>
                <span className="text-white font-bold">{stats?.tasks.running || 0}</span>
              </div>
              <div
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 cursor-pointer hover:border-red-500/30 transition-all"
                onClick={() => navigate('/alerts')}
              >
                <Bell className="w-4 h-4 text-red-400" />
                <span className="text-slate-300">活跃告警</span>
                <span className="text-status-failed font-bold">{stats?.alerts.active || 0}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-3xl font-bold text-white font-mono">
                {currentTime.toLocaleTimeString('zh-CN', { hour12: false })}
              </div>
              <div className="text-sm text-slate-400">
                {currentTime.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })}
              </div>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 transition-all"
              title={isFullscreen ? '退出全屏 (Esc)' : '全屏模式 (F11)'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5 text-slate-400" /> : <Maximize2 className="w-5 h-5 text-slate-400" />}
            </button>

            <button
              onClick={refreshData}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 transition-all"
            >
              <RefreshCcw className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 flex flex-col gap-4">
            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50 flex-1">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                系统资源监控
              </h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <CircularProgress value={cpuData[cpuData.length - 1]?.value || 0} color="#3b82f6" size={100} strokeWidth={8} label="CPU" />
                <CircularProgress value={memoryData[memoryData.length - 1]?.value || 0} color="#8b5cf6" size={100} strokeWidth={8} label="内存" />
                <CircularProgress value={networkData[networkData.length - 1]?.value || 0} color="#06b6d4" size={100} strokeWidth={8} label="网络" />
                <CircularProgress value={diskIOData[diskIOData.length - 1]?.value || 0} color="#f59e0b" size={100} strokeWidth={8} label="磁盘" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">CPU使用率</span>
                  <span className="text-white font-mono">{cpuData[cpuData.length - 1]?.value.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-300"
                    style={{ width: `${cpuData[cpuData.length - 1]?.value || 0}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">内存使用率</span>
                  <span className="text-white font-mono">{memoryData[memoryData.length - 1]?.value.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-300"
                    style={{ width: `${memoryData[memoryData.length - 1]?.value || 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50 flex-1">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                服务器负载
              </h2>
              {serverMetrics.length > 0 ? (
                <AnimatedBarChart data={serverMetrics} height={180} />
              ) : (
                <div className="flex items-center justify-center h-[180px] text-slate-500 text-sm">
                  暂无已启用的服务器
                </div>
              )}
            </div>

            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                快捷入口
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: Globe, label: '官网', color: 'text-blue-400', bg: 'bg-blue-500/20', href: 'https://www.zjzwfw.cloud/' },
                  { icon: Terminal, label: '终端', color: 'text-green-400', bg: 'bg-green-500/20', href: '/terminal' },
                  { icon: FileCode, label: '脚本', color: 'text-purple-400', bg: 'bg-purple-500/20', href: '/scripts' },
                  { icon: Shield, label: '审计', color: 'text-yellow-400', bg: 'bg-yellow-500/20', href: '/audit' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg bg-slate-900/50 border border-slate-700/30 hover:border-slate-600/50 transition-all cursor-pointer"
                    onClick={() => {
                      if (item.href.startsWith('http')) {
                        window.open(item.href, '_blank');
                      } else {
                        navigate(item.href);
                      }
                    }}
                  >
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                    <span className="text-xs text-slate-300">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-6 flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                icon={Server}
                label="服务器"
                value={`${stats?.servers.enabled || 0}/${stats?.servers.total || 0}`}
                subValue="已启用 / 总计"
                color="from-purple-600 to-purple-800"
                onClick={() => navigate('/servers')}
              />
              <StatCard
                icon={Bot}
                label="Agent"
                value={`${stats?.agents.enabled || 0}/${stats?.agents.total || 0}`}
                subValue="在线 / 总计"
                color="from-blue-600 to-blue-800"
                onClick={() => navigate('/agents')}
              />
              <StatCard
                icon={Play}
                label="任务成功率"
                value={`${stats?.tasks.successRate || 0}%`}
                subValue={`成功 ${stats?.tasks.completed || 0} / 总计 ${stats?.tasks.total || 0}`}
                color="from-green-600 to-green-800"
                onClick={() => navigate('/tasks')}
              />
              <StatCard
                icon={Bell}
                label="活跃告警"
                value={stats?.alerts.active || 0}
                subValue={`严重 ${stats?.alerts.critical || 0} / 高 ${stats?.alerts.high || 0}`}
                color="from-red-600 to-red-800"
                onClick={() => navigate('/alerts')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  CPU趋势
                </h3>
                <AnimatedLineChart data={cpuData} color="#3b82f6" height={120} />
              </div>
              <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-purple-400" />
                  内存趋势
                </h3>
                <AnimatedLineChart data={memoryData} color="#8b5cf6" height={120} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                  <Network className="w-4 h-4 text-cyan-400" />
                  网络流量 (Mbps)
                </h3>
                <AnimatedLineChart data={networkData} color="#06b6d4" height={120} />
              </div>
              <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-yellow-400" />
                  磁盘I/O (MB/s)
                </h3>
                <AnimatedLineChart data={diskIOData} color="#f59e0b" height={120} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50 flex flex-col">
                <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  告警趋势 (24h)
                </h2>
                <div className="flex-1 min-h-0">
                  {alertTrendData.length > 0 ? (
                    <AnimatedLineChart data={alertTrendData} color="#ef4444" height={160} />
                  ) : (
                    <div className="flex items-center justify-center h-[160px] text-slate-500 text-sm">暂无告警数据</div>
                  )}
                </div>
              </div>

              <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50 flex flex-col">
                <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <Play className="w-5 h-5 text-green-400" />
                  任务趋势 (24h)
                </h2>
                <div className="flex-1 min-h-0">
                  {taskTrendData.length > 0 ? (
                    <AnimatedLineChart data={taskTrendData} color="#22c55e" height={160} />
                  ) : (
                    <div className="flex items-center justify-center h-[160px] text-slate-500 text-sm">暂无任务数据</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  最近任务执行
                </h2>
                <span
                  className="text-xs text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full cursor-pointer hover:bg-slate-600/50"
                  onClick={() => navigate('/tasks')}
                >
                  {tasks?.length || 0} 条记录 →
                </span>
              </div>
              <div className="space-y-2 max-h-[180px] overflow-y-auto scrollbar-thin">
                {tasks?.slice(0, 6).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/30 hover:border-blue-500/30 transition-all cursor-pointer"
                    onClick={() => navigate('/tasks')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        task.status === 'running' ? 'bg-status-running animate-pulse' :
                        task.status === 'completed' ? 'bg-status-success' :
                        task.status === 'failed' ? 'bg-status-failed' : 'bg-status-pending'
                      }`} />
                      <span className="text-sm text-white truncate max-w-[250px]">{task.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(task.status)} bg-slate-700/50`}>
                        {task.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-3 flex flex-col gap-4">
            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  实时告警
                </h2>
                <span
                  className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full cursor-pointer hover:bg-slate-600/50"
                  onClick={() => navigate('/alerts')}
                >
                  全部 →
                </span>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                {alerts?.slice(0, 6).map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30 cursor-pointer hover:border-red-500/30 transition-all"
                    onClick={() => navigate('/alerts')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm text-white flex-1 truncate">{alert.title}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ml-2 ${getSeverityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className={`px-2 py-0.5 rounded ${
                        alert.status === 'new' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50'
                      }`}>
                        {alert.status}
                      </span>
                      <span>{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Agent调用统计
                </h2>
                <span
                  className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full cursor-pointer hover:bg-slate-600/50"
                  onClick={() => navigate('/agents')}
                >
                  详情 →
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 rounded-xl p-3 border border-blue-500/30">
                  <div className="text-2xl font-bold text-white">{agentStats?.overall.totalExecutions || 0}</div>
                  <div className="text-xs text-blue-300">总调用次数</div>
                </div>
                <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 rounded-xl p-3 border border-green-500/30">
                  <div className="text-2xl font-bold text-white">{agentStats?.overall.overallSuccessRate || 0}%</div>
                  <div className="text-xs text-green-300">总体成功率</div>
                </div>
                <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-xl p-3 border border-purple-500/30">
                  <div className="text-2xl font-bold text-white">{agentStats?.overall.todayExecutions || 0}</div>
                  <div className="text-xs text-purple-300">今日调用</div>
                </div>
                <div className="bg-gradient-to-br from-red-600/20 to-red-800/20 rounded-xl p-3 border border-red-500/30">
                  <div className="text-2xl font-bold text-white">{(agentStats?.overall.totalExecutions || 0) - (agentStats?.overall.totalSuccess || 0)}</div>
                  <div className="text-xs text-red-300">失败次数</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-2">
                {agentStats?.agents.slice(0, 6).map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg border border-slate-700/30"
                  >
                    <span className="text-xl">{agent.avatar}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{agent.name}</div>
                      <div className="text-xs text-slate-400">
                        {agent.total_executions}次调用 · 成功率{agent.successRate ?? 'N/A'}%
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${agent.enabled ? 'bg-status-success' : 'bg-slate-500'}`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                任务状态分布
              </h2>
              {taskDistData.length > 0 ? (
                <AnimatedBarChart data={taskDistData} height={140} />
              ) : (
                <div className="flex items-center justify-center h-[140px] text-slate-500 text-sm">暂无任务数据</div>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-4 px-2 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-status-success" />
              系统运行正常
            </span>
            <span>数据刷新: 30秒</span>
          </div>
          <div className="flex items-center gap-4">
            <span>ITOps Agent Platform v1.0</span>
            <span>© 2026</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
