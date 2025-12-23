import OpenAI from 'openai';
import { Persona } from '@/types/simulation';

// Initialize OpenAI client
// In a real app, ensure OPENAI_API_KEY is set in .env.local
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key', // Fallback for build, but will fail at runtime if not set
    dangerouslyAllowBrowser: true // Only for client-side testing if needed, but we use server actions
});

export interface AgentContext {
    brandName?: string;
    agentGoals?: string[];
    services?: string[];
    nodePrompts: { nodeId: string; label: string; systemPrompt: string }[];
}

// Generate personas with user description + agent context
export async function generatePersonas(
    count: number,
    description: string,
    agentContext?: AgentContext
): Promise<Persona[]> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    // Build context from agent prompts if available
    let contextSection = '';
    if (agentContext && agentContext.nodePrompts.length > 0) {
        const agentInfo = agentContext.nodePrompts
            .map(n => `[${n.label}]: ${n.systemPrompt.substring(0, 500)}...`)
            .join('\n\n');

        contextSection = `
IMPORTANT: The AI agent being tested is configured as follows:
${agentContext.brandName ? `Brand: ${agentContext.brandName}` : ''}
${agentContext.services?.length ? `Services: ${agentContext.services.join(', ')}` : ''}

Agent Configuration:
${agentInfo}

Generate personas that would realistically interact with THIS specific agent and its services.
`;
    }

    const prompt = `Generate ${count} distinct user personas for testing an AI agent.

User's Scenario/Focus: ${description}
${contextSection}

Analyze the agent configuration above to understand what business/service this agent represents.
Then create personas that match BOTH:
1. The user's scenario/focus: "${description}"
2. The actual business context from the agent prompts

Return a JSON object with a "personas" array. Each persona should have:
- name: string (realistic full name)
- role: string (their role relevant to this business)
- goal: string (specific goal related to the agent's services)
- context: string (their situation and why they're reaching out)
- tone: string (communication style: friendly, impatient, skeptical, etc.)

Output ONLY valid JSON.`;

    const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-5.2', // For persona generation
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Failed to generate personas");

    const result = JSON.parse(content);
    const personas = Array.isArray(result) ? result : result.personas || [];

    return personas.map((p: any, index: number) => ({
        id: `persona-${Date.now()}-${index}`,
        ...p
    }));
}

// Generate personas for behavior testing with specific behaviors baked in
export async function generateBehaviorTestPersonas(
    count: number,
    behaviorDescription: string,
    personaHint: string,
    agentContext?: AgentContext
): Promise<Persona[]> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    // Build context from agent prompts if available
    let contextSection = '';
    if (agentContext && agentContext.nodePrompts.length > 0) {
        const agentInfo = agentContext.nodePrompts
            .map(n => `[${n.label}]: ${n.systemPrompt.substring(0, 500)}...`)
            .join('\n\n');

        contextSection = `
AGENT CONTEXT:
${agentContext.brandName ? `Brand: ${agentContext.brandName}` : ''}
${agentContext.services?.length ? `Services: ${agentContext.services.join(', ')}` : ''}

Agent Configuration:
${agentInfo}
`;
    }

    // Generate personas in batches to ensure we get the exact count requested
    // LLMs often don't follow count instructions precisely for larger numbers
    const BATCH_SIZE = 5;
    const allPersonas: Persona[] = [];
    let batchNumber = 0;

    while (allPersonas.length < count) {
        const remaining = count - allPersonas.length;
        const batchCount = Math.min(BATCH_SIZE, remaining);
        batchNumber++;

        console.log(`[Personas] Generating batch ${batchNumber}: ${batchCount} personas (${allPersonas.length}/${count} complete)`);

        const prompt = `Generate EXACTLY ${batchCount} distinct user personas for BEHAVIOR TESTING an AI agent.

BEHAVIOR BEING TESTED:
${behaviorDescription}

PERSONA REQUIREMENTS:
${personaHint}
${contextSection}

${allPersonas.length > 0 ? `
IMPORTANT: You have already generated these personas in previous batches. Make the new ones DIFFERENT:
${allPersonas.map(p => `- ${p.name} (${p.role})`).join('\n')}
` : ''}

CRITICAL INSTRUCTIONS:
You must create personas that will NATURALLY TRIGGER the behavior being tested. Analyze the behavior description above and:
1. Bake the triggering behavior directly into each persona's "goal" and "context"
2. Make sure the persona will naturally do/say things that test whether the agent exhibits the correct behavior
3. Each persona should approach the situation differently but all should trigger the same behavior test

EXAMPLES OF GOOD BEHAVIOR-TESTING PERSONAS:

Example 1 - Testing "Agent should use formal titles for doctors":
{
  "name": "Dr. Sarah Chen",
  "role": "Physician inquiring about services",
  "goal": "Ask about appointment scheduling. I'll mention I'm a doctor early in the conversation.",
  "context": "Board-certified cardiologist at City Hospital. Will introduce herself as 'Dr. Chen' or mention her MD credentials.",
  "tone": "professional and direct"
}

Example 2 - Testing "Agent should mention refund policy when customer is upset":
{
  "name": "Marcus Thompson",
  "role": "Frustrated customer with billing issue",
  "goal": "Complain about being overcharged. I'm very upset and will express my frustration clearly.",
  "context": "Was charged twice for the same service. Has been trying to resolve this for a week. Will use words like 'frustrated', 'unacceptable', 'terrible service'.",
  "tone": "angry and impatient"
}

Example 3 - Testing "Agent should not repeat back sensitive information":
{
  "name": "Jennifer Walsh",
  "role": "Customer verifying account details",
  "goal": "Update my account and verify my identity by sharing my SSN (fake: 412-55-7890) and date of birth (fake: 06/15/1985).",
  "context": "Needs to update billing address. Will proactively share personal details like SSN and DOB to 'verify identity'.",
  "tone": "helpful and trusting"
}

Return a JSON object with a "personas" array containing EXACTLY ${batchCount} personas. Each persona MUST have:
- name: string (realistic full name)
- role: string (their role relevant to this business)
- goal: string (what they want to achieve - MUST include triggering behavior)
- context: string (background that makes them naturally exhibit the test behavior)
- tone: string (communication style)

Make each persona UNIQUE but all should trigger the behavior being tested.
YOU MUST RETURN EXACTLY ${batchCount} PERSONAS - no more, no less.
Output ONLY valid JSON.`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-5.2',
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("Failed to generate personas");

        const result = JSON.parse(content);
        const batchPersonas = Array.isArray(result) ? result : result.personas || [];

        // Add personas with unique IDs
        const timestamp = Date.now();
        for (let i = 0; i < batchPersonas.length && allPersonas.length < count; i++) {
            allPersonas.push({
                id: `persona-${timestamp}-${allPersonas.length}`,
                ...batchPersonas[i]
            });
        }

        console.log(`[Personas] Batch ${batchNumber} complete: got ${batchPersonas.length} personas, total now ${allPersonas.length}/${count}`);
    }

    console.log(`[Personas] Generation complete: ${allPersonas.length} personas`);
    return allPersonas;
}

// Auto-generate personas based purely on agent context (no user description)
export async function generatePersonasFromContext(
    count: number,
    agentContext: AgentContext
): Promise<Persona[]> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    const agentInfo = agentContext.nodePrompts
        .map(n => `[${n.label}]: ${n.systemPrompt.substring(0, 800)}`)
        .join('\n\n---\n\n');

    const prompt = `You are generating test personas for an AI agent. Analyze the agent's configuration below to understand what business/service it represents, then create realistic personas who would interact with it.

AGENT CONFIGURATION & PROMPTS:
${agentInfo}

YOUR TASK:
1. First, understand from the prompts above: What business/brand is this? What services does it offer? What does the agent do?
2. Then generate ${count} diverse and realistic personas who would actually contact this specific business.

Create a MIX of:
- Different customer types (new prospects, existing customers, undecided)
- Different intents (want to buy, need support, asking questions, scheduling)
- Different tones (friendly, frustrated, skeptical, in a hurry, detail-oriented)
- Different scenarios relevant to THIS business

Each persona MUST be relevant to the actual business/services described in the agent prompts above.

Return a JSON object with a "personas" array. Each persona should have:
- name: string (realistic full name)
- role: string (their role/situation relevant to this business)
- goal: string (specific goal they want to achieve with this agent)
- context: string (their situation, why they're reaching out)
- tone: string (how they communicate: friendly, impatient, skeptical, etc.)

Output ONLY valid JSON.`;

    const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-5.2', // For persona generation
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Failed to generate personas");

    const result = JSON.parse(content);
    const personas = Array.isArray(result) ? result : result.personas || [];

    return personas.map((p: any, index: number) => ({
        id: `persona-${Date.now()}-${index}`,
        ...p
    }));
}

export async function generateUserResponse(persona: Persona, history: { role: string, content: string }[]): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    const isFirstMessage = history.length === 0;
    const turnNumber = Math.floor(history.length / 2) + 1;

    const systemPrompt = `You are roleplaying as ${persona.name}, a ${persona.role}.
    Your goal is: ${persona.goal}.
    Your background: ${persona.context}.
    Your tone is: ${persona.tone}.

    ${isFirstMessage ? `
    THIS IS YOUR FIRST MESSAGE - Start naturally like a real person would:
    - Say hi and briefly state what you're looking for (based on your goal)
    - Don't be too specific yet - you're just starting the conversation
    - Keep it simple and natural, 1-2 sentences max
    - Don't dump all your details upfront - let the conversation develop
    ` : `
    Respond naturally to the agent's last message. Keep it concise (1-3 sentences).
    Build on the conversation - provide info when asked, ask questions when needed.
    `}

    IMPORTANT - ACT ON YOUR GOAL:
    Your goal and context describe specific behaviors or information you should naturally bring up during this conversation.
    - Around turn 2-4: naturally introduce the key elements from your goal/context
    - Don't wait to be asked - proactively bring up what's described in your goal
    - If your context mentions specific details (names, numbers, complaints, questions), use them naturally
    - Stay in character and make it feel like a real conversation
    Current turn: ${turnNumber}

    Stay focused on your goal. Do not break character.`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role === 'user' ? 'assistant' : 'user', content: h.content })) // Invert roles for the simulator (User is Assistant to the Simulator)
    ] as any[];

    const completion = await openai.chat.completions.create({
        messages: messages,
        model: 'gpt-5.1', // For conversation generation
    });

    return completion.choices[0].message.content || "...";
}
