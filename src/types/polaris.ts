export interface PolarisNodeData {
  id: string;
  label: string;
  name: string;
  type: string;
  category?: string;
  description?: string;
  inputParams?: any[];
  inputs?: Record<string, any>;
  outputAnchors?: any[];
  outputs?: any;
  selected?: boolean;
}

export interface PolarisNode {
  id: string;
  position: { x: number; y: number };
  type: string;
  data: PolarisNodeData;
  width?: number;
  height?: number;
  selected?: boolean;
  positionAbsolute?: { x: number; y: number };
  dragging?: boolean;
}

export interface PolarisGraph {
  nodes: PolarisNode[];
  edges?: any[];
}

export interface StateField {
  key: string;
  type: string;
  defaultValue: string;
  actions?: string;
  id?: number;
}

export interface OverridableNode {
  id: string;
  label: string;
  type: string;
  systemMessagePrompt?: string;
  humanMessagePrompt?: string;
}

export interface StateMemory {
  nodeId: string;
  fields: StateField[];
}

export interface PromptVersion {
  id: string;
  nodeId: string;
  timestamp: number;
  label: string;
  systemMessagePrompt?: string;
  humanMessagePrompt?: string;
}

// A complete version of all prompts + state values
export interface PromptSetVersion {
  id: string;
  name: string;                    // User-given name like "v1 - Initial", "v2 - Fixed Dr. issue"
  description?: string;            // Optional description of what changed
  createdAt: string;
  // All agent node prompts
  nodes: {
    id: string;
    label: string;
    type: string;
    systemMessagePrompt?: string;
    humanMessagePrompt?: string;
  }[];
  // All state values
  stateValues: Record<string, string>;
  // Optional: link to behavior test that prompted this version
  basedOnExperimentId?: string;
}

// Agent configuration for multi-agent support
export interface AgentConfig {
  id: string;                      // Unique agent ID (generated)
  name: string;                    // Display name (e.g., "iProspect Agent", "Support Bot")
  apiUrl: string;                  // Polaris API endpoint URL
  createdAt: string;
  updatedAt: string;
  createdBy?: string;              // Optional: who created this agent
  description?: string;            // Optional description
}
