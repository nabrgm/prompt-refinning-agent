'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
    Download,
    MessageSquare,
    User,
    Bot,
    Clock,
    Target,
    Heart,
    CheckCircle,
    CheckCircle2,
    XCircle,
    Loader2,
    Settings,
    Trash2,
    FolderOpen,
    Folder,
    PenLine,
    X,
    ListTodo,
    ListChecks,
    MessageCircle,
    Check,
    Eye,
    ChevronDown,
    ChevronRight,
    Plus
} from 'lucide-react';
import { EnhancedSimulation, SimulationNote, SimulationBatch } from '@/types/simulation';
import { TracePanel } from '@/components/trace-panel';
import {
    fetchSimulationNotes,
    addSimulationNote,
    toggleNoteResolved,
    removeSimulationNote,
    toggleSimulationReviewed
} from '@/app/actions';

interface SimulationResultsViewProps {
    agentId: string;
    batches: SimulationBatch[];
    batchSimulations: Record<string, EnhancedSimulation[]>;
    selectedBatchId: string | null;
    onSelectBatch: (batchId: string) => void;
    onDeleteBatch: (batchId: string) => void;
    onBackToConfig: () => void;
    onDownload: (batchId: string) => void;
    onSimulationsUpdate?: (batchId: string, simulations: EnhancedSimulation[]) => void;
}

export function SimulationResultsView({
    agentId,
    batches,
    batchSimulations,
    selectedBatchId,
    onSelectBatch,
    onDeleteBatch,
    onBackToConfig,
    onDownload,
    onSimulationsUpdate,
}: SimulationResultsViewProps) {
    const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set(selectedBatchId ? [selectedBatchId] : []));
    const [notes, setNotes] = useState<SimulationNote[]>([]);
    const [showTasksPanel, setShowTasksPanel] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState<{ simId: string; turnIndex: number; turnRole: 'user' | 'assistant' } | null>(null);
    const [feedbackComment, setFeedbackComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resolvingNoteId, setResolvingNoteId] = useState<string | null>(null);
    const [resolutionComment, setResolutionComment] = useState('');

    // Get simulations for selected batch
    const currentBatchSimulations = selectedBatchId ? batchSimulations[selectedBatchId] || [] : [];
    const selectedSimulation = currentBatchSimulations.find(s => s.id === selectedSimulationId);
    const selectedBatch = batches.find(b => b.id === selectedBatchId);

    // Auto-select first simulation when batch changes
    useEffect(() => {
        if (selectedBatchId && currentBatchSimulations.length > 0 && !selectedSimulationId) {
            setSelectedSimulationId(currentBatchSimulations[0].id);
        }
    }, [selectedBatchId, currentBatchSimulations]);

    // Expand selected batch
    useEffect(() => {
        if (selectedBatchId) {
            setExpandedBatches(prev => new Set([...prev, selectedBatchId]));
        }
    }, [selectedBatchId]);

    // Load notes on mount
    useEffect(() => {
        loadNotes();
    }, [agentId]);

    const loadNotes = async () => {
        const loadedNotes = await fetchSimulationNotes(agentId);
        setNotes(loadedNotes);
    };

    const toggleBatchExpanded = (batchId: string) => {
        setExpandedBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchId)) {
                next.delete(batchId);
            } else {
                next.add(batchId);
            }
            return next;
        });
    };

    const handleSelectSimulation = (batchId: string, simId: string) => {
        onSelectBatch(batchId);
        setSelectedSimulationId(simId);
    };

    const handleThumbsDown = (simId: string, turnIndex: number, turnRole: 'user' | 'assistant') => {
        setFeedbackOpen({ simId, turnIndex, turnRole });
        setFeedbackComment('');
    };

    const handleSubmitFeedback = async () => {
        if (!feedbackOpen || !feedbackComment.trim()) return;

        setIsSubmitting(true);
        try {
            const updatedNotes = await addSimulationNote(
                agentId,
                feedbackOpen.simId,
                feedbackOpen.turnIndex,
                feedbackOpen.turnRole,
                feedbackComment.trim()
            );
            setNotes(updatedNotes);
            setFeedbackOpen(null);
            setFeedbackComment('');
        } catch (error) {
            console.error('Failed to add note:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStartResolve = (noteId: string) => {
        setResolvingNoteId(noteId);
        setResolutionComment('');
    };

    const handleSubmitResolution = async () => {
        if (!resolvingNoteId || !resolutionComment.trim()) return;

        setIsSubmitting(true);
        try {
            const updatedNotes = await toggleNoteResolved(agentId, resolvingNoteId, true, resolutionComment.trim());
            setNotes(updatedNotes);
            setResolvingNoteId(null);
            setResolutionComment('');
        } catch (error) {
            console.error('Failed to resolve note:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnresolve = async (noteId: string) => {
        const updatedNotes = await toggleNoteResolved(agentId, noteId, false);
        setNotes(updatedNotes);
    };

    const handleDeleteNote = async (noteId: string) => {
        const updatedNotes = await removeSimulationNote(agentId, noteId);
        setNotes(updatedNotes);
    };

    const handleToggleReviewed = async (simulationId: string, reviewed: boolean) => {
        if (!selectedBatchId) return;

        // Optimistic update
        const updatedSimulations = currentBatchSimulations.map(s =>
            s.id === simulationId
                ? { ...s, reviewed, reviewedAt: reviewed ? new Date().toISOString() : undefined }
                : s
        );
        onSimulationsUpdate?.(selectedBatchId, updatedSimulations);

        // Persist to server
        await toggleSimulationReviewed(agentId, simulationId, reviewed);
    };

    // Get notes for current simulation
    const currentSimNotes = selectedSimulation
        ? notes.filter(n => n.simulationId === selectedSimulation.id)
        : [];

    // Get note for a specific turn
    const getNoteForTurn = (turnIndex: number) => {
        return currentSimNotes.find(n => n.turnIndex === turnIndex);
    };

    // Count unresolved notes
    const unresolvedCount = notes.filter(n => !n.resolved).length;

    const getStatusIcon = (status: EnhancedSimulation['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
            case 'failed':
                return <XCircle className="h-3.5 w-3.5 text-destructive" />;
            case 'running':
                return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
        }
    };

    const getBatchStatusIcon = (status: SimulationBatch['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
            case 'partial':
                return <XCircle className="h-3.5 w-3.5 text-amber-500" />;
            case 'running':
                return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
        }
    };

    const getFlowTypeBadge = (flowType: string) => {
        switch (flowType) {
            case 'NEW_SALES_LEAD':
                return (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                        New Lead
                    </Badge>
                );
            case 'EXISTING_CUSTOMER':
                return (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                        Existing
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10px]">
                        Undetermined
                    </Badge>
                );
        }
    };

    return (
        <div className="flex gap-4 h-full min-h-0">
            {/* Left Sidebar - Batches and Simulations */}
            <div className="w-72 flex-shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
                <div className="p-3 border-b border-border">
                    <Button
                        variant="outline"
                        className="w-full border-border text-foreground hover:bg-muted hover:text-foreground"
                        onClick={onBackToConfig}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Simulation Round
                    </Button>
                </div>
                <div className="p-3 border-b border-border flex gap-1 bg-muted/30">
                    <button
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                            !showTasksPanel
                                ? 'bg-card text-foreground shadow-sm border border-border'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setShowTasksPanel(false)}
                    >
                        {!showTasksPanel ? (
                            <FolderOpen className="h-3.5 w-3.5" />
                        ) : (
                            <Folder className="h-3.5 w-3.5" />
                        )}
                        Rounds
                    </button>
                    <button
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                            showTasksPanel
                                ? 'bg-card text-foreground shadow-sm border border-border'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setShowTasksPanel(true)}
                    >
                        {showTasksPanel ? (
                            <ListChecks className="h-3.5 w-3.5" />
                        ) : (
                            <ListTodo className="h-3.5 w-3.5" />
                        )}
                        Tasks
                        {unresolvedCount > 0 && (
                            <span className="ml-1 min-w-[18px] h-[18px] flex items-center justify-center text-[11px] font-medium bg-amber-500 text-white rounded-full">
                                {unresolvedCount}
                            </span>
                        )}
                    </button>
                </div>

                {showTasksPanel ? (
                    /* Tasks Panel */
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="p-3 border-b border-border bg-muted/30">
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-xs text-foreground">All Feedback Notes</span>
                                <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                                    {notes.length}
                                </Badge>
                            </div>
                        </div>
                        {notes.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                <p className="text-xs">No feedback notes yet</p>
                                <p className="text-[10px] mt-1">Click the pen icon on a message to add one</p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-2">
                                {notes.map((note) => (
                                    <div
                                        key={note.id}
                                        className={`p-2.5 rounded-lg border text-xs transition-colors ${
                                            note.resolved
                                                ? 'bg-primary/5 border-primary/20'
                                                : 'bg-card border-amber-500/30'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                                        note.resolved
                                                            ? 'bg-primary border-primary text-primary-foreground'
                                                            : 'border-border hover:border-primary'
                                                    }`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (note.resolved) {
                                                            handleUnresolve(note.id);
                                                        } else {
                                                            handleStartResolve(note.id);
                                                        }
                                                    }}
                                                >
                                                    {note.resolved && <Check className="h-3 w-3" />}
                                                </button>
                                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
                                                    note.turnRole === 'user'
                                                        ? 'bg-primary/10 text-primary border-primary/20'
                                                        : 'bg-muted text-muted-foreground border-border'
                                                }`}>
                                                    {note.turnRole === 'user' ? 'Customer' : 'Agent'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                                                    onClick={() => {
                                                        // Find which batch this simulation belongs to
                                                        for (const [batchId, sims] of Object.entries(batchSimulations)) {
                                                            if (sims.some(s => s.id === note.simulationId)) {
                                                                handleSelectSimulation(batchId, note.simulationId);
                                                                setShowTasksPanel(false);
                                                                break;
                                                            }
                                                        }
                                                    }}
                                                    title="Go to conversation"
                                                >
                                                    <MessageSquare className="h-3 w-3" />
                                                </button>
                                                <button
                                                    className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                                                    onClick={() => handleDeleteNote(note.id)}
                                                    title="Delete note"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className={`text-foreground mb-1.5 ${note.resolved ? 'line-through opacity-60' : ''}`}>
                                            {note.comment}
                                        </p>

                                        {/* Resolution note display */}
                                        {note.resolved && note.resolutionNote && (
                                            <div className="mt-2 p-2 bg-primary/10 rounded border border-primary/20">
                                                <p className="text-[10px] text-primary font-medium mb-0.5">Resolution:</p>
                                                <p className="text-foreground">{note.resolutionNote}</p>
                                            </div>
                                        )}

                                        {/* Resolution input */}
                                        {resolvingNoteId === note.id && (
                                            <div className="mt-2 p-2 bg-muted/50 rounded border border-border">
                                                <Textarea
                                                    value={resolutionComment}
                                                    onChange={(e) => setResolutionComment(e.target.value)}
                                                    placeholder="How was this resolved?"
                                                    className="min-h-[50px] text-xs bg-card border-border resize-none mb-2"
                                                    autoFocus
                                                />
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-xs px-2"
                                                        onClick={() => setResolvingNoteId(null)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="h-6 text-xs px-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                                        onClick={handleSubmitResolution}
                                                        disabled={isSubmitting || !resolutionComment.trim()}
                                                    >
                                                        {isSubmitting ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            'Resolve'
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="text-[10px] text-muted-foreground mt-2">
                                            <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Batches List */
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {batches.map((batch) => {
                            const sims = batchSimulations[batch.id] || [];
                            const isExpanded = expandedBatches.has(batch.id);
                            const reviewedCount = sims.filter(s => s.reviewed).length;

                            return (
                                <div key={batch.id} className="border-b border-border last:border-b-0">
                                    {/* Batch Header */}
                                    <div
                                        className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                                            selectedBatchId === batch.id ? 'bg-primary/5' : ''
                                        }`}
                                        onClick={() => {
                                            toggleBatchExpanded(batch.id);
                                            onSelectBatch(batch.id);
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                )}
                                                {isExpanded ? (
                                                    <FolderOpen className="h-4 w-4 text-primary" />
                                                ) : (
                                                    <Folder className="h-4 w-4 text-primary" />
                                                )}
                                                <span className="font-medium text-xs text-foreground">{batch.name}</span>
                                                <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                                                    {sims.length}
                                                </Badge>
                                                {getBatchStatusIcon(batch.status)}
                                            </div>
                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                                    onClick={() => onDownload(batch.id)}
                                                    title="Export batch"
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                                    onClick={() => onDeleteBatch(batch.id)}
                                                    title="Delete batch"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 ml-6 text-[10px] text-muted-foreground">
                                            <span className={reviewedCount === sims.length && sims.length > 0 ? 'text-primary' : ''}>
                                                {reviewedCount}/{sims.length} reviewed
                                            </span>
                                            <span>•</span>
                                            <span>{new Date(batch.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    {/* Simulations List */}
                                    {isExpanded && (
                                        <div className="px-2 pb-2 space-y-1">
                                            {sims.map((sim) => {
                                                const simNoteCount = notes.filter(n => n.simulationId === sim.id && !n.resolved).length;
                                                return (
                                                    <div
                                                        key={sim.id}
                                                        className={`p-2 rounded-md cursor-pointer transition-colors ml-4 ${
                                                            selectedSimulationId === sim.id
                                                                ? 'bg-primary/10 border border-primary/20'
                                                                : 'hover:bg-muted/50 border border-transparent'
                                                        }`}
                                                        onClick={() => handleSelectSimulation(batch.id, sim.id)}
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2">
                                                                {sim.reviewed ? (
                                                                    <CheckCircle2 className="h-3 w-3 text-primary" />
                                                                ) : (
                                                                    <MessageSquare className="h-3 w-3 text-muted-foreground" />
                                                                )}
                                                                <span className={`text-xs font-medium truncate max-w-[100px] ${sim.reviewed ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                                    {sim.metadata.name}
                                                                </span>
                                                                {simNoteCount > 0 && (
                                                                    <Badge className="h-4 px-1 text-[9px] bg-amber-500 text-white">
                                                                        {simNoteCount}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {getStatusIcon(sim.status)}
                                                        </div>
                                                        <div className="flex items-center justify-between ml-5">
                                                            {getFlowTypeBadge(sim.metadata.intent.flowType)}
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {sim.turns.length} turns
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Right Panel - Conversation View */}
            <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden min-w-0">
                {selectedSimulation ? (
                    <>
                        <div className="p-4 border-b border-border shrink-0">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-lg font-serif text-foreground flex items-center gap-2">
                                        {selectedSimulation.metadata.name}
                                        {getStatusIcon(selectedSimulation.status)}
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {selectedBatch?.name} • Conversation #{selectedSimulation.simulationNumber}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedSimulation.metadata.outcome && (
                                        <Badge
                                            variant={selectedSimulation.status === 'completed' ? 'default' : 'destructive'}
                                            className="whitespace-normal text-left bg-primary text-primary-foreground"
                                        >
                                            {selectedSimulation.metadata.outcome}
                                        </Badge>
                                    )}
                                    <button
                                        onClick={() => handleToggleReviewed(selectedSimulation.id, !selectedSimulation.reviewed)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                            selectedSimulation.reviewed
                                                ? 'bg-primary/10 text-primary border border-primary/20'
                                                : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border'
                                        }`}
                                    >
                                        {selectedSimulation.reviewed ? (
                                            <>
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Reviewed
                                            </>
                                        ) : (
                                            <>
                                                <Eye className="h-3.5 w-3.5" />
                                                Mark Reviewed
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 p-3 bg-muted/30 border border-border rounded-lg text-xs">
                                <div className="flex items-start gap-2 min-w-0">
                                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-muted-foreground">Persona</p>
                                        <p className="font-medium text-foreground break-words">{selectedSimulation.metadata.persona.role}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2 min-w-0">
                                    <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-muted-foreground">Intent</p>
                                        <p className="font-medium text-foreground break-words">{selectedSimulation.metadata.intent.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2 min-w-0">
                                    <Heart className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-muted-foreground">Emotion</p>
                                        <p className="font-medium text-foreground break-words">{selectedSimulation.metadata.emotion.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2 min-w-0">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-muted-foreground">Turns</p>
                                        <p className="font-medium text-foreground">{selectedSimulation.turns.length}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                            {selectedSimulation.turns.map((turn, index) => {
                                const turnNote = getNoteForTurn(index);
                                const isFeedbackOpenForThis = feedbackOpen?.simId === selectedSimulation.id && feedbackOpen?.turnIndex === index;

                                return (
                                    <div
                                        key={index}
                                        className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className="group relative max-w-[85%]">
                                            <div
                                                className={`rounded-xl p-3 ${
                                                    turn.role === 'user'
                                                        ? 'bg-primary/10 border border-primary/20'
                                                        : 'bg-card border border-border'
                                                } ${turnNote ? 'ring-2 ring-amber-500/50' : ''}`}
                                            >
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        {turn.role === 'user' ? (
                                                            <Badge variant="outline" className="h-5 text-[10px] bg-primary/10 text-primary border-primary/20">
                                                                <User className="h-3 w-3 mr-1" />
                                                                Customer
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="h-5 text-[10px] bg-muted text-muted-foreground border-border">
                                                                <Bot className="h-3 w-3 mr-1" />
                                                                Agent
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {/* Feedback buttons */}
                                                    <div className={`flex items-center gap-1 transition-opacity ${turnNote ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        {turnNote ? (
                                                            <Badge className="h-5 text-[10px] bg-amber-500 text-white border-0">
                                                                <MessageCircle className="h-3 w-3 mr-1" />
                                                                Note
                                                            </Badge>
                                                        ) : (
                                                            <button
                                                                className="p-1 rounded hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500 transition-colors"
                                                                title="Add note"
                                                                onClick={() => handleThumbsDown(selectedSimulation.id, index, turn.role)}
                                                            >
                                                                <PenLine className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-foreground whitespace-pre-wrap">
                                                    {turn.content}
                                                </p>
                                                {turn.traceData && (
                                                    <div className="mt-2">
                                                        <TracePanel reasoning={turn.traceData} />
                                                    </div>
                                                )}

                                                {/* Show existing note */}
                                                {turnNote && (
                                                    <div className={`mt-3 p-2.5 rounded-lg border ${
                                                        turnNote.resolved
                                                            ? 'bg-primary/5 border-primary/20'
                                                            : 'bg-amber-500/10 border-amber-500/20'
                                                    }`}>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <p className={`text-xs ${turnNote.resolved ? 'text-muted-foreground line-through' : 'text-amber-700'}`}>
                                                                {turnNote.comment}
                                                            </p>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                                                        turnNote.resolved
                                                                            ? 'bg-primary border-primary text-primary-foreground'
                                                                            : 'border-amber-500/50 hover:border-primary'
                                                                    }`}
                                                                    onClick={() => {
                                                                        if (turnNote.resolved) {
                                                                            handleUnresolve(turnNote.id);
                                                                        } else {
                                                                            handleStartResolve(turnNote.id);
                                                                        }
                                                                    }}
                                                                    title={turnNote.resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                                                                >
                                                                    {turnNote.resolved && <Check className="h-3 w-3" />}
                                                                </button>
                                                                <button
                                                                    className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                                                    onClick={() => handleDeleteNote(turnNote.id)}
                                                                    title="Delete note"
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Resolution note display */}
                                                        {turnNote.resolved && turnNote.resolutionNote && (
                                                            <div className="mt-2 p-2 bg-primary/10 rounded">
                                                                <p className="text-[10px] text-primary font-medium mb-0.5">Resolution:</p>
                                                                <p className="text-xs text-foreground">{turnNote.resolutionNote}</p>
                                                            </div>
                                                        )}

                                                        {/* Resolution input */}
                                                        {resolvingNoteId === turnNote.id && (
                                                            <div className="mt-2 p-2 bg-muted/50 rounded border border-border">
                                                                <Textarea
                                                                    value={resolutionComment}
                                                                    onChange={(e) => setResolutionComment(e.target.value)}
                                                                    placeholder="How was this resolved?"
                                                                    className="min-h-[50px] text-xs bg-card border-border resize-none mb-2"
                                                                    autoFocus
                                                                />
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 text-xs px-2"
                                                                        onClick={() => setResolvingNoteId(null)}
                                                                    >
                                                                        Cancel
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        className="h-6 text-xs px-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                                                        onClick={handleSubmitResolution}
                                                                        disabled={isSubmitting || !resolutionComment.trim()}
                                                                    >
                                                                        {isSubmitting ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            'Resolve'
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Feedback input */}
                                                {isFeedbackOpenForThis && (
                                                    <div className="mt-3 p-3 bg-muted/50 border border-border rounded-lg">
                                                        <Textarea
                                                            value={feedbackComment}
                                                            onChange={(e) => setFeedbackComment(e.target.value)}
                                                            placeholder="What's the issue with this message?"
                                                            className="min-h-[60px] text-xs bg-card border-border resize-none"
                                                            autoFocus
                                                        />
                                                        <div className="flex items-center justify-end gap-2 mt-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 text-xs"
                                                                onClick={() => setFeedbackOpen(null)}
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                                                                onClick={handleSubmitFeedback}
                                                                disabled={isSubmitting || !feedbackComment.trim()}
                                                            >
                                                                {isSubmitting ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    'Add Note'
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {selectedSimulation.status === 'running' && (
                                <div className="flex justify-center py-4">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="text-sm">Simulation in progress...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>Select a conversation to view</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
