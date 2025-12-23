export interface Persona {
    id: string;
    name: string;
    role: string; // e.g., "Angry Customer", "Curious Lead"
    goal: string; // e.g., "Get a refund", "Book an appointment"
    context: string; // Background info
    tone: string; // e.g., "Aggressive", "Polite"
}

export interface SimulationTurn {
    role: 'user' | 'assistant';
    content: string;
    traceData?: any;
}

export interface SimulationResult {
    id: string;
    personaId: string;
    timestamp: number;
    turns: SimulationTurn[];
    status: 'completed' | 'failed';
}
