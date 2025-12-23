import Braintrust from 'braintrust';
import OpenAI from 'openai';
import { BehaviorTest, BehaviorTestResult, ConversationTurn } from '@/types/behavior-test';
import { Persona } from '@/types/simulation';

// Initialize OpenAI for LLM judge
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Generate scorer prompt from user's problem description
export async function generateScorerPrompt(problemDescription: string): Promise<{
    scorerPrompt: string;
    testName: string;
    personaHint: string;
}> {
    const systemPrompt = `You are an expert at creating evaluation criteria for AI agents.

Given a problem description, generate:
1. A clear, specific LLM judge prompt that can evaluate if an AI agent exhibits the correct behavior
2. A short name for this test (2-4 words)
3. A hint for generating test personas relevant to this behavior

The scorer prompt should:
- Focus on the INTENT of the rule, not rigid mechanical interpretations
- Be pragmatic about how real conversations flow - the behavior can occur in the same message or across messages
- Consider the overall conversation outcome, not just technical compliance
- Use clear scoring criteria (0.0 = failed, 0.5 = partial, 1.0 = passed)
- Ask for a rationale explaining the score
- Reference {{conversation}} for the full conversation and {{persona}} for persona details

CRITICAL - Avoid these common mistakes that create overly rigid scorers:
1. DON'T require behaviors to happen in a specific "next message" - if the agent does the right thing in the same message, that's even better
2. DON'T penalize the agent for not repeating something after the user already acknowledged it (e.g., if user says "that's all I need", agent shouldn't ask "anything else?" again)
3. DON'T be overly technical about message boundaries - focus on whether the user got a good experience
4. DO consider natural conversation context - what a reasonable person would expect
5. DO give the agent credit if the intent of the rule is satisfied, even if not in the exact mechanical way described

Example of BAD scorer logic:
"The agent must ask 'anything else?' in the message AFTER the confirmation"
- This fails if agent combines confirmation + check-in in one message (which is actually better UX!)

Example of GOOD scorer logic:
"When confirming an appointment, the agent should check if the user needs anything else. This can be in the same message as the confirmation or immediately after. If the user has already indicated they're done, no additional check-in is needed."

Return JSON with: { "scorerPrompt": string, "testName": string, "personaHint": string }`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Problem: ${problemDescription}` }
        ],
        response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Failed to generate scorer prompt');

    return JSON.parse(content);
}

// Run the LLM judge on a conversation
export async function scoreConversation(
    scorerPrompt: string,
    conversation: ConversationTurn[],
    persona: Persona
): Promise<{ score: number; rationale: string }> {
    const conversationText = conversation
        .map(turn => `${turn.role === 'user' ? 'Lead' : 'Agent'}: ${turn.content}`)
        .join('\n\n');

    const personaText = `Name: ${persona.name}
Role: ${persona.role}
Goal: ${persona.goal}
Context: ${persona.context}
Tone: ${persona.tone}`;

    const filledPrompt = scorerPrompt
        .replace('{{conversation}}', conversationText)
        .replace('{{persona}}', personaText);

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.2',
        reasoning_effort: 'low',
        messages: [
            {
                role: 'system',
                content: `You are an expert evaluator. Analyze the conversation and score it based on the criteria provided. Return JSON with: { "score": number (0-1), "rationale": string }`
            },
            { role: 'user', content: filledPrompt }
        ],
        response_format: { type: 'json_object' },
    } as any);

    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Failed to score conversation');

    const result = JSON.parse(content);
    return {
        score: Math.max(0, Math.min(1, result.score)),
        rationale: result.rationale || 'No rationale provided'
    };
}

// Initialize and log to Braintrust experiment
export async function initBraintrustExperiment(testName: string): Promise<{
    experiment: any;
    projectName: string;
}> {
    const projectName = process.env.BRAINTRUST_PROJECT_NAME || 'Agent Behavior Tests';

    const experiment = Braintrust.init(projectName, {
        experiment: `${testName}-${Date.now()}`,
        apiKey: process.env.BRAINTRUST_API_KEY,
    });

    return { experiment, projectName };
}

// Log a single result to Braintrust
export async function logToBraintrust(
    experiment: any,
    test: BehaviorTest,
    result: BehaviorTestResult
) {
    const conversationText = result.conversation
        .map(turn => `${turn.role === 'user' ? 'Lead' : 'Agent'}: ${turn.content}`)
        .join('\n\n');

    experiment.log({
        input: {
            problemDescription: test.problemDescription,
            persona: {
                name: result.persona.name,
                role: result.persona.role,
                goal: result.persona.goal,
                context: result.persona.context,
                tone: result.persona.tone,
            },
        },
        output: conversationText,
        expected: 'Agent should exhibit correct behavior as described in the test',
        scores: {
            behaviorCompliance: result.score,
        },
        metadata: {
            testId: test.id,
            testName: test.name,
            personaId: result.personaId,
            passed: result.passed,
            rationale: result.rationale,
            turnCount: result.conversation.length,
        },
    });
}

// Get Braintrust experiment URL
export function getBraintrustUrl(projectName: string, experimentName: string): string {
    const orgSlug = process.env.BRAINTRUST_ORG_SLUG || '';
    return `https://www.braintrust.dev/app/${orgSlug}/p/${encodeURIComponent(projectName)}/experiments/${encodeURIComponent(experimentName)}`;
}

// Summarize experiment results
export async function summarizeExperiment(experiment: any): Promise<{
    url: string;
    stats: any;
}> {
    const summary = await experiment.summarize();
    return {
        url: summary.experimentUrl || '',
        stats: summary,
    };
}

// Generate AI summary and recommendations after all evals complete
export async function generateExperimentInsights(
    test: BehaviorTest,
    results: BehaviorTestResult[]
): Promise<{ aiSummary: string; recommendations: string[] }> {
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // Gather failed test rationales for analysis
    const failedRationales = results
        .filter(r => !r.passed)
        .map(r => `- ${r.persona.name} (${r.persona.role}): ${r.rationale}`)
        .join('\n');

    // Gather passed test rationales to understand what worked
    const passedRationales = results
        .filter(r => r.passed)
        .slice(0, 3) // Just a few examples
        .map(r => `- ${r.persona.name}: ${r.rationale}`)
        .join('\n');

    const systemPrompt = `You are an expert AI agent evaluator. Analyze the results of a behavior test and provide:
1. A concise summary (2-3 sentences) of the overall performance
2. Specific, actionable recommendations to improve the agent's behavior

Be direct and specific. Focus on patterns in failures and concrete fixes.`;

    const userPrompt = `## Behavior Test: ${test.name}

**Problem Being Tested:**
${test.problemDescription}

**Results:** ${passedCount}/${results.length} passed (${Math.round((passedCount / results.length) * 100)}%)
**Average Score:** ${avgScore.toFixed(2)}

${failedCount > 0 ? `**Failed Test Rationales:**
${failedRationales}` : ''}

${passedCount > 0 ? `**Sample Passed Rationales:**
${passedRationales}` : ''}

Provide your analysis as JSON:
{
    "summary": "Brief summary of performance...",
    "recommendations": ["Specific recommendation 1", "Specific recommendation 2", ...]
}`;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-5.2',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0].message.content;
        if (!content) {
            return {
                aiSummary: `${passedCount}/${results.length} tests passed with an average score of ${avgScore.toFixed(2)}.`,
                recommendations: []
            };
        }

        const result = JSON.parse(content);
        return {
            aiSummary: result.summary || '',
            recommendations: result.recommendations || []
        };
    } catch (error) {
        console.error('Failed to generate experiment insights:', error);
        return {
            aiSummary: `${passedCount}/${results.length} tests passed with an average score of ${avgScore.toFixed(2)}.`,
            recommendations: []
        };
    }
}
