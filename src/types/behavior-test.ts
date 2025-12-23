import { Persona } from './simulation';

export interface BehaviorTest {
    id: string;
    name: string;
    problemDescription: string;  // User's description of the behavior issue
    scorerPrompt: string;        // Auto-generated LLM judge prompt
    personaHint: string;         // Hint for generating relevant personas
    simulationCount: number;     // 10, 20, 50
    createdAt: string;
}

export interface BehaviorTestResult {
    id: string;
    personaId: string;
    persona: Persona;
    conversation: ConversationTurn[];
    score: number;              // 0-1
    passed: boolean;            // score >= 0.7
    rationale: string;          // LLM judge's explanation
    scoredAt: string;
}

export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    traceData?: any;
}

export interface BehaviorExperiment {
    id: string;
    testId: string;
    test: BehaviorTest;
    results: BehaviorTestResult[];
    summary: ExperimentSummary;
    braintrustExperimentId?: string;
    braintrustUrl?: string;
    status: 'running' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
}

export interface ExperimentSummary {
    total: number;
    passed: number;
    failed: number;
    passRate: number;           // 0-100
    avgScore: number;           // 0-1
    duration?: number;          // ms
    aiSummary?: string;         // LLM-generated summary of results
    recommendations?: string[]; // LLM-generated recommendations for improvement
}

export interface RunningExperimentState {
    experimentId: string;
    test: BehaviorTest;
    progress: {
        completed: number;
        total: number;
        currentPersona?: string;
    };
    results: BehaviorTestResult[];
}
