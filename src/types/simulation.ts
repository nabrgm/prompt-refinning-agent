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

// ============ Enhanced Simulation Types ============

export interface EmotionDimension {
    id: string;
    name: string;           // e.g., "Frustrated", "Curious", "Impatient"
    description: string;    // How this emotion manifests in conversation
}

export interface Intent {
    id: string;
    name: string;           // e.g., "NEW_SALES_LEAD", "EXISTING_CUSTOMER"
    flowType: 'NEW_SALES_LEAD' | 'EXISTING_CUSTOMER' | 'UNDETERMINED';
    description: string;    // Description of the intent
    goal: string;           // What the user wants to achieve
    initialMessage: string; // Starting message for this intent
}

export interface SimulationMetadata {
    name: string;           // Customer name
    persona: Persona;
    intent: Intent;
    emotion: EmotionDimension;
    outcome?: string;       // Result captured from END signal
}

export interface EnhancedSimulation {
    id: string;
    batchId: string;           // Which batch this simulation belongs to
    simulationNumber: number;  // For display: "SIMULATION 1", "SIMULATION 2"
    metadata: SimulationMetadata;
    turns: SimulationTurn[];
    chatId?: string;
    createdAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    reviewed?: boolean;        // Has this simulation been reviewed?
    reviewedAt?: string;       // When it was marked as reviewed
}

export interface SimulationBatch {
    id: string;
    name: string;              // e.g., "Round 1", "Round 2"
    createdAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'partial';  // partial = some failed
    simulationCount: number;   // Total simulations in this batch
    completedCount: number;    // How many have completed
    reviewedCount: number;     // How many have been reviewed
}

export interface SimulationConfig {
    selectedPersonas: Persona[];
    selectedEmotions: EmotionDimension[];
    selectedIntents: Intent[];
    simulationCount: number;
}

export interface GeneratedSimulationOptions {
    personas: Persona[];
    emotions: EmotionDimension[];
    intents: Intent[];
    generatedAt: string;
}

// ============ Feedback/Notes Types ============

export interface SimulationNote {
    id: string;
    simulationId: string;      // Which simulation this note belongs to
    turnIndex: number;         // Which message in the conversation
    turnRole: 'user' | 'assistant';  // Whether it's customer or agent message
    comment: string;           // The feedback comment
    createdAt: string;
    resolved: boolean;         // Has this been addressed?
    resolvedAt?: string;
    resolutionNote?: string;   // Note explaining how it was resolved
}

export interface SimulationNotesData {
    agentId: string;
    notes: SimulationNote[];
    updatedAt: string;
}
