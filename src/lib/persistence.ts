import fs from 'fs/promises';
import path from 'path';
import { Persona } from '@/types/simulation';
import { BehaviorTest, BehaviorExperiment } from '@/types/behavior-test';
import { PromptSetVersion, OverridableNode, AgentConfig } from '@/types/polaris';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_REGISTRY_FILE = path.join(DATA_DIR, 'agents.json');
const AGENTS_DIR = path.join(DATA_DIR, 'agents');

// ============ AGENT REGISTRY ============

// Get the data directory for a specific agent
function getAgentDir(agentId: string): string {
    return path.join(AGENTS_DIR, agentId);
}

// Ensure agent-specific directories exist
async function ensureAgentDirectories(agentId: string) {
    const agentDir = getAgentDir(agentId);
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(path.join(agentDir, 'simulations'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'experiments'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'versions'), { recursive: true });
}

// Ensure base data directory exists
async function ensureBaseDirectories() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(AGENTS_DIR, { recursive: true });
}

// Load all registered agents
export async function loadAgents(): Promise<AgentConfig[]> {
    try {
        const content = await fs.readFile(AGENTS_REGISTRY_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

// Save agents registry
async function saveAgentsRegistry(agents: AgentConfig[]): Promise<void> {
    await ensureBaseDirectories();
    await fs.writeFile(AGENTS_REGISTRY_FILE, JSON.stringify(agents, null, 2));
}

// Register a new agent
export async function registerAgent(
    name: string,
    apiUrl: string,
    graphJson: any,
    createdBy?: string,
    description?: string
): Promise<AgentConfig> {
    const agents = await loadAgents();

    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const agent: AgentConfig = {
        id: agentId,
        name,
        apiUrl,
        createdAt: now,
        updatedAt: now,
        createdBy,
        description,
    };

    // Create agent directory and save graph
    await ensureAgentDirectories(agentId);
    await fs.writeFile(
        path.join(getAgentDir(agentId), 'graph.json'),
        JSON.stringify(graphJson, null, 2)
    );

    // Add to registry
    agents.push(agent);
    await saveAgentsRegistry(agents);

    return agent;
}

// Get a specific agent config
export async function getAgent(agentId: string): Promise<AgentConfig | null> {
    const agents = await loadAgents();
    return agents.find(a => a.id === agentId) || null;
}

// Update agent config
export async function updateAgent(agentId: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null> {
    const agents = await loadAgents();
    const index = agents.findIndex(a => a.id === agentId);
    if (index === -1) return null;

    agents[index] = {
        ...agents[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    await saveAgentsRegistry(agents);
    return agents[index];
}

// Delete an agent and all its data
export async function deleteAgent(agentId: string): Promise<void> {
    const agents = await loadAgents();
    const updated = agents.filter(a => a.id !== agentId);
    await saveAgentsRegistry(updated);

    // Remove agent directory
    try {
        await fs.rm(getAgentDir(agentId), { recursive: true, force: true });
    } catch {
        // Directory might not exist
    }
}

// Load agent's graph JSON
export async function loadAgentGraph(agentId: string): Promise<any | null> {
    try {
        const graphPath = path.join(getAgentDir(agentId), 'graph.json');
        const content = await fs.readFile(graphPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

// Update agent's graph JSON
export async function saveAgentGraph(agentId: string, graphJson: any): Promise<void> {
    await ensureAgentDirectories(agentId);
    await fs.writeFile(
        path.join(getAgentDir(agentId), 'graph.json'),
        JSON.stringify(graphJson, null, 2)
    );
}

// ============ PERSONAS (Agent-scoped) ============

export async function savePersonas(agentId: string, personas: Persona[]): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'personas.json');
    await fs.writeFile(filePath, JSON.stringify(personas, null, 2));
}

export async function loadPersonas(agentId: string): Promise<Persona[]> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'personas.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

export async function addPersonas(agentId: string, newPersonas: Persona[]): Promise<Persona[]> {
    const existing = await loadPersonas(agentId);
    const updated = [...existing, ...newPersonas];
    await savePersonas(agentId, updated);
    return updated;
}

export async function deletePersona(agentId: string, personaId: string): Promise<Persona[]> {
    const existing = await loadPersonas(agentId);
    const updated = existing.filter(p => p.id !== personaId);
    await savePersonas(agentId, updated);
    return updated;
}

export async function clearAllPersonas(agentId: string): Promise<void> {
    await savePersonas(agentId, []);
}

// ============ SIMULATIONS (Agent-scoped) ============

export interface SavedSimulation {
    id: string;
    personaId: string;
    persona: Persona;
    turns: { role: string; content: string; traceData?: any }[];
    chatId?: string;
    createdAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
}

export async function saveSimulation(agentId: string, simulation: SavedSimulation): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'simulations', `${simulation.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(simulation, null, 2));
}

export async function loadSimulation(agentId: string, simulationId: string): Promise<SavedSimulation | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'simulations', `${simulationId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

export async function loadAllSimulations(agentId: string): Promise<SavedSimulation[]> {
    const simulationsDir = path.join(getAgentDir(agentId), 'simulations');
    try {
        const files = await fs.readdir(simulationsDir);
        const simulations = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    const content = await fs.readFile(path.join(simulationsDir, f), 'utf-8');
                    return JSON.parse(content) as SavedSimulation;
                })
        );
        return simulations.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch {
        return [];
    }
}

export async function deleteSimulation(agentId: string, simulationId: string): Promise<void> {
    const filePath = path.join(getAgentDir(agentId), 'simulations', `${simulationId}.json`);
    try {
        await fs.unlink(filePath);
    } catch {
        // File might not exist
    }
}

export async function clearAllSimulations(agentId: string): Promise<void> {
    const simulationsDir = path.join(getAgentDir(agentId), 'simulations');
    try {
        const files = await fs.readdir(simulationsDir);
        await Promise.all(
            files.filter(f => f.endsWith('.json')).map(f =>
                fs.unlink(path.join(simulationsDir, f))
            )
        );
    } catch {
        // Directory might not exist
    }
}

// ============ BEHAVIOR TESTS (Agent-scoped) ============

export async function saveBehaviorTest(agentId: string, test: BehaviorTest): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'behavior-tests.json');
    const tests = await loadBehaviorTests(agentId);
    const existing = tests.findIndex(t => t.id === test.id);
    if (existing >= 0) {
        tests[existing] = test;
    } else {
        tests.push(test);
    }
    await fs.writeFile(filePath, JSON.stringify(tests, null, 2));
}

export async function loadBehaviorTests(agentId: string): Promise<BehaviorTest[]> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'behavior-tests.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

export async function deleteBehaviorTest(agentId: string, testId: string): Promise<BehaviorTest[]> {
    const tests = await loadBehaviorTests(agentId);
    const updated = tests.filter(t => t.id !== testId);
    const filePath = path.join(getAgentDir(agentId), 'behavior-tests.json');
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
}

// ============ BEHAVIOR EXPERIMENTS (Agent-scoped) ============

export async function saveBehaviorExperiment(agentId: string, experiment: BehaviorExperiment): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'experiments', `${experiment.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(experiment, null, 2));
}

export async function loadBehaviorExperiment(agentId: string, experimentId: string): Promise<BehaviorExperiment | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'experiments', `${experimentId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

export async function loadAllBehaviorExperiments(agentId: string): Promise<BehaviorExperiment[]> {
    const experimentsDir = path.join(getAgentDir(agentId), 'experiments');
    try {
        const files = await fs.readdir(experimentsDir);
        const experiments = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    const content = await fs.readFile(path.join(experimentsDir, f), 'utf-8');
                    return JSON.parse(content) as BehaviorExperiment;
                })
        );
        return experiments.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch {
        return [];
    }
}

export async function deleteBehaviorExperiment(agentId: string, experimentId: string): Promise<void> {
    const filePath = path.join(getAgentDir(agentId), 'experiments', `${experimentId}.json`);
    try {
        await fs.unlink(filePath);
    } catch {
        // File might not exist
    }
}

export async function clearAllBehaviorExperiments(agentId: string): Promise<void> {
    const experimentsDir = path.join(getAgentDir(agentId), 'experiments');
    try {
        const files = await fs.readdir(experimentsDir);
        await Promise.all(
            files.filter(f => f.endsWith('.json')).map(f =>
                fs.unlink(path.join(experimentsDir, f))
            )
        );
    } catch {
        // Directory might not exist
    }
}

// ============ MASTER VERSION (Agent-scoped) ============

export interface MasterVersion {
    nodes: Array<{
        id: string;
        label: string;
        type?: string;
        systemMessagePrompt?: string;
        humanMessagePrompt?: string;
    }>;
    stateValues: Record<string, string>;
    lastUpdated: string;
}

export async function saveMasterVersion(
    agentId: string,
    nodes: Array<{
        id: string;
        label: string;
        type?: string;
        systemMessagePrompt?: string;
        humanMessagePrompt?: string;
    }>,
    stateValues: Record<string, string>
): Promise<MasterVersion> {
    await ensureAgentDirectories(agentId);
    const master: MasterVersion = {
        nodes: nodes.map(n => ({
            id: n.id,
            label: n.label,
            type: n.type,
            systemMessagePrompt: n.systemMessagePrompt,
            humanMessagePrompt: n.humanMessagePrompt,
        })),
        stateValues: { ...stateValues },
        lastUpdated: new Date().toISOString(),
    };
    const filePath = path.join(getAgentDir(agentId), 'master-version.json');
    await fs.writeFile(filePath, JSON.stringify(master, null, 2));
    return master;
}

export async function loadMasterVersion(agentId: string): Promise<MasterVersion | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'master-version.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

export async function masterVersionExists(agentId: string): Promise<boolean> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'master-version.json');
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// ============ PROMPT OVERRIDES (Agent-scoped) ============

export async function getAgentOverrides(agentId: string): Promise<Record<string, { systemMessagePrompt?: string, humanMessagePrompt?: string }>> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'overrides.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

export async function saveAgentOverride(
    agentId: string,
    nodeId: string,
    type: 'systemMessagePrompt' | 'humanMessagePrompt',
    newPrompt: string
): Promise<void> {
    await ensureAgentDirectories(agentId);
    const overrides = await getAgentOverrides(agentId);
    if (!overrides[nodeId]) {
        overrides[nodeId] = {};
    }
    overrides[nodeId][type] = newPrompt;
    const filePath = path.join(getAgentDir(agentId), 'overrides.json');
    await fs.writeFile(filePath, JSON.stringify(overrides, null, 2));
}

// ============ STATE OVERRIDES (Agent-scoped) ============

export async function getAgentStateOverrides(agentId: string): Promise<Record<string, string>> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'state-overrides.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

export async function saveAgentStateOverride(agentId: string, key: string, value: string): Promise<void> {
    await ensureAgentDirectories(agentId);
    const overrides = await getAgentStateOverrides(agentId);
    overrides[key] = value;
    const filePath = path.join(getAgentDir(agentId), 'state-overrides.json');
    await fs.writeFile(filePath, JSON.stringify(overrides, null, 2));
}

// ============ PROMPT SET VERSIONS (Agent-scoped) ============

export async function savePromptSetVersion(agentId: string, version: PromptSetVersion): Promise<void> {
    await ensureAgentDirectories(agentId);
    const versions = await loadPromptSetVersions(agentId);
    const existingIndex = versions.findIndex(v => v.id === version.id);
    if (existingIndex >= 0) {
        versions[existingIndex] = version;
    } else {
        versions.unshift(version);
    }
    const filePath = path.join(getAgentDir(agentId), 'prompt-versions.json');
    await fs.writeFile(filePath, JSON.stringify(versions, null, 2));
}

export async function loadPromptSetVersions(agentId: string): Promise<PromptSetVersion[]> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'prompt-versions.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

export async function loadPromptSetVersion(agentId: string, versionId: string): Promise<PromptSetVersion | null> {
    const versions = await loadPromptSetVersions(agentId);
    return versions.find(v => v.id === versionId) || null;
}

export async function deletePromptSetVersion(agentId: string, versionId: string): Promise<PromptSetVersion[]> {
    const versions = await loadPromptSetVersions(agentId);
    const updated = versions.filter(v => v.id !== versionId);
    const filePath = path.join(getAgentDir(agentId), 'prompt-versions.json');
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
}

export async function clearAllPromptSetVersions(agentId: string): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'prompt-versions.json');
    await fs.writeFile(filePath, JSON.stringify([], null, 2));
}

// ============ NODE PROMPT VERSIONS (Agent-scoped) ============

export async function saveNodePromptVersion(
    agentId: string,
    nodeId: string,
    label: string,
    systemPrompt?: string,
    humanPrompt?: string
): Promise<any> {
    await ensureAgentDirectories(agentId);
    const nodeDir = path.join(getAgentDir(agentId), 'versions', nodeId);
    await fs.mkdir(nodeDir, { recursive: true });

    const versionId = Date.now().toString();
    const version = {
        id: versionId,
        nodeId,
        timestamp: Date.now(),
        label,
        systemMessagePrompt: systemPrompt,
        humanMessagePrompt: humanPrompt
    };

    const versionPath = path.join(nodeDir, `${versionId}.json`);
    await fs.writeFile(versionPath, JSON.stringify(version, null, 2));
    return version;
}

export async function loadNodePromptVersions(agentId: string, nodeId: string): Promise<any[]> {
    const nodeDir = path.join(getAgentDir(agentId), 'versions', nodeId);
    try {
        const files = await fs.readdir(nodeDir);
        const versions = await Promise.all(
            files.filter(f => f.endsWith('.json')).map(async f => {
                const content = await fs.readFile(path.join(nodeDir, f), 'utf-8');
                return JSON.parse(content);
            })
        );
        return versions.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
        return [];
    }
}

export async function updateNodePromptVersion(
    agentId: string,
    nodeId: string,
    versionId: string,
    systemPrompt?: string,
    humanPrompt?: string
): Promise<any | null> {
    const nodeDir = path.join(getAgentDir(agentId), 'versions', nodeId);
    const versionPath = path.join(nodeDir, `${versionId}.json`);

    try {
        const content = await fs.readFile(versionPath, 'utf-8');
        const version = JSON.parse(content);
        version.systemMessagePrompt = systemPrompt;
        version.humanMessagePrompt = humanPrompt;
        version.updatedAt = Date.now();
        await fs.writeFile(versionPath, JSON.stringify(version, null, 2));
        return version;
    } catch {
        return null;
    }
}
