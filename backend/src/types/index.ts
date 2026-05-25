export interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    agentId: string;
    allowFailure?: boolean;
  };
  position: {
    x: number;
    y: number;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: string;
  edges: string;
  agent_configs: string;
  is_template: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowParsed {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  agent_configs: Record<string, unknown>;
  is_template: number;
  created_at: string;
  updated_at: string;
}

export interface NodeResult {
  status: 'success' | 'failed' | 'pending';
  output?: string;
  error?: string;
  metadata?: {
    thinkingProcess?: string;
    executionTime?: number;
  };
}

export interface TaskLogEntry {
  type: 'thinking' | 'output' | 'error';
  content: string;
  nodeId?: string;
}

export interface Agent {
  id: string;
  name: string;
  system_prompt: string;
}

export interface Server {
  id: string;
  name: string;
  hostname: string;
}

export interface Task {
  id: string;
  status: string;
  start_time?: string;
  end_time?: string;
  logs?: string;
}

export interface CommandExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface ComplianceCheckResult {
  success: boolean;
  details?: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  created_at: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  content: string;
  variables: string[];
  is_preset: boolean;
}

export interface Report {
  id: string;
  name: string;
  content: string;
  format: string;
  task_id?: string;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  role: string;
  enabled: number;
}
