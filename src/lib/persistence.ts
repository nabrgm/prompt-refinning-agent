import fs from 'fs/promises';
import path from 'path';
import { Persona, EmotionDimension, Intent, GeneratedSimulationOptions, EnhancedSimulation, SimulationNote, SimulationNotesData, SimulationBatch } from '@/types/simulation';
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

// ============ ONBOARDING GUIDE (Agent-scoped) ============

export async function saveOnboardingGuide(agentId: string, guideText: string): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'onboarding-guide.txt');
    await fs.writeFile(filePath, guideText, 'utf-8');
}

export async function loadOnboardingGuide(agentId: string): Promise<string | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'onboarding-guide.txt');
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
    } catch {
        return null;
    }
}

export async function onboardingGuideExists(agentId: string): Promise<boolean> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'onboarding-guide.txt');
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// ============ GENERATED SIMULATION OPTIONS (Agent-scoped) ============

export async function saveGeneratedSimulationOptions(
    agentId: string,
    options: GeneratedSimulationOptions
): Promise<void> {
    await ensureAgentDirectories(agentId);
    const filePath = path.join(getAgentDir(agentId), 'simulation-options.json');
    await fs.writeFile(filePath, JSON.stringify(options, null, 2));
}

export async function loadGeneratedSimulationOptions(agentId: string): Promise<GeneratedSimulationOptions | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'simulation-options.json');
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

// ============ ENHANCED SIMULATIONS (Agent-scoped) ============

export async function saveEnhancedSimulation(agentId: string, simulation: EnhancedSimulation): Promise<void> {
    await ensureAgentDirectories(agentId);
    const simulationsDir = path.join(getAgentDir(agentId), 'enhanced-simulations');
    await fs.mkdir(simulationsDir, { recursive: true });
    const filePath = path.join(simulationsDir, `${simulation.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(simulation, null, 2));
}

export async function loadEnhancedSimulation(agentId: string, simulationId: string): Promise<EnhancedSimulation | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'enhanced-simulations', `${simulationId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

export async function loadAllEnhancedSimulations(agentId: string): Promise<EnhancedSimulation[]> {
    const simulationsDir = path.join(getAgentDir(agentId), 'enhanced-simulations');
    try {
        const files = await fs.readdir(simulationsDir);
        const simulations = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    const content = await fs.readFile(path.join(simulationsDir, f), 'utf-8');
                    return JSON.parse(content) as EnhancedSimulation;
                })
        );
        return simulations.sort((a, b) => a.simulationNumber - b.simulationNumber);
    } catch {
        return [];
    }
}

export async function clearAllEnhancedSimulations(agentId: string): Promise<void> {
    const simulationsDir = path.join(getAgentDir(agentId), 'enhanced-simulations');
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

export async function updateSimulationReviewed(
    agentId: string,
    simulationId: string,
    reviewed: boolean
): Promise<EnhancedSimulation | null> {
    const simulation = await loadEnhancedSimulation(agentId, simulationId);
    if (!simulation) return null;

    simulation.reviewed = reviewed;
    simulation.reviewedAt = reviewed ? new Date().toISOString() : undefined;

    await saveEnhancedSimulation(agentId, simulation);
    return simulation;
}

export async function loadSimulationsByBatch(agentId: string, batchId: string): Promise<EnhancedSimulation[]> {
    const allSimulations = await loadAllEnhancedSimulations(agentId);
    return allSimulations
        .filter(s => s.batchId === batchId)
        .sort((a, b) => a.simulationNumber - b.simulationNumber);
}

// ============ SIMULATION BATCHES (Agent-scoped) ============

export async function saveSimulationBatch(agentId: string, batch: SimulationBatch): Promise<void> {
    await ensureAgentDirectories(agentId);
    const batchesDir = path.join(getAgentDir(agentId), 'simulation-batches');
    await fs.mkdir(batchesDir, { recursive: true });
    const filePath = path.join(batchesDir, `${batch.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(batch, null, 2));
}

export async function loadSimulationBatch(agentId: string, batchId: string): Promise<SimulationBatch | null> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'simulation-batches', `${batchId}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

export async function loadAllSimulationBatches(agentId: string): Promise<SimulationBatch[]> {
    const batchesDir = path.join(getAgentDir(agentId), 'simulation-batches');
    try {
        const files = await fs.readdir(batchesDir);
        const batches = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    const content = await fs.readFile(path.join(batchesDir, f), 'utf-8');
                    return JSON.parse(content) as SimulationBatch;
                })
        );
        // Sort by creation date, newest first
        return batches.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch {
        return [];
    }
}

export async function updateSimulationBatch(
    agentId: string,
    batchId: string,
    updates: Partial<SimulationBatch>
): Promise<SimulationBatch | null> {
    const batch = await loadSimulationBatch(agentId, batchId);
    if (!batch) return null;

    const updatedBatch = { ...batch, ...updates };
    await saveSimulationBatch(agentId, updatedBatch);
    return updatedBatch;
}

export async function deleteSimulationBatch(agentId: string, batchId: string): Promise<void> {
    // Delete batch file
    const batchFilePath = path.join(getAgentDir(agentId), 'simulation-batches', `${batchId}.json`);
    try {
        await fs.unlink(batchFilePath);
    } catch {
        // File might not exist
    }

    // Delete all simulations in this batch
    const simulations = await loadSimulationsByBatch(agentId, batchId);
    const simulationsDir = path.join(getAgentDir(agentId), 'enhanced-simulations');
    await Promise.all(
        simulations.map(s =>
            fs.unlink(path.join(simulationsDir, `${s.id}.json`)).catch(() => {})
        )
    );
}

export async function getNextBatchNumber(agentId: string): Promise<number> {
    const batches = await loadAllSimulationBatches(agentId);
    if (batches.length === 0) return 1;

    // Extract numbers from batch names like "Round 1", "Round 2"
    const numbers = batches.map(b => {
        const match = b.name.match(/Round (\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    });
    return Math.max(...numbers) + 1;
}

// ============ SIMULATION NOTES (Agent-scoped) ============

export async function loadSimulationNotes(agentId: string): Promise<SimulationNote[]> {
    try {
        const filePath = path.join(getAgentDir(agentId), 'simulation-notes.json');
        const content = await fs.readFile(filePath, 'utf-8');
        const data: SimulationNotesData = JSON.parse(content);
        return data.notes;
    } catch {
        return [];
    }
}

export async function saveSimulationNote(agentId: string, note: SimulationNote): Promise<SimulationNote[]> {
    await ensureAgentDirectories(agentId);
    const notes = await loadSimulationNotes(agentId);

    // Check if note already exists (update) or add new
    const existingIndex = notes.findIndex(n => n.id === note.id);
    if (existingIndex >= 0) {
        notes[existingIndex] = note;
    } else {
        notes.push(note);
    }

    const data: SimulationNotesData = {
        agentId,
        notes,
        updatedAt: new Date().toISOString()
    };

    const filePath = path.join(getAgentDir(agentId), 'simulation-notes.json');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return notes;
}

export async function updateNoteResolved(agentId: string, noteId: string, resolved: boolean, resolutionNote?: string): Promise<SimulationNote[]> {
    const notes = await loadSimulationNotes(agentId);
    const noteIndex = notes.findIndex(n => n.id === noteId);

    if (noteIndex >= 0) {
        notes[noteIndex].resolved = resolved;
        notes[noteIndex].resolvedAt = resolved ? new Date().toISOString() : undefined;
        notes[noteIndex].resolutionNote = resolved ? resolutionNote : undefined;

        const data: SimulationNotesData = {
            agentId,
            notes,
            updatedAt: new Date().toISOString()
        };

        const filePath = path.join(getAgentDir(agentId), 'simulation-notes.json');
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    return notes;
}

export async function deleteSimulationNote(agentId: string, noteId: string): Promise<SimulationNote[]> {
    const notes = await loadSimulationNotes(agentId);
    const updated = notes.filter(n => n.id !== noteId);

    const data: SimulationNotesData = {
        agentId,
        notes: updated,
        updatedAt: new Date().toISOString()
    };

    const filePath = path.join(getAgentDir(agentId), 'simulation-notes.json');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return updated;
}

export async function clearSimulationNotes(agentId: string): Promise<void> {
    await ensureAgentDirectories(agentId);
    const data: SimulationNotesData = {
        agentId,
        notes: [],
        updatedAt: new Date().toISOString()
    };
    const filePath = path.join(getAgentDir(agentId), 'simulation-notes.json');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}
