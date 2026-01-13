import OpenAI from 'openai';
import { Persona, EmotionDimension, Intent, GeneratedSimulationOptions } from '@/types/simulation';

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

// ============ Enhanced Simulation Generation ============

// Random name lists for realistic simulation (matching iprospect.py)
const FIRST_NAMES_MALE = [
    "James", "Michael", "Robert", "David", "William", "Richard", "Joseph", "Thomas",
    "Christopher", "Daniel", "Matthew", "Anthony", "Mark", "Steven", "Paul", "Andrew",
    "Joshua", "Kenneth", "Kevin", "Brian", "George", "Timothy", "Ronald", "Edward"
];

const FIRST_NAMES_FEMALE = [
    "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth", "Susan", "Jessica",
    "Sarah", "Karen", "Lisa", "Nancy", "Betty", "Margaret", "Sandra", "Ashley",
    "Kimberly", "Emily", "Donna", "Michelle", "Dorothy", "Carol", "Amanda", "Melissa"
];

const LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris"
];

export function generateRandomName(): string {
    const isMale = Math.random() > 0.5;
    const firstName = isMale
        ? FIRST_NAMES_MALE[Math.floor(Math.random() * FIRST_NAMES_MALE.length)]
        : FIRST_NAMES_FEMALE[Math.floor(Math.random() * FIRST_NAMES_FEMALE.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return `${firstName} ${lastName}`;
}

export function generateRandomPhone(): string {
    const areaCodes = ["512", "214", "713", "469", "817", "281", "972", "832"];
    const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
    const middle = Math.floor(Math.random() * 900) + 100;
    const last = Math.floor(Math.random() * 9000) + 1000;
    return `${areaCode}-${middle}-${last}`;
}

export function generateRandomEmail(name: string): string {
    const domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com"];
    const namePart = name.toLowerCase().replace(" ", ".");
    return `${namePart}@${domains[Math.floor(Math.random() * domains.length)]}`;
}

// Generate personas, emotions, and intents from onboarding guide
export async function generateFromOnboardingGuide(
    guideText: string,
    agentContext?: AgentContext
): Promise<GeneratedSimulationOptions> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    // Build context from agent prompts if available
    let agentContextSection = '';
    if (agentContext && agentContext.nodePrompts.length > 0) {
        const agentInfo = agentContext.nodePrompts
            .map(n => `[${n.label}]: ${n.systemPrompt.substring(0, 500)}...`)
            .join('\n\n');

        agentContextSection = `
AGENT CONFIGURATION:
${agentContext.brandName ? `Brand: ${agentContext.brandName}` : ''}
${agentContext.services?.length ? `Services: ${agentContext.services.join(', ')}` : ''}

Agent Prompts:
${agentInfo}
`;
    }

    const prompt = `Analyze the following onboarding guide and generate simulation test data for an AI agent.

ONBOARDING GUIDE:
${guideText}

${agentContextSection}

Based on this onboarding guide, generate EXACTLY:
1. 10 distinct PERSONAS - realistic customer profiles who would interact with this business
2. 10 distinct EMOTIONS - emotional states that customers might exhibit
3. 10 distinct INTENTS - categorized into three flow types: NEW_SALES_LEAD, EXISTING_CUSTOMER, UNDETERMINED

IMPORTANT REQUIREMENTS:

For PERSONAS, create diverse customers including:
- New prospects interested in services
- Existing customers with various needs
- Mix of business sizes and industries
- Different levels of urgency and decision-making authority

For EMOTIONS, cover the full spectrum:
- Positive (curious, excited, trusting)
- Neutral (matter-of-fact, professional)
- Negative (frustrated, impatient, skeptical)
- Each emotion should include how it manifests in conversation

For INTENTS, distribute them across the three flow types:
- NEW_SALES_LEAD (3-4 intents): New prospects wanting info, pricing, appointments
- EXISTING_CUSTOMER (3-4 intents): Current customers with billing, support, account issues
- UNDETERMINED (2-3 intents): Vague inquiries, greetings, unclear purpose

Each intent must include a realistic initial message that a customer would send.

Return a JSON object with this exact structure:
{
  "personas": [
    {
      "id": "persona-1",
      "name": "Full Name",
      "role": "Brief role description",
      "goal": "What they want to achieve",
      "context": "Background and situation",
      "tone": "Communication style"
    }
  ],
  "emotions": [
    {
      "id": "emotion-1",
      "name": "Emotion Name",
      "description": "How this emotion manifests in conversation"
    }
  ],
  "intents": [
    {
      "id": "intent-1",
      "name": "Intent Name",
      "flowType": "NEW_SALES_LEAD|EXISTING_CUSTOMER|UNDETERMINED",
      "description": "What this intent represents",
      "goal": "What the customer wants to accomplish",
      "initialMessage": "Example first message from customer"
    }
  ]
}

Output ONLY valid JSON.`;

    const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-5.2',
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Failed to generate simulation options");

    const result = JSON.parse(content);

    // Ensure IDs are properly set
    const personas: Persona[] = (result.personas || []).map((p: any, i: number) => ({
        id: `persona-${Date.now()}-${i}`,
        name: p.name,
        role: p.role,
        goal: p.goal,
        context: p.context,
        tone: p.tone,
    }));

    const emotions: EmotionDimension[] = (result.emotions || []).map((e: any, i: number) => ({
        id: `emotion-${Date.now()}-${i}`,
        name: e.name,
        description: e.description,
    }));

    const intents: Intent[] = (result.intents || []).map((intent: any, i: number) => ({
        id: `intent-${Date.now()}-${i}`,
        name: intent.name,
        flowType: intent.flowType as 'NEW_SALES_LEAD' | 'EXISTING_CUSTOMER' | 'UNDETERMINED',
        description: intent.description,
        goal: intent.goal,
        initialMessage: intent.initialMessage,
    }));

    return {
        personas,
        emotions,
        intents,
        generatedAt: new Date().toISOString(),
    };
}

// Generate enhanced user response for simulation (with emotion and intent context)
export async function generateEnhancedUserResponse(
    persona: Persona,
    emotion: EmotionDimension,
    intent: Intent,
    history: { role: string; content: string }[],
    customerName: string,
    customerPhone: string,
    customerEmail: string
): Promise<{ message: string; isComplete: boolean; outcome?: string }> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    const isFirstMessage = history.length === 0;
    const turnNumber = Math.floor(history.length / 2) + 1;

    // Flow-specific context (matching iprospect.py)
    const flowContext: Record<string, string> = {
        'NEW_SALES_LEAD': `You are a new prospect interested in the business's services.
You should naturally ask questions during the conversation such as:
- What services do you offer?
- What are your prices?
- How long does setup/installation take?
- Do I need a contract?
- What makes you different from competitors?
- Are there any promotions or discounts?
IMPORTANT: The agent should try to schedule an appointment with you.
When asked for scheduling, provide a preferred date (next business day or later), time, and timezone.
Don't immediately agree to everything - ask clarifying questions like a real prospect would.`,

        'EXISTING_CUSTOMER': `You are an existing customer with a support issue.
You have technical, billing, or account problems. Common issues include:
- Service outages or issues
- Billing questions or disputes
- Account access problems
- Equipment malfunctions
IMPORTANT: Act like a real customer - don't just accept the first answer:
- If given a generic support link, ask for more specific guidance
- Ask about expected resolution time
- Ask about compensation or credits if applicable
- Request specific department numbers or contact methods
- Ask follow-up questions to clarify the process
The agent should help resolve your issue or provide clear next steps.`,

        'UNDETERMINED': `You are a person whose customer status is unclear.
You may be:
- Just saying hello without context
- Asking vague questions
- Unsure what you need
- Testing the waters before committing
IMPORTANT: The agent should ask clarifying questions to determine if you're a new prospect or existing customer.
Respond naturally based on your persona - gradually reveal information as the conversation progresses.`
    };

    const systemPrompt = `You are simulating a customer for testing an AI virtual assistant.

FLOW TYPE: ${intent.flowType}
INTENT: ${intent.name} - ${intent.description}
YOUR PERSONA: ${persona.name}, ${persona.role}
YOUR GOAL: ${persona.goal}
YOUR EMOTIONAL STATE: ${emotion.name} - ${emotion.description}
YOUR BACKGROUND: ${persona.context}
YOUR COMMUNICATION STYLE: ${persona.tone}

${flowContext[intent.flowType] || ''}

INSTRUCTIONS:
- Stay in character as this specific persona throughout the conversation
- Express your emotional state (${emotion.name}) naturally in your responses
- Be realistic and natural in your responses
- Ask relevant follow-up questions based on what the agent tells you
- If the agent asks for information, provide realistic fake data
- Keep responses conversational and concise (1-3 sentences typically)
- DO NOT break character or mention you're testing

${isFirstMessage ? `
THIS IS YOUR FIRST MESSAGE. Use this initial message or a variation of it:
"${intent.initialMessage}"
` : `
Respond naturally to the agent's last message. Keep it concise.
Current turn: ${turnNumber}
`}

ENDING THE CONVERSATION:
- ONLY end the conversation when it has NATURALLY concluded and you have nothing more to ask
- When ready to end, format your FINAL message with "END Outcome: <result>"
- Example: "Thanks so much, I'll check that out! END Outcome: Customer directed to support resources."
- Example: "Perfect, I'll call at that time. Thanks! END Outcome: Appointment scheduled with agent."

CRITICAL - Do NOT end the conversation too early:
- If you still have follow-up questions, ASK THEM - don't end yet
- If the agent gave partial information and you want more details, ask for them
- If the agent gave a generic answer and you want specifics, probe deeper
- A real customer would naturally ask clarifying questions before saying goodbye
- You should have 3-8 turns of meaningful back-and-forth before ending

Only signal END when ALL of these are true:
1. You have received the information/help you needed
2. You have no more follow-up questions
3. You are ready to say goodbye and thank the agent
4. For NEW_SALES_LEAD: appointment is confirmed OR you've decided not to proceed
5. For EXISTING_CUSTOMER: your issue is resolved OR you have clear next steps
6. For UNDETERMINED: your customer type has been identified and handled appropriately

Example information you can provide if asked:
- Name: ${customerName}
- Phone: ${customerPhone}
- Email: ${customerEmail}
- ZIP Code: ${Math.floor(Math.random() * 90000) + 10000}
- Business Name: "${customerName}'s Business"
- Preferred appointment: "Tomorrow at 2pm Eastern" or "Next Monday morning"`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role === 'user' ? 'assistant' : 'user', content: h.content }))
    ] as any[];

    const completion = await openai.chat.completions.create({
        messages: messages,
        model: 'gpt-5.1',
        max_completion_tokens: 200,
        temperature: 0.7,
    });

    const response = completion.choices[0].message.content || "...";

    // Check for END signal
    const endPattern = /^([\s\S]*?)\s*END\s*(?:Outcome:\s*(.+))?$/i;
    const match = response.match(endPattern);

    if (match) {
        return {
            message: match[1].trim() || response,
            isComplete: true,
            outcome: match[2]?.trim(),
        };
    }

    return {
        message: response,
        isComplete: false,
    };
}
