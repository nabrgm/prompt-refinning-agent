'use server';

import { getOverridableNodes, savePromptOverride, calculateOverrideConfig, savePromptVersion, getPromptVersions, getStateMemory, saveStateOverride, updatePromptVersion, extractStateFieldsFromGraph, extractOverridableNodesFromGraph } from '@/lib/polaris';
import { StateMemory, OverridableNode, PromptSetVersion, AgentConfig, PolarisGraph } from '@/types/polaris';
import { sendChatRequest, validatePolarisUrl } from '@/lib/api';
import {
    loadAgents,
    registerAgent,
    getAgent,
    deleteAgent as removeAgent,
    loadAgentGraph,
    savePersonas,
    loadPersonas,
    addPersonas,
    deletePersona as removePersona,
    clearAllPersonas,
    saveSimulation,
    loadSimulation,
    loadAllSimulations,
    deleteSimulation as removeSimulation,
    clearAllSimulations,
    SavedSimulation,
    saveBehaviorTest,
    loadBehaviorTests,
    deleteBehaviorTest as removeBehaviorTest,
    saveBehaviorExperiment,
    loadBehaviorExperiment,
    loadAllBehaviorExperiments,
    deleteBehaviorExperiment as removeBehaviorExperiment,
    clearAllBehaviorExperiments,
    saveMasterVersion,
    loadMasterVersion,
    masterVersionExists,
    MasterVersion,
    savePromptSetVersion,
    loadPromptSetVersions,
    loadPromptSetVersion,
    deletePromptSetVersion
} from '@/lib/persistence';
import { generatePersonas, generateUserResponse, generatePersonasFromContext, generateBehaviorTestPersonas, AgentContext } from '@/lib/openai';
import { Persona } from '@/types/simulation';
import {
    BehaviorTest,
    BehaviorExperiment,
    BehaviorTestResult,
    ConversationTurn,
    ExperimentSummary
} from '@/types/behavior-test';
import {
    generateScorerPrompt,
    scoreConversation,
    initBraintrustExperiment,
    logToBraintrust,
    summarizeExperiment,
    generateExperimentInsights
} from '@/lib/braintrust';
import OpenAI from 'openai';

// ============ AGENT MANAGEMENT ============

export async function fetchAgents(): Promise<AgentConfig[]> {
    return await loadAgents();
}

export async function fetchAgent(agentId: string): Promise<AgentConfig | null> {
    return await getAgent(agentId);
}

export async function createAgent(
    name: string,
    apiUrl: string,
    graphJson: any,
    createdBy?: string,
    description?: string
): Promise<AgentConfig> {
    // Validate URL
    const urlValidation = validatePolarisUrl(apiUrl);
    if (!urlValidation.valid) {
        throw new Error(`Invalid Polaris URL: ${urlValidation.error}`);
    }

    // Validate graph structure
    if (!graphJson.nodes || !Array.isArray(graphJson.nodes)) {
        throw new Error('Invalid agent graph: missing nodes array');
    }

    return await registerAgent(name, apiUrl, graphJson, createdBy, description);
}

export async function deleteAgentAction(agentId: string): Promise<void> {
    await removeAgent(agentId);
}

// ============ NODE OPERATIONS ============

export async function fetchNodes(agentId: string): Promise<OverridableNode[]> {
    const nodes = await getOverridableNodes(agentId);
    console.log('fetchNodes returning:', nodes.map(n => ({
        id: n.id,
        label: n.label,
        hasSystemPrompt: !!n.systemMessagePrompt,
        promptPreview: n.systemMessagePrompt?.substring(0, 100)
    })));
    return nodes;
}

export async function saveNodeOverride(agentId: string, nodeId: string, type: 'systemMessagePrompt' | 'humanMessagePrompt', content: string) {
    await savePromptOverride(agentId, nodeId, type, content);
    return { success: true };
}

export async function saveVersion(agentId: string, nodeId: string, label: string, systemPrompt?: string, humanPrompt?: string) {
    return await savePromptVersion(agentId, nodeId, label, systemPrompt, humanPrompt);
}

export async function fetchVersions(agentId: string, nodeId: string) {
    return await getPromptVersions(agentId, nodeId);
}

export async function updateVersion(agentId: string, nodeId: string, versionId: string, systemPrompt?: string, humanPrompt?: string) {
    return await updatePromptVersion(agentId, nodeId, versionId, systemPrompt, humanPrompt);
}

// ============ STATE MEMORY ============

export async function fetchStateMemory(agentId: string): Promise<StateMemory | null> {
    return await getStateMemory(agentId);
}

export async function updateStateField(agentId: string, key: string, value: string) {
    await saveStateOverride(agentId, key, value);
    return { success: true };
}

// ============ CHAT ============

export async function sendChat(
    agentId: string,
    message: string,
    chatId?: string,
    nodes?: OverridableNode[],
    stateOverrides?: Record<string, string>
) {
    try {
        // Get agent config for API URL
        const agent = await getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        console.log('sendChat called with:', {
            agentId,
            apiUrl: agent.apiUrl,
            message: message.substring(0, 50) + '...',
            chatId,
            nodesCount: nodes?.length,
            nodeIds: nodes?.map(n => n.id),
            stateOverrideKeys: stateOverrides ? Object.keys(stateOverrides) : []
        });

        const overrideConfig = nodes ? await calculateOverrideConfig(agentId, nodes, stateOverrides) : undefined;

        console.log('Override config:', overrideConfig ? JSON.stringify(overrideConfig).substring(0, 200) : 'none');

        return await sendChatRequest(agent.apiUrl, message, chatId, overrideConfig);
    } catch (error) {
        console.error('Chat Error:', error);
        throw error;
    }
}

// Send chat with forced overrides for behavior testing
export async function sendChatWithOverrides(
    agentId: string,
    message: string,
    chatId?: string,
    nodes?: OverridableNode[],
    stateOverrides?: Record<string, string>
) {
    try {
        const agent = await getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        // Force ALL overrides to be included for consistent testing
        const overrideConfig = nodes ? await calculateOverrideConfig(agentId, nodes, stateOverrides, true) : undefined;

        console.log('sendChatWithOverrides - Override config keys:', overrideConfig ? Object.keys(overrideConfig) : 'none');

        return await sendChatRequest(agent.apiUrl, message, chatId, overrideConfig);
    } catch (error) {
        console.error('Chat Error:', error);
        throw error;
    }
}

// ============ PERSONA GENERATION ============

// Helper to extract agent context from nodes
function extractAgentContext(nodes: OverridableNode[]): AgentContext {
    console.log('extractAgentContext called with nodes:', nodes.map(n => ({
        id: n.id,
        label: n.label,
        hasSystemPrompt: !!n.systemMessagePrompt,
        promptLength: n.systemMessagePrompt?.length || 0
    })));

    const nodePrompts = nodes
        .filter(n => n.systemMessagePrompt)
        .map(n => ({
            nodeId: n.id,
            label: n.label,
            systemPrompt: n.systemMessagePrompt || ''
        }));

    console.log('Extracted prompts count:', nodePrompts.length);

    // Try to extract brand name from prompts
    let brandName: string | undefined;
    const brandMatch = nodePrompts
        .map(n => n.systemPrompt)
        .join(' ')
        .match(/brand[_\s]?name["\s:}]+([^"}\n]+)/i);
    if (brandMatch) {
        brandName = brandMatch[1].trim();
    }

    // Look for common brand references
    const allPrompts = nodePrompts.map(n => n.systemPrompt).join(' ');
    if (!brandName) {
        const brandPatterns = [
            /for\s+(\w+\s*\w*)\s*\./i,
            /(\w+\s*Business)\s+/i,
            /specialist\s+for\s+(\w+)/i
        ];
        for (const pattern of brandPatterns) {
            const match = allPrompts.match(pattern);
            if (match) {
                brandName = match[1];
                break;
            }
        }
    }

    return {
        brandName,
        nodePrompts
    };
}

export async function createPersonas(count: number, description: string) {
    return await generatePersonas(count, description);
}

export async function runSimulationStep(persona: Persona, history: { role: string, content: string }[]) {
    const userContent = await generateUserResponse(persona, history);
    return userContent;
}

// Generate personas with custom description + agent context
export async function createAndSavePersonas(agentId: string, count: number, description: string, nodes?: OverridableNode[]) {
    const agentContext = nodes ? extractAgentContext(nodes) : undefined;
    const newPersonas = await generatePersonas(count, description, agentContext);
    await addPersonas(agentId, newPersonas);
    return newPersonas;
}

// Auto-generate personas based only on agent context
export async function autoGeneratePersonas(agentId: string, count: number, nodes: OverridableNode[]) {
    console.log('autoGeneratePersonas called with count:', count, 'nodes:', nodes.length);

    const agentContext = extractAgentContext(nodes);

    console.log('Agent context:', {
        brandName: agentContext.brandName,
        promptCount: agentContext.nodePrompts.length,
        promptLabels: agentContext.nodePrompts.map(p => p.label)
    });

    if (agentContext.nodePrompts.length === 0) {
        throw new Error("No agent prompts found. Cannot auto-generate personas.");
    }

    const newPersonas = await generatePersonasFromContext(count, agentContext);
    await addPersonas(agentId, newPersonas);
    return newPersonas;
}

export async function fetchSavedPersonas(agentId: string): Promise<Persona[]> {
    return await loadPersonas(agentId);
}

export async function persistPersonas(agentId: string, personas: Persona[]): Promise<void> {
    await savePersonas(agentId, personas);
}

export async function deletePersona(agentId: string, personaId: string): Promise<Persona[]> {
    return await removePersona(agentId, personaId);
}

export async function clearPersonas(agentId: string): Promise<void> {
    await clearAllPersonas(agentId);
}

// ============ SIMULATION PERSISTENCE ============

export async function startSimulation(agentId: string, persona: Persona): Promise<SavedSimulation> {
    const simulation: SavedSimulation = {
        id: `sim-${Date.now()}-${persona.id}`,
        personaId: persona.id,
        persona,
        turns: [],
        createdAt: new Date().toISOString(),
        status: 'running'
    };
    await saveSimulation(agentId, simulation);
    return simulation;
}

export async function updateSimulation(
    agentId: string,
    simulationId: string,
    updates: Partial<SavedSimulation>
): Promise<SavedSimulation | null> {
    const existing = await loadSimulation(agentId, simulationId);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    await saveSimulation(agentId, updated);
    return updated;
}

export async function completeSimulation(
    agentId: string,
    simulationId: string,
    turns: { role: string; content: string; traceData?: any }[],
    chatId?: string
): Promise<SavedSimulation | null> {
    const existing = await loadSimulation(agentId, simulationId);
    if (!existing) return null;

    const updated: SavedSimulation = {
        ...existing,
        turns,
        chatId,
        completedAt: new Date().toISOString(),
        status: 'completed'
    };
    await saveSimulation(agentId, updated);
    return updated;
}

export async function fetchAllSimulations(agentId: string): Promise<SavedSimulation[]> {
    return await loadAllSimulations(agentId);
}

export async function fetchSimulation(agentId: string, simulationId: string): Promise<SavedSimulation | null> {
    return await loadSimulation(agentId, simulationId);
}

export async function deleteSimulation(agentId: string, simulationId: string): Promise<void> {
    await removeSimulation(agentId, simulationId);
}

export async function clearSimulations(agentId: string): Promise<void> {
    await clearAllSimulations(agentId);
}

// ============ BEHAVIOR TESTS ============

// Create a new behavior test from problem description
export async function createBehaviorTest(
    agentId: string,
    problemDescription: string,
    simulationCount: number
): Promise<BehaviorTest> {
    const { scorerPrompt, testName, personaHint } = await generateScorerPrompt(problemDescription);

    const test: BehaviorTest = {
        id: `test-${Date.now()}`,
        name: testName,
        problemDescription,
        scorerPrompt,
        personaHint,
        simulationCount,
        createdAt: new Date().toISOString(),
    };

    await saveBehaviorTest(agentId, test);
    return test;
}

// Generate personas specifically for a behavior test
export async function generateTestPersonas(
    test: BehaviorTest,
    nodes: OverridableNode[]
): Promise<Persona[]> {
    const agentContext = extractAgentContext(nodes);
    const newPersonas = await generateBehaviorTestPersonas(
        test.simulationCount,
        test.problemDescription,
        test.personaHint,
        agentContext
    );
    return newPersonas;
}

// Run a single simulation for behavior testing
export async function runBehaviorSimulation(
    agentId: string,
    persona: Persona,
    nodes: OverridableNode[],
    stateOverrides?: Record<string, string>
): Promise<ConversationTurn[]> {
    const turns: ConversationTurn[] = [];
    let currentHistory: { role: string; content: string }[] = [];
    let currentChatId: string | undefined = undefined;

    // Run 5 turns of conversation
    for (let i = 0; i < 5; i++) {
        // Generate user message
        const userContent = await generateUserResponse(persona, currentHistory);
        turns.push({ role: 'user', content: userContent });
        currentHistory.push({ role: 'user', content: userContent });

        // Get agent response
        const agentResponse = await sendChatWithOverrides(agentId, userContent, currentChatId, nodes, stateOverrides);
        currentChatId = agentResponse.chatId;

        turns.push({
            role: 'assistant',
            content: agentResponse.text,
            traceData: agentResponse.agentReasoning
        });
        currentHistory.push({ role: 'assistant', content: agentResponse.text });

        await new Promise(r => setTimeout(r, 300));
    }

    return turns;
}

// Score a completed conversation
export async function scoreBehaviorConversation(
    test: BehaviorTest,
    conversation: ConversationTurn[],
    persona: Persona
): Promise<{ score: number; rationale: string; passed: boolean }> {
    const { score, rationale } = await scoreConversation(test.scorerPrompt, conversation, persona);
    return {
        score,
        rationale,
        passed: score >= 0.7
    };
}

// Run a single persona simulation and return result
async function runSinglePersonaTest(
    agentId: string,
    persona: Persona,
    test: BehaviorTest,
    nodes: OverridableNode[],
    stateOverrides: Record<string, string> | undefined,
    index: number,
    braintrustExperiment: any
): Promise<BehaviorTestResult> {
    console.log(`[Experiment] Starting simulation ${index + 1} for ${persona.name}`);

    const conversation = await runBehaviorSimulation(agentId, persona, nodes, stateOverrides);
    const { score, rationale, passed } = await scoreBehaviorConversation(test, conversation, persona);

    const result: BehaviorTestResult = {
        id: `result-${Date.now()}-${index}`,
        personaId: persona.id,
        persona,
        conversation,
        score,
        passed,
        rationale,
        scoredAt: new Date().toISOString(),
    };

    if (braintrustExperiment) {
        try {
            await logToBraintrust(braintrustExperiment, test, result);
        } catch (error) {
            console.error('Failed to log to Braintrust:', error);
        }
    }

    console.log(`[Experiment] Completed simulation ${index + 1} for ${persona.name} - Score: ${score}`);
    return result;
}

// Run a complete behavior experiment
export async function runBehaviorExperiment(
    agentId: string,
    test: BehaviorTest,
    nodes: OverridableNode[],
    stateOverrides?: Record<string, string>
): Promise<BehaviorExperiment> {
    const startTime = Date.now();
    console.log(`[Experiment] Starting behavior experiment: ${test.name}`);

    let braintrustExperiment: any = null;
    let braintrustUrl: string | undefined;

    try {
        const { experiment } = await initBraintrustExperiment(test.name);
        braintrustExperiment = experiment;
        console.log('[Experiment] Braintrust experiment initialized');
    } catch (error) {
        console.error('Failed to init Braintrust experiment:', error);
    }

    console.log(`[Experiment] Generating ${test.simulationCount} personas...`);
    const personas = await generateTestPersonas(test, nodes);
    console.log(`[Experiment] Generated ${personas.length} personas`);

    const experimentId = `exp-${Date.now()}`;
    const experiment: BehaviorExperiment = {
        id: experimentId,
        testId: test.id,
        test,
        results: [],
        summary: {
            total: personas.length,
            passed: 0,
            failed: 0,
            passRate: 0,
            avgScore: 0,
        },
        status: 'running',
        createdAt: new Date().toISOString(),
    };

    await saveBehaviorExperiment(agentId, experiment);
    console.log(`[Experiment] Created experiment record: ${experimentId}`);

    console.log(`[Experiment] Starting ${personas.length} simulations in parallel...`);

    const resultPromises = personas.map((persona, index) =>
        runSinglePersonaTest(agentId, persona, test, nodes, stateOverrides, index, braintrustExperiment)
            .catch(error => {
                console.error(`[Experiment] Failed simulation for ${persona.name}:`, error);
                return null;
            })
    );

    const resultsWithNulls = await Promise.all(resultPromises);
    const results = resultsWithNulls.filter((r): r is BehaviorTestResult => r !== null);

    console.log(`[Experiment] All simulations complete. ${results.length}/${personas.length} succeeded`);

    if (braintrustExperiment) {
        try {
            const { url } = await summarizeExperiment(braintrustExperiment);
            braintrustUrl = url;
        } catch (error) {
            console.error('Failed to summarize Braintrust experiment:', error);
        }
    }

    console.log('[Experiment] Generating AI insights...');
    let aiInsights = { aiSummary: '', recommendations: [] as string[] };
    try {
        aiInsights = await generateExperimentInsights(test, results);
        console.log('[Experiment] AI insights generated');
    } catch (error) {
        console.error('Failed to generate AI insights:', error);
    }

    experiment.results = results;
    experiment.summary = {
        ...calculateSummary(results, Date.now() - startTime),
        aiSummary: aiInsights.aiSummary,
        recommendations: aiInsights.recommendations
    };
    experiment.braintrustUrl = braintrustUrl;
    experiment.status = 'completed';
    experiment.completedAt = new Date().toISOString();

    await saveBehaviorExperiment(agentId, experiment);
    console.log(`[Experiment] Experiment completed: ${experiment.summary.passRate}% pass rate`);

    return experiment;
}

function calculateSummary(results: BehaviorTestResult[], duration: number): ExperimentSummary {
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

    return {
        total: results.length,
        passed,
        failed,
        passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
        avgScore: Math.round(avgScore * 100) / 100,
        duration,
    };
}

export async function fetchBehaviorTests(agentId: string): Promise<BehaviorTest[]> {
    return await loadBehaviorTests(agentId);
}

export async function deleteBehaviorTestAction(agentId: string, testId: string): Promise<BehaviorTest[]> {
    return await removeBehaviorTest(agentId, testId);
}

export async function fetchBehaviorExperiments(agentId: string): Promise<BehaviorExperiment[]> {
    return await loadAllBehaviorExperiments(agentId);
}

export async function fetchBehaviorExperiment(agentId: string, experimentId: string): Promise<BehaviorExperiment | null> {
    return await loadBehaviorExperiment(agentId, experimentId);
}

export async function deleteBehaviorExperimentAction(agentId: string, experimentId: string): Promise<void> {
    await removeBehaviorExperiment(agentId, experimentId);
}

export async function clearBehaviorExperiments(agentId: string): Promise<void> {
    await clearAllBehaviorExperiments(agentId);
}

// ============ MASTER VERSION ============

export async function updateMasterVersion(
    agentId: string,
    nodes: OverridableNode[],
    stateOverrides: Record<string, string>
): Promise<MasterVersion> {
    console.log('[Master] Saving master version...');
    const master = await saveMasterVersion(agentId, nodes, stateOverrides);
    console.log('[Master] Master version saved at:', master.lastUpdated);
    return master;
}

export async function fetchMasterVersion(agentId: string): Promise<MasterVersion | null> {
    return await loadMasterVersion(agentId);
}

export async function hasMasterVersion(agentId: string): Promise<boolean> {
    return await masterVersionExists(agentId);
}

// ============ PROMPT SET VERSIONS ============

export async function createPromptVersion(
    agentId: string,
    name: string,
    nodes: OverridableNode[],
    stateOverrides: Record<string, string>,
    description?: string,
    basedOnExperimentId?: string
): Promise<PromptSetVersion> {
    const version: PromptSetVersion = {
        id: `version-${Date.now()}`,
        name,
        description,
        createdAt: new Date().toISOString(),
        nodes: nodes.map(n => ({
            id: n.id,
            label: n.label,
            type: n.type,
            systemMessagePrompt: n.systemMessagePrompt,
            humanMessagePrompt: n.humanMessagePrompt,
        })),
        stateValues: { ...stateOverrides },
        basedOnExperimentId,
    };

    await savePromptSetVersion(agentId, version);
    console.log(`[Version] Created prompt version: ${name}`);

    await saveMasterVersion(agentId, nodes, stateOverrides);
    console.log(`[Master] Master version synced with new version: ${name}`);

    return version;
}

export async function fetchPromptVersions(agentId: string): Promise<PromptSetVersion[]> {
    return await loadPromptSetVersions(agentId);
}

export async function fetchPromptVersion(agentId: string, versionId: string): Promise<PromptSetVersion | null> {
    return await loadPromptSetVersion(agentId, versionId);
}

export async function deletePromptVersionAction(agentId: string, versionId: string): Promise<PromptSetVersion[]> {
    return await deletePromptSetVersion(agentId, versionId);
}

export async function getVersionConfig(agentId: string, versionId: string): Promise<{
    nodes: OverridableNode[];
    stateValues: Record<string, string>;
} | null> {
    const version = await loadPromptSetVersion(agentId, versionId);
    if (!version) return null;

    const nodes: OverridableNode[] = version.nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type || 'Agent',
        systemMessagePrompt: n.systemMessagePrompt,
        humanMessagePrompt: n.humanMessagePrompt,
    }));

    return {
        nodes,
        stateValues: version.stateValues,
    };
}

// ============ PROMPT REFINEMENT ============

export interface PromptRefineContext {
    nodes: OverridableNode[];
    stateFields: Record<string, string>;
}

export async function refinePrompt(
    currentPrompt: string,
    instructions: string,
    type: 'system' | 'human',
    nodeLabel?: string,
    agentContext?: PromptRefineContext
) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }

    let contextXml = '';

    if (agentContext) {
        const { stateFields, nodes } = agentContext;

        contextXml = `
<agent_configuration>
    <brand_settings>
        <brand_name>${stateFields.brand_name || ''}</brand_name>
        <brand_voice_description>${stateFields.brand_voice_description || ''}</brand_voice_description>
        <business_hours>${stateFields.brand_business_hours || ''}</business_hours>
        <business_timezone>${stateFields.brand_business_timezone || ''}</business_timezone>
    </brand_settings>

    <general_rules>
        <brand_system_base>
${stateFields.brand_system_base || ''}
        </brand_system_base>

        <additional_general_rules>
${stateFields.additional_general_rules || ''}
        </additional_general_rules>
    </general_rules>

    <customer_type_rules>
        <additional_customers_rules>
${stateFields.additional_customers_rules || ''}
        </additional_customers_rules>

        <additional_prospects_rules>
${stateFields.additional_prospects_rules || ''}
        </additional_prospects_rules>
    </customer_type_rules>

    <qa_pairs>
${stateFields.qa_pairs || ''}
    </qa_pairs>

    <agent_prompts>
${nodes.map(n => `        <${n.label.toLowerCase().replace(/\s+/g, '_')}_prompt node_id="${n.id}">
${n.systemMessagePrompt || ''}
        </${n.label.toLowerCase().replace(/\s+/g, '_')}_prompt>`).join('\n\n')}
    </agent_prompts>
</agent_configuration>
`;
    }

    const systemPrompt = `You are an expert Prompt Engineer for conversational AI agents.

${contextXml ? `FULL AGENT CONTEXT:
${contextXml}

The above shows the complete agent configuration including:
- Brand settings (name, voice, hours)
- General rules (brand_system_base contains persona guidelines, communication rules)
- Customer-type specific rules (for prospects and existing customers)
- Q&A pairs for common questions
- All agent prompts for different flows

Use this context to understand how the prompt you're editing fits into the larger system.
` : ''}

YOUR TASK:
Refine the following ${type} prompt${nodeLabel ? ` for the "${nodeLabel}" agent` : ''} based on the user's instructions.

User Instructions: ${instructions}

Current Prompt to Refine:
"""
${currentPrompt}
"""

IMPORTANT:
- Maintain consistency with the general rules (brand_system_base, additional_general_rules)
- Keep the same template variables like {brand_name}, {system_base}, {business_hours}, etc.
- Follow the established voice and tone from brand_voice_description
- Return ONLY the refined prompt text
- Do not add explanations or markdown blocks unless part of the prompt`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }],
        model: 'gpt-4o',
    });

    return completion.choices[0].message.content || currentPrompt;
}

export async function optimizeGlobalPrompts(chatHistory: string, nodes: OverridableNode[], userRule?: string) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }

    const nodesContext = nodes.map(n => `
    Node ID: ${n.id}
    Label: ${n.label}
    Type: ${n.type}
    Current System Prompt: "${n.systemMessagePrompt || ''}"
    Current Human Prompt: "${n.humanMessagePrompt || ''}"
    `).join('\n---\n');

    const systemPrompt = `You are an expert AI Agent Architect.
    Your goal is to analyze a conversation transcript and the current configuration of the agent's nodes to suggest improvements.

    You have access to the following Agent Nodes and their Prompts:
    ${nodesContext}

    Analyze the following Chat Transcript for issues, missed requirements, or opportunities for better alignment with goals.
    ${userRule ? `IMPORTANT: The user has provided a specific rule to apply: "${userRule}". You MUST prioritize applying this rule to the most relevant node.` : ''}
    Identify which specific node's prompt needs editing to fix the issue.

    Return a JSON array of suggestions. Each suggestion must have:
    - nodeId: string (The ID of the node to edit)
    - type: "systemMessagePrompt" | "humanMessagePrompt"
    - reasoning: string (Why this change is needed)
    - newPrompt: string (The fully rewritten prompt)

    Output ONLY valid JSON.`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Chat Transcript:\n${chatHistory}` }
        ],
        model: 'gpt-4o',
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) return [];

    const result = JSON.parse(content);
    return Array.isArray(result) ? result : result.suggestions || [];
}

// Refine a behavior test description using AI
export async function refineBehaviorTestPrompt(problemDescription: string): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are an expert at writing behavior test descriptions for AI agents.

Your task is to take a user's rough description of a behavior they want to test and refine it into a clear, specific, and testable behavior description.

A good behavior test description should:
1. Be SPECIFIC - clearly define the exact behavior expected
2. Be MEASURABLE - easy to determine if the agent passed or failed
3. Include TRIGGER CONDITIONS - when should this behavior occur
4. Include EXPECTED RESPONSE - what the agent should do/say
5. Be CONCISE - 2-4 sentences max

Return ONLY the refined description, no explanations or quotes.`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Refine this behavior test description:\n\n"${problemDescription}"` }
        ],
        temperature: 1,
    });

    return completion.choices[0].message.content || problemDescription;
}

interface RefinementResult {
    field: string;
    fieldType: 'state' | 'node';
    nodeId?: string;
    original: string;
    refined: string;
    explanation: string;
}

interface RefinePromptResponse {
    refinements: RefinementResult[];
    summary: string;
}

export async function refinePromptWithAI(
    instruction: string,
    nodes: OverridableNode[],
    stateOverrides: Record<string, string>
): Promise<RefinePromptResponse> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('Missing OPENAI_API_KEY');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const contextXml = `
<current_configuration>
    <state_fields>
        <brand_system_base>
${stateOverrides.brand_system_base || '(empty)'}
        </brand_system_base>

        <additional_general_rules>
${stateOverrides.additional_general_rules || '(empty)'}
        </additional_general_rules>

        <additional_prospects_rules>
${stateOverrides.additional_prospects_rules || '(empty)'}
        </additional_prospects_rules>

        <additional_customers_rules>
${stateOverrides.additional_customers_rules || '(empty)'}
        </additional_customers_rules>
    </state_fields>

    <agent_prompts>
${nodes.map(n => `        <prompt node_id="${n.id}" label="${n.label}">
${n.systemMessagePrompt || '(empty)'}
        </prompt>`).join('\n\n')}
    </agent_prompts>
</current_configuration>
`;

    const systemPrompt = `You are an expert Prompt Engineer for conversational AI agents.

Your task is to analyze the user's request and determine which specific field(s) need to be modified.

CURRENT AGENT CONFIGURATION:
${contextXml}

AVAILABLE FIELDS TO MODIFY:
- State fields: brand_system_base, additional_general_rules, additional_prospects_rules, additional_customers_rules
- Agent prompts: ${nodes.map(n => `${n.label} (${n.id})`).join(', ')}

USER'S REQUEST:
"${instruction}"

INSTRUCTIONS:
1. Analyze which field(s) the user wants to modify based on their request
2. For each field that needs changes, provide the complete refined version
3. Only modify fields that are directly related to the user's request
4. Preserve template variables like {brand_name}, {system_base}, etc.
5. Keep the same general structure and formatting of the original

Respond in JSON format:
{
    "refinements": [
        {
            "field": "field_name",
            "fieldType": "state" or "node",
            "nodeId": "node_id if fieldType is node, null otherwise",
            "original": "first 100 chars of original...",
            "refined": "the complete refined content",
            "explanation": "brief explanation of what was changed and why"
        }
    ],
    "summary": "brief summary of all changes made"
}

IMPORTANT:
- The "refined" field must contain the COMPLETE new content, not just the changes
- Only include fields that actually need modification
- Be surgical - make minimal changes to achieve the user's goal`;

    try {
        console.log('[RefineAI] Sending request to OpenAI...');

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Please analyze and suggest refinements based on: "${instruction}"` }
            ],
            temperature: 1,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response from OpenAI');
        }

        console.log('[RefineAI] Received response, parsing...');
        const result = JSON.parse(content) as RefinePromptResponse;

        for (const refinement of result.refinements) {
            if (refinement.fieldType === 'state') {
                refinement.original = stateOverrides[refinement.field] || '';
            } else if (refinement.fieldType === 'node' && refinement.nodeId) {
                const node = nodes.find(n => n.id === refinement.nodeId);
                refinement.original = node?.systemMessagePrompt || '';
            }
        }

        console.log(`[RefineAI] Suggested ${result.refinements.length} refinements`);
        return result;
    } catch (error) {
        console.error('[RefineAI] Failed to refine prompts:', error);
        throw error;
    }
}
