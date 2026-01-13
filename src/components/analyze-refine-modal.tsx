'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Loader2,
    Sparkles,
    ChevronDown,
    ChevronRight,
    Check,
    X,
    Save,
    FileText,
    Settings,
    Edit3,
} from 'lucide-react';
import { OverridableNode, StateMemory, PromptSetVersion } from '@/types/polaris';
import { refinePromptWithAI, createPromptVersion } from '@/app/actions';
import { UnifiedDiff } from '@/components/unified-diff';

interface AnalyzeRefineModalProps {
    agentId: string;
    isOpen: boolean;
    onClose: () => void;
    nodes: OverridableNode[];
    stateOverrides: Record<string, string>;
    stateMemory: StateMemory | null;
    onApply: (nodes: OverridableNode[], stateOverrides: Record<string, string>) => void;
}

interface RefinementResult {
    field: string;
    fieldType: 'state' | 'node';
    nodeId?: string;
    original: string;
    refined: string;
    explanation: string;
}

// Fields that can be refined
const REFINABLE_STATE_FIELDS = [
    { key: 'brand_system_base', label: 'General Rules (brand_system_base)' },
    { key: 'additional_general_rules', label: 'Additional General Rules' },
    { key: 'additional_prospects_rules', label: 'Additional Prospects Rules' },
    { key: 'additional_customers_rules', label: 'Additional Customers Rules' },
];

export function AnalyzeRefineModal({
    agentId,
    isOpen,
    onClose,
    nodes,
    stateOverrides,
    stateMemory,
    onApply,
}: AnalyzeRefineModalProps) {
    const [instruction, setInstruction] = useState('');
    const [isRefining, setIsRefining] = useState(false);
    const [refinementResults, setRefinementResults] = useState<RefinementResult[]>([]);
    const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['state', 'nodes']));

    // Selected field/node to edit
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

    // Save version state
    const [showSaveVersion, setShowSaveVersion] = useState(false);
    const [versionName, setVersionName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Editable refinements - track user edits to AI suggestions
    const [editedRefinements, setEditedRefinements] = useState<Record<string, string>>({});

    // Build list of all editable targets (state fields + nodes)
    const editableTargets = [
        ...REFINABLE_STATE_FIELDS.map(f => ({
            id: f.key,
            label: f.label,
            type: 'state' as const,
            preview: stateOverrides[f.key] || '',
        })),
        ...nodes.map(n => ({
            id: n.id,
            label: n.label,
            type: 'node' as const,
            preview: n.systemMessagePrompt || '',
        })),
    ];

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    };

    const toggleChange = (field: string) => {
        setAcceptedChanges(prev => {
            const next = new Set(prev);
            if (next.has(field)) {
                next.delete(field);
            } else {
                next.add(field);
            }
            return next;
        });
    };

    const handleRefine = async () => {
        if (!instruction.trim()) return;

        setIsRefining(true);
        setRefinementResults([]);
        setAcceptedChanges(new Set());
        setEditedRefinements({});

        try {
            // Call the AI to analyze and suggest refinements
            const result = await refinePromptWithAI(
                instruction,
                nodes,
                stateOverrides
            );

            if (result.refinements && result.refinements.length > 0) {
                setRefinementResults(result.refinements);
                // Auto-accept all changes by default
                setAcceptedChanges(new Set(result.refinements.map(r => r.field)));
                // Initialize editable refinements with AI suggestions
                const initialEdits: Record<string, string> = {};
                result.refinements.forEach(r => {
                    initialEdits[r.field] = r.refined;
                });
                setEditedRefinements(initialEdits);
            }
        } catch (error) {
            console.error('Failed to refine prompts:', error);
            alert('Failed to analyze and refine prompts. Check console for details.');
        } finally {
            setIsRefining(false);
        }
    };

    // Handle editing a refinement
    const handleEditRefinement = (field: string, value: string) => {
        setEditedRefinements(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleApply = () => {
        // Build updated nodes and state based on accepted changes
        // Uses editedRefinements (user-modified) instead of original AI suggestions
        const updatedNodes = [...nodes];
        const updatedState = { ...stateOverrides };

        for (const result of refinementResults) {
            if (!acceptedChanges.has(result.field)) continue;

            // Use edited version if available, otherwise fall back to AI suggestion
            const finalValue = editedRefinements[result.field] ?? result.refined;

            if (result.fieldType === 'state') {
                updatedState[result.field] = finalValue;
            } else if (result.fieldType === 'node' && result.nodeId) {
                const nodeIndex = updatedNodes.findIndex(n => n.id === result.nodeId);
                if (nodeIndex >= 0) {
                    updatedNodes[nodeIndex] = {
                        ...updatedNodes[nodeIndex],
                        systemMessagePrompt: finalValue,
                    };
                }
            }
        }

        onApply(updatedNodes, updatedState);
        setShowSaveVersion(true);
    };

    const handleSaveVersion = async () => {
        if (!versionName.trim()) return;

        setIsSaving(true);
        try {
            // Build the final state with applied changes
            // Uses editedRefinements (user-modified) instead of original AI suggestions
            const updatedNodes = [...nodes];
            const updatedState = { ...stateOverrides };

            for (const result of refinementResults) {
                if (!acceptedChanges.has(result.field)) continue;

                // Use edited version if available, otherwise fall back to AI suggestion
                const finalValue = editedRefinements[result.field] ?? result.refined;

                if (result.fieldType === 'state') {
                    updatedState[result.field] = finalValue;
                } else if (result.fieldType === 'node' && result.nodeId) {
                    const nodeIndex = updatedNodes.findIndex(n => n.id === result.nodeId);
                    if (nodeIndex >= 0) {
                        updatedNodes[nodeIndex] = {
                            ...updatedNodes[nodeIndex],
                            systemMessagePrompt: finalValue,
                        };
                    }
                }
            }

            await createPromptVersion(
                agentId,
                versionName,
                updatedNodes,
                updatedState,
                `Refined: ${instruction.substring(0, 100)}...`
            );

            setVersionName('');
            setShowSaveVersion(false);
            handleClose();
        } catch (error) {
            console.error('Failed to save version:', error);
            alert('Failed to save version. Check console for details.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        setInstruction('');
        setRefinementResults([]);
        setAcceptedChanges(new Set());
        setEditedRefinements({});
        setShowSaveVersion(false);
        setVersionName('');
        onClose();
    };

    const getFieldPreview = (value: string, maxLength: number = 100) => {
        if (!value) return '(empty)';
        if (value.length <= maxLength) return value;
        return value.substring(0, maxLength) + '...';
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="!max-w-[75vw] !w-[75vw] !max-h-[90vh] !h-[90vh] bg-card border-border flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-xl text-foreground font-serif">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Analyze & Refine Prompts
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Review your current configuration and describe what you want to change.
                        AI will analyze and suggest specific edits.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                    {/* Current Configuration - Collapsed by default */}
                    <Collapsible
                        open={expandedSections.has('config')}
                        onOpenChange={() => toggleSection('config')}
                    >
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                            {expandedSections.has('config') ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm text-foreground">Current Configuration</span>
                            <Badge variant="secondary" className="ml-2 text-xs bg-muted text-muted-foreground">
                                {REFINABLE_STATE_FIELDS.length} fields, {nodes.length} nodes
                            </Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 p-3 border border-border rounded-lg bg-muted/20 space-y-2">
                            {REFINABLE_STATE_FIELDS.map((field) => (
                                <div key={field.key} className="text-xs">
                                    <span className="font-medium text-muted-foreground">{field.label}:</span>
                                    <p className="text-foreground/70 truncate">
                                        {getFieldPreview(stateOverrides[field.key] || '')}
                                    </p>
                                </div>
                            ))}
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Instruction Input */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2 text-foreground">
                            <Edit3 className="h-4 w-4 text-primary" />
                            What do you want to change?
                        </label>
                        <Textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="e.g., Add a rule that says when addressing doctors, always use 'Dr.' before their name..."
                            className="min-h-[100px] resize-y text-sm bg-muted/30 border-border text-foreground placeholder:text-muted-foreground focus:ring-primary/20"
                            disabled={isRefining}
                        />
                        <Button
                            onClick={handleRefine}
                            disabled={isRefining || !instruction.trim()}
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {isRefining ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Analyze & Suggest Changes
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Refinement Results */}
                    {refinementResults.length > 0 && (
                        <div className="border border-primary/30 rounded-lg bg-card overflow-hidden">
                            <div className="bg-primary/10 px-4 py-3 border-b border-primary/20 flex items-center justify-between">
                                <span className="font-semibold text-foreground">Suggested Changes</span>
                                <Badge className="bg-primary text-primary-foreground">
                                    {acceptedChanges.size}/{refinementResults.length} accepted
                                </Badge>
                            </div>
                            <div className="p-4 space-y-4">
                                {refinementResults.map((result) => (
                                    <div
                                        key={result.field}
                                        className={`border rounded-lg p-4 transition-colors ${
                                            acceptedChanges.has(result.field)
                                                ? 'border-primary/30 bg-primary/5'
                                                : 'border-border bg-card'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                                                    {result.fieldType === 'state' ? 'State Field' : 'Node Prompt'}
                                                </Badge>
                                                <span className="font-medium text-foreground">{result.field}</span>
                                            </div>
                                            <Button
                                                variant={acceptedChanges.has(result.field) ? 'default' : 'outline'}
                                                size="sm"
                                                className={
                                                    acceptedChanges.has(result.field)
                                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                                        : 'border-border text-muted-foreground hover:text-foreground'
                                                }
                                                onClick={() => toggleChange(result.field)}
                                            >
                                                {acceptedChanges.has(result.field) ? (
                                                    <>
                                                        <Check className="h-4 w-4 mr-1" />
                                                        Accepted
                                                    </>
                                                ) : (
                                                    <>
                                                        <X className="h-4 w-4 mr-1" />
                                                        Rejected
                                                    </>
                                                )}
                                            </Button>
                                        </div>

                                        <p className="text-muted-foreground mb-4 text-sm bg-muted/30 p-3 rounded-lg border border-border">{result.explanation}</p>

                                        {/* Diff view showing original vs current edit */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-muted-foreground">Changes Preview</span>
                                                {editedRefinements[result.field] !== result.refined && (
                                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                                        Modified
                                                    </Badge>
                                                )}
                                            </div>
                                            <UnifiedDiff
                                                original={result.original || ''}
                                                modified={editedRefinements[result.field] ?? result.refined}
                                            />
                                        </div>

                                        {/* Editable textarea for the refined content */}
                                        <div className="border-t border-border pt-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                                    <Edit3 className="h-3 w-3" />
                                                    Edit Refined Content
                                                </label>
                                                {editedRefinements[result.field] !== result.refined && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-xs text-muted-foreground hover:text-foreground"
                                                        onClick={() => handleEditRefinement(result.field, result.refined)}
                                                    >
                                                        Reset to AI suggestion
                                                    </Button>
                                                )}
                                            </div>
                                            <Textarea
                                                value={editedRefinements[result.field] ?? result.refined}
                                                onChange={(e) => handleEditRefinement(result.field, e.target.value)}
                                                className="min-h-[150px] font-mono text-xs bg-muted/20 border-border text-foreground focus:ring-primary/20"
                                                placeholder="Edit the refined content..."
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Save Version Section */}
                    {showSaveVersion && (
                        <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <Save className="h-4 w-4 text-primary" />
                                <span className="font-medium text-sm text-foreground">Save as New Version</span>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={versionName}
                                    onChange={(e) => setVersionName(e.target.value)}
                                    placeholder="e.g., v3 - Added Dr. protocol"
                                    disabled={isSaving}
                                    className="bg-card border-border text-foreground"
                                />
                                <Button
                                    onClick={handleSaveVersion}
                                    disabled={isSaving || !versionName.trim()}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        'Save'
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t border-border shrink-0">
                    <Button variant="outline" onClick={handleClose} className="border-border text-muted-foreground hover:text-foreground">
                        Cancel
                    </Button>
                    {refinementResults.length > 0 && acceptedChanges.size > 0 && !showSaveVersion && (
                        <Button
                            onClick={handleApply}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            Apply {acceptedChanges.size} Change{acceptedChanges.size !== 1 ? 's' : ''}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
