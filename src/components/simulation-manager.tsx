'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Play, Plus, UserPlus, MessageSquare, Trash2, History } from 'lucide-react';
import {
    createAndSavePersonas,
    autoGeneratePersonas,
    runSimulationStep,
    sendChat,
    fetchSavedPersonas,
    deletePersona,
    clearPersonas,
    startSimulation,
    completeSimulation,
    fetchAllSimulations,
    clearSimulations
} from '@/app/actions';
import { Persona, SimulationTurn } from '@/types/simulation';
import { TracePanel } from '@/components/trace-panel';
import { OverridableNode } from '@/types/polaris';
import { GlobalOptimizer } from '@/components/global-optimizer';
import { SavedSimulation } from '@/lib/persistence';

interface SimulationManagerProps {
    agentId: string;
    nodes: OverridableNode[];
    personas: Persona[];
    setPersonas: React.Dispatch<React.SetStateAction<Persona[]>>;
    simulationResults: any[];
    setSimulationResults: React.Dispatch<React.SetStateAction<any[]>>;
    onNewSimulation: () => void;
    stateOverrides?: Record<string, string>;
}

export function SimulationManager({
    agentId,
    nodes,
    personas,
    setPersonas,
    simulationResults,
    setSimulationResults,
    onNewSimulation,
    stateOverrides
}: SimulationManagerProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [generationMode, setGenerationMode] = useState<'custom' | 'auto'>('auto');
    const [generationPrompt, setGenerationPrompt] = useState('Customers wanting refunds');
    const [personaCount, setPersonaCount] = useState(3);
    const [activeSimulations, setActiveSimulations] = useState<Record<string, {
        personaId: string;
        turns: SimulationTurn[];
        status: 'running' | 'idle';
        chatId?: string;
        savedId?: string;
    }>>({});
    const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
    const [savedSimulations, setSavedSimulations] = useState<SavedSimulation[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [expandedPersonaId, setExpandedPersonaId] = useState<string | null>(null);

    // Load saved personas and simulations on mount
    useEffect(() => {
        async function loadSavedData() {
            try {
                const [loadedPersonas, loadedSimulations] = await Promise.all([
                    fetchSavedPersonas(agentId),
                    fetchAllSimulations(agentId)
                ]);
                if (loadedPersonas.length > 0) {
                    setPersonas(loadedPersonas);
                }
                setSavedSimulations(loadedSimulations);
            } catch (error) {
                console.error("Failed to load saved data", error);
            } finally {
                setIsLoading(false);
            }
        }
        loadSavedData();
    }, [agentId, setPersonas]);

    const handleGeneratePersonas = async () => {
        setIsGenerating(true);
        try {
            let newPersonas;
            if (generationMode === 'auto') {
                // Auto-generate based on agent prompts
                newPersonas = await autoGeneratePersonas(agentId, personaCount, nodes);
            } else {
                // Custom prompt + agent context
                newPersonas = await createAndSavePersonas(agentId, personaCount, generationPrompt, nodes);
            }
            setPersonas([...personas, ...newPersonas]);
        } catch (error) {
            console.error("Failed to generate personas", error);
            alert("Failed to generate personas. Check API Key.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeletePersona = async (personaId: string) => {
        try {
            const updated = await deletePersona(agentId, personaId);
            setPersonas(updated);
        } catch (error) {
            console.error("Failed to delete persona", error);
        }
    };

    const runSimulation = async (persona: Persona) => {
        // Start and save simulation
        const savedSim = await startSimulation(agentId, persona);

        setActiveSimulations(prev => ({
            ...prev,
            [persona.id]: { personaId: persona.id, turns: [], status: 'running', savedId: savedSim.id }
        }));
        setSelectedSimulationId(persona.id);

        let currentHistory: { role: string, content: string }[] = [];
        let currentChatId: string | undefined = undefined;
        let turns: SimulationTurn[] = [];

        try {
            // Generate first user message
            let currentUserMessage = await runSimulationStep(persona, []);

            for (let i = 0; i < 5; i++) {
                // Add user message to turns
                const userTurn: SimulationTurn = { role: 'user', content: currentUserMessage };
                turns.push(userTurn);
                currentHistory.push({ role: 'user', content: currentUserMessage });

                setActiveSimulations(prev => ({
                    ...prev,
                    [persona.id]: { ...prev[persona.id], turns: [...turns] }
                }));

                // Send to agent API (with chatId for conversation continuity)
                const agentResponse = await sendChat(agentId, currentUserMessage, currentChatId, nodes, stateOverrides);
                currentChatId = agentResponse.chatId; // Save chatId for next call

                const agentTurn: SimulationTurn = {
                    role: 'assistant',
                    content: agentResponse.text,
                    traceData: agentResponse.agentReasoning
                };
                turns.push(agentTurn);
                currentHistory.push({ role: 'assistant', content: agentResponse.text });

                setActiveSimulations(prev => ({
                    ...prev,
                    [persona.id]: { ...prev[persona.id], turns: [...turns], chatId: currentChatId }
                }));

                // Generate next user response based on conversation history
                currentUserMessage = await runSimulationStep(persona, currentHistory);

                await new Promise(r => setTimeout(r, 1000));
            }

            // Save completed simulation
            await completeSimulation(agentId, savedSim.id, turns, currentChatId);

            // Refresh saved simulations list
            const updated = await fetchAllSimulations(agentId);
            setSavedSimulations(updated);

        } catch (error) {
            console.error("Simulation failed", error);
        } finally {
            setActiveSimulations(prev => ({
                ...prev,
                [persona.id]: { ...prev[persona.id], status: 'idle' }
            }));
        }
    };

    const runAllSimulations = () => {
        // Run all simulations in parallel
        personas.forEach(p => {
            if (!activeSimulations[p.id] || activeSimulations[p.id].status === 'idle') {
                runSimulation(p);
            }
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[700px]">
            {/* Sidebar: Personas */}
            <Card className="lg:col-span-1 flex flex-col">
                <CardHeader>
                    <CardTitle>Personas</CardTitle>
                    <CardDescription>Generate or select a persona</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="space-y-3">
                        {/* Mode Toggle */}
                        <div className="flex rounded-lg border p-1 bg-slate-50">
                            <button
                                onClick={() => setGenerationMode('auto')}
                                className={`flex-1 text-xs py-1.5 px-2 rounded transition-colors ${
                                    generationMode === 'auto'
                                        ? 'bg-white shadow text-indigo-600 font-medium'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Auto-Generate
                            </button>
                            <button
                                onClick={() => setGenerationMode('custom')}
                                className={`flex-1 text-xs py-1.5 px-2 rounded transition-colors ${
                                    generationMode === 'custom'
                                        ? 'bg-white shadow text-indigo-600 font-medium'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Custom Prompt
                            </button>
                        </div>

                        {/* Custom prompt input (only shown in custom mode) */}
                        {generationMode === 'custom' && (
                            <Input
                                value={generationPrompt}
                                onChange={(e) => setGenerationPrompt(e.target.value)}
                                placeholder="e.g., Frustrated customers wanting refunds"
                                className="text-sm"
                            />
                        )}

                        {/* Persona count selector */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Personas:</span>
                            <select
                                value={personaCount}
                                onChange={(e) => setPersonaCount(Number(e.target.value))}
                                className="flex-1 text-sm border rounded px-2 py-1.5 bg-white"
                            >
                                <option value={3}>3 personas</option>
                                <option value={5}>5 personas</option>
                                <option value={10}>10 personas</option>
                            </select>
                        </div>

                        {/* Generate button */}
                        <Button onClick={handleGeneratePersonas} disabled={isGenerating} className="w-full">
                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                            {generationMode === 'auto' ? 'Auto-Generate' : 'Generate'} Personas
                        </Button>
                        <Button onClick={runAllSimulations} disabled={personas.length === 0} variant="secondary" className="w-full mt-2">
                            <Play className="mr-2 h-4 w-4" /> Run All Simulations
                        </Button>
                        <Button
                            onClick={() => setShowHistory(!showHistory)}
                            variant="outline"
                            className="w-full mt-2"
                        >
                            <History className="mr-2 h-4 w-4" /> {showHistory ? 'Show Personas' : 'View History'} ({savedSimulations.length})
                        </Button>
                        <Button
                            onClick={async () => {
                                if (window.confirm('Start fresh? This will clear all personas and simulation history.')) {
                                    await Promise.all([clearPersonas(agentId), clearSimulations(agentId)]);
                                    onNewSimulation();
                                    setActiveSimulations({});
                                    setSelectedSimulationId(null);
                                    setSavedSimulations([]);
                                    setShowHistory(false);
                                }
                            }}
                            variant="outline"
                            className="w-full mt-2 text-red-600 hover:text-red-700"
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Clear All
                        </Button>
                    </div>

                    <Separator />

                    <ScrollArea className="flex-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                        ) : showHistory ? (
                            // Show saved simulations history
                            <div className="space-y-3 pr-4">
                                {savedSimulations.map(sim => (
                                    <div
                                        key={sim.id}
                                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedSimulationId === sim.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'}`}
                                        onClick={() => {
                                            // Load this simulation into activeSimulations for viewing
                                            setActiveSimulations(prev => ({
                                                ...prev,
                                                [sim.id]: {
                                                    personaId: sim.personaId,
                                                    turns: sim.turns as SimulationTurn[],
                                                    status: 'idle',
                                                    chatId: sim.chatId,
                                                    savedId: sim.id
                                                }
                                            }));
                                            setSelectedSimulationId(sim.id);
                                        }}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-semibold text-sm">{sim.persona.name}</span>
                                            <Badge variant={sim.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                                                {sim.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-1">{sim.persona.role}</p>
                                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                                            <span>{sim.turns.length} turns</span>
                                            <span>{new Date(sim.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                                {savedSimulations.length === 0 && (
                                    <div className="text-center text-slate-400 text-sm py-8">
                                        No saved simulations yet.
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Show personas
                            <div className="space-y-2 pr-4">
                                {personas.map(p => {
                                    const isExpanded = expandedPersonaId === p.id;
                                    return (
                                        <div
                                            key={p.id}
                                            className={`border rounded-lg transition-colors ${selectedSimulationId === p.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'}`}
                                        >
                                            {/* Header - always visible */}
                                            <div
                                                className="p-3 cursor-pointer"
                                                onClick={() => {
                                                    setExpandedPersonaId(isExpanded ? null : p.id);
                                                    setSelectedSimulationId(p.id); // Also select this simulation to view
                                                }}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm">{p.name}</span>
                                                        {activeSimulations[p.id]?.status === 'running' && (
                                                            <span className="flex h-2 w-2 relative">
                                                                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                            </span>
                                                        )}
                                                        {activeSimulations[p.id]?.turns?.length > 0 && activeSimulations[p.id]?.status !== 'running' && (
                                                            <span className="text-[10px] text-slate-400">({activeSimulations[p.id].turns.length})</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 w-6 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                runSimulation(p);
                                                            }}
                                                            disabled={activeSimulations[p.id]?.status === 'running'}
                                                        >
                                                            {activeSimulations[p.id]?.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Delete "${p.name}"?`)) {
                                                                    handleDeletePersona(p.id);
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-slate-600 font-medium mb-1 leading-snug">{p.role}</p>
                                                {!isExpanded && (
                                                    <p className="text-xs text-slate-500 line-clamp-2">{p.context}</p>
                                                )}
                                            </div>

                                            {/* Expanded details */}
                                            {isExpanded && (
                                                <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2 text-xs">
                                                    <div>
                                                        <span className="font-medium text-slate-600">Goal:</span>
                                                        <p className="text-slate-700 mt-0.5">{p.goal}</p>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-slate-600">Context:</span>
                                                        <p className="text-slate-700 mt-0.5">{p.context}</p>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-slate-600">Tone:</span>
                                                        <p className="text-slate-700 mt-0.5">{p.tone}</p>
                                                    </div>
                                                    {activeSimulations[p.id] && (
                                                        <div className="text-[10px] text-slate-400 pt-1">
                                                            {activeSimulations[p.id].turns.length} turns completed
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {personas.length === 0 && (
                                    <div className="text-center text-slate-400 text-sm py-8">
                                        No personas generated yet.
                                    </div>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Main: Simulation Output */}
            <Card className="lg:col-span-2 flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Simulation Output</span>
                        {selectedSimulationId && activeSimulations[selectedSimulationId]?.status === 'running' && (
                            <Badge variant="default" className="bg-green-500 animate-pulse">Running...</Badge>
                        )}
                        {selectedSimulationId && activeSimulations[selectedSimulationId] && (
                            <GlobalOptimizer
                                chatHistory={activeSimulations[selectedSimulationId].turns.map(t => `${t.role}: ${t.content}`).join('\n')}
                                nodes={nodes}
                            />
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full pr-4">
                        {selectedSimulationId && activeSimulations[selectedSimulationId] ? (
                            <div className="space-y-6">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mb-6">
                                    <h3 className="font-semibold text-sm mb-1">Active Persona</h3>
                                    {(() => {
                                        // Find persona from either personas list or saved simulation
                                        const persona = personas.find(p => p.id === selectedSimulationId) ||
                                            savedSimulations.find(s => s.id === selectedSimulationId)?.persona;
                                        return persona ? (
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                <div><span className="text-slate-500">Name:</span> {persona.name}</div>
                                                <div><span className="text-slate-500">Goal:</span> {persona.goal}</div>
                                            </div>
                                        ) : null;
                                    })()}
                                </div>

                                {activeSimulations[selectedSimulationId].turns.map((turn, i) => (
                                    <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] ${turn.role === 'user' ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-200'} border p-3 rounded-xl`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline" className="h-5 text-[10px]">
                                                    {turn.role === 'user' ? 'Persona' : 'Agent'}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-slate-800 whitespace-pre-wrap">{turn.content}</p>
                                            {turn.traceData && <TracePanel reasoning={turn.traceData} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
                                <p>Select a persona to start a simulation</p>
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
