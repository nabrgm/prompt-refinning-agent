import { PolarisGraph, OverridableNode, StateField, StateMemory } from '@/types/polaris';
import {
    loadAgentGraph,
    getAgentOverrides,
    getAgentStateOverrides,
    saveAgentOverride,
    saveAgentStateOverride,
    saveNodePromptVersion,
    loadNodePromptVersions,
    updateNodePromptVersion,
    saveMasterVersion
} from './persistence';

// ============ AGENT GRAPH FUNCTIONS ============

// Get the Polaris graph for a specific agent
export async function getPolarisGraph(agentId: string): Promise<PolarisGraph> {
    const graph = await loadAgentGraph(agentId);
    if (!graph) {
        throw new Error(`Agent graph not found for agent: ${agentId}`);
    }
    return graph;
}

// ============ STATE MEMORY ============

// Get state memory from the graph - flexible detection
export async function getStateMemory(agentId: string): Promise<StateMemory | null> {
    const graph = await getPolarisGraph(agentId);
    const savedOverrides = await getAgentStateOverrides(agentId);

    // Flexible: Find any node that looks like a state node
    // Check for seqState, State type, or any node with stateMemoryUI
    const stateNode = graph.nodes.find(n =>
        n.data.name === 'seqState' ||
        n.data.id?.includes('State') ||
        n.data.type === 'State' ||
        n.data.inputs?.stateMemoryUI
    );

    if (!stateNode) {
        console.log('No state node found in graph');
        return null;
    }

    const stateMemoryUI = stateNode.data.inputs?.stateMemoryUI;
    if (!stateMemoryUI) {
        console.log('State node has no stateMemoryUI');
        return null;
    }

    try {
        const fields: StateField[] = JSON.parse(stateMemoryUI);
        // Apply saved overrides to default values
        const fieldsWithOverrides = fields.map(f => ({
            ...f,
            defaultValue: savedOverrides[f.key] !== undefined ? savedOverrides[f.key] : f.defaultValue
        }));

        return {
            nodeId: stateNode.data.id,
            fields: fieldsWithOverrides
        };
    } catch (error) {
        console.error('Error parsing state memory:', error);
        return null;
    }
}

// Save a state field override
export async function saveStateOverride(agentId: string, key: string, value: string) {
    await saveAgentStateOverride(agentId, key, value);
    console.log(`Saved state override for ${key}`);
}

// ============ OVERRIDABLE NODES ============

// Check if a node is overridable (has prompts) - flexible detection
function isOverridableNode(node: any): boolean {
    const data = node.data;

    // Check type - be flexible with naming
    const typeMatches =
        data.type === 'LLMNode' ||
        data.type === 'Agent' ||
        data.type?.includes('LLM') ||
        data.type?.includes('Agent') ||
        data.name === 'seqLLMNode' ||
        data.name === 'seqAgent' ||
        data.name?.includes('LLM') ||
        data.name?.includes('Agent');

    // Also check if it has prompt inputs regardless of type
    const hasPrompts =
        data.inputs?.systemMessagePrompt ||
        data.inputs?.humanMessagePrompt;

    return typeMatches || hasPrompts;
}

// Get all overridable nodes for an agent
export async function getOverridableNodes(agentId: string): Promise<OverridableNode[]> {
    const graph = await getPolarisGraph(agentId);
    const savedOverrides = await getAgentOverrides(agentId);
    const nodes = graph.nodes;

    const overridableNodes: OverridableNode[] = [];

    for (const node of nodes) {
        if (isOverridableNode(node)) {
            const defaultSystemPrompt = node.data.inputs?.systemMessagePrompt;
            const defaultHumanPrompt = node.data.inputs?.humanMessagePrompt;

            if (defaultSystemPrompt || defaultHumanPrompt) {
                const saved = savedOverrides[node.data.id] || {};

                overridableNodes.push({
                    id: node.data.id,
                    label: node.data.label || node.data.name || node.data.id,
                    type: node.data.type || 'Unknown',
                    systemMessagePrompt: saved.systemMessagePrompt !== undefined ? saved.systemMessagePrompt : defaultSystemPrompt,
                    humanMessagePrompt: saved.humanMessagePrompt !== undefined ? saved.humanMessagePrompt : defaultHumanPrompt,
                });
            }
        }
    }

    return overridableNodes;
}

// ============ PROMPT OVERRIDES ============

export async function savePromptOverride(agentId: string, nodeId: string, type: 'systemMessagePrompt' | 'humanMessagePrompt', newPrompt: string) {
    await saveAgentOverride(agentId, nodeId, type, newPrompt);
    console.log(`Saved override for ${nodeId} (${type})`);
}

// ============ PROMPT VERSIONS ============

export async function savePromptVersion(agentId: string, nodeId: string, label: string, systemPrompt?: string, humanPrompt?: string) {
    return await saveNodePromptVersion(agentId, nodeId, label, systemPrompt, humanPrompt);
}

export async function getPromptVersions(agentId: string, nodeId: string) {
    return await loadNodePromptVersions(agentId, nodeId);
}

export async function updatePromptVersion(agentId: string, nodeId: string, versionId: string, systemPrompt?: string, humanPrompt?: string) {
    return await updateNodePromptVersion(agentId, nodeId, versionId, systemPrompt, humanPrompt);
}

// ============ STATE VALUE INJECTION ============

// Helper to inject state values into a prompt template
// Replaces {variable_name} with actual values from state
function injectStateValues(promptTemplate: string, stateValues: Record<string, string>): string {
    let result = promptTemplate;

    // FIRST: Handle common aliases (like {system_base} -> brand_system_base)
    // This must happen BEFORE the main loop so nested placeholders get resolved
    if (stateValues.brand_system_base) {
        result = result.replace(/\{system_base\}/g, stateValues.brand_system_base);
    }

    // Replace all {variable_name} patterns with actual values
    // This will now also resolve placeholders that were inside brand_system_base
    // (like {additional_general_rules})
    for (const [key, value] of Object.entries(stateValues)) {
        const pattern = new RegExp(`\\{${key}\\}`, 'g');
        result = result.replace(pattern, value || '');
    }

    return result;
}

// Build a complete system prompt by combining all node prompts with injected state values
// This creates a single comprehensive prompt that includes all agent instructions
function buildCompleteSystemPrompt(
    nodes: OverridableNode[],
    stateValues: Record<string, string>
): string {
    const sections: string[] = [];

    // Add general rules from state
    if (stateValues.brand_system_base) {
        sections.push(`<general_rules>\n${stateValues.brand_system_base}\n</general_rules>`);
    }

    if (stateValues.additional_general_rules) {
        sections.push(`<additional_rules>\n${stateValues.additional_general_rules}\n</additional_rules>`);
    }

    // Add brand context
    const brandContext = `<brand_context>
Brand: ${stateValues.brand_name || ''}
Voice: ${stateValues.brand_voice_description || ''}
Business Hours: ${stateValues.brand_business_hours || ''} (${stateValues.brand_business_timezone || ''})
</brand_context>`;
    sections.push(brandContext);

    // Add customer type specific rules
    if (stateValues.additional_prospects_rules) {
        sections.push(`<prospect_rules>\n${stateValues.additional_prospects_rules}\n</prospect_rules>`);
    }

    if (stateValues.additional_customers_rules) {
        sections.push(`<customer_rules>\n${stateValues.additional_customers_rules}\n</customer_rules>`);
    }

    // Add each node's system prompt with state values injected
    for (const node of nodes) {
        if (node.systemMessagePrompt) {
            const injectedPrompt = injectStateValues(node.systemMessagePrompt, stateValues);
            sections.push(`<agent_prompt label="${node.label}">\n${injectedPrompt}\n</agent_prompt>`);
        }
    }

    // Add FAQs if available
    if (stateValues.qa_pairs) {
        sections.push(`<faqs>\n${stateValues.qa_pairs}\n</faqs>`);
    }

    return sections.join('\n\n');
}

// ============ OVERRIDE CONFIG ============

// Helper to calculate the override config for the API
// When forceAll is true, builds a complete prompt with all state values injected
export async function calculateOverrideConfig(
    agentId: string,
    currentNodes: OverridableNode[],
    stateOverrides?: Record<string, string>,
    forceAll: boolean = false
) {
    const graph = await getPolarisGraph(agentId);

    // Get original state values from the graph - flexible detection
    const stateNode = graph.nodes.find(n =>
        n.data.name === 'seqState' ||
        n.data.id?.includes('State') ||
        n.data.type === 'State' ||
        n.data.inputs?.stateMemoryUI
    );

    let originalStateValues: Record<string, string> = {};

    if (stateNode) {
        const stateMemoryUI = stateNode.data.inputs?.stateMemoryUI;
        if (stateMemoryUI) {
            try {
                const fields: StateField[] = JSON.parse(stateMemoryUI);
                for (const field of fields) {
                    originalStateValues[field.key] = field.defaultValue || '';
                }
            } catch (error) {
                console.error('Error parsing state memory:', error);
            }
        }
    }

    // Merge original state with overrides
    const mergedStateValues = {
        ...originalStateValues,
        ...(stateOverrides || {})
    };

    if (forceAll) {
        // Build node-specific overrides with all variables injected
        // Polaris expects: { systemMessagePrompt: { nodeId: prompt, ... } }
        const systemMessagePromptOverrides: Record<string, string> = {};

        for (const node of currentNodes) {
            if (node.systemMessagePrompt) {
                // Inject all state values into the prompt
                const injectedPrompt = injectStateValues(node.systemMessagePrompt, mergedStateValues);
                systemMessagePromptOverrides[node.id] = injectedPrompt;
            }
        }

        const overrideConfig: Record<string, any> = {};

        if (Object.keys(systemMessagePromptOverrides).length > 0) {
            overrideConfig.systemMessagePrompt = systemMessagePromptOverrides;
        }

        console.log('=== OVERRIDE CONFIG DEBUG ===');
        console.log('Nodes being overridden:', Object.keys(systemMessagePromptOverrides));
        for (const [nodeId, prompt] of Object.entries(systemMessagePromptOverrides)) {
            console.log(`Node ${nodeId} prompt preview:`, typeof prompt, prompt.substring(0, 200));
        }

        return overrideConfig;
    }

    // For non-forced overrides (normal chat), check if anything changed
    let hasOverrides = false;
    const overrideConfig: Record<string, any> = {};

    // Check if any state values differ
    for (const [key, value] of Object.entries(stateOverrides || {})) {
        if (originalStateValues[key] !== value) {
            hasOverrides = true;
            break;
        }
    }

    // Check if any node prompts differ
    for (const currentNode of currentNodes) {
        const originalNode = graph.nodes.find(n => n.data.id === currentNode.id);
        if (!originalNode) continue;

        const originalSystem = originalNode.data.inputs?.systemMessagePrompt;
        if (currentNode.systemMessagePrompt !== originalSystem) {
            hasOverrides = true;
            break;
        }
    }

    if (hasOverrides) {
        // Build node-specific overrides with variables injected
        const systemMessagePromptOverrides: Record<string, string> = {};

        for (const node of currentNodes) {
            if (node.systemMessagePrompt) {
                const injectedPrompt = injectStateValues(node.systemMessagePrompt, mergedStateValues);
                systemMessagePromptOverrides[node.id] = injectedPrompt;
            }
        }

        if (Object.keys(systemMessagePromptOverrides).length > 0) {
            overrideConfig.systemMessagePrompt = systemMessagePromptOverrides;
        }

        console.log('Built node-specific overrides for nodes:', Object.keys(systemMessagePromptOverrides));
        return overrideConfig;
    }

    return undefined;
}

// ============ EXTRACT FROM GRAPH ============

// Extract all state field keys and their default values from a graph
export function extractStateFieldsFromGraph(graph: PolarisGraph): StateField[] {
    const stateNode = graph.nodes.find(n =>
        n.data.name === 'seqState' ||
        n.data.id?.includes('State') ||
        n.data.type === 'State' ||
        n.data.inputs?.stateMemoryUI
    );

    if (!stateNode?.data.inputs?.stateMemoryUI) {
        return [];
    }

    try {
        return JSON.parse(stateNode.data.inputs.stateMemoryUI);
    } catch {
        return [];
    }
}

// Extract all overridable nodes from a graph (for initial registration)
export function extractOverridableNodesFromGraph(graph: PolarisGraph): OverridableNode[] {
    const nodes: OverridableNode[] = [];

    for (const node of graph.nodes) {
        if (isOverridableNode(node)) {
            const systemPrompt = node.data.inputs?.systemMessagePrompt;
            const humanPrompt = node.data.inputs?.humanMessagePrompt;

            if (systemPrompt || humanPrompt) {
                nodes.push({
                    id: node.data.id,
                    label: node.data.label || node.data.name || node.data.id,
                    type: node.data.type || 'Unknown',
                    systemMessagePrompt: systemPrompt,
                    humanMessagePrompt: humanPrompt,
                });
            }
        }
    }

    return nodes;
}
