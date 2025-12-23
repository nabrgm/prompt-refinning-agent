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
            <DialogContent className="!max-w-[75vw] !w-[75vw] !max-h-[90vh] !h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Sparkles className="h-6 w-6 text-indigo-500" />
                        Analyze & Refine Prompts
                    </DialogTitle>
                    <DialogDescription>
                        Review your current configuration and describe what you want to change.
                        AI will analyze and suggest specific edits.
                    </DialogDescription>
                </DialogHeader>

                <div className="overflow-y-auto max-h-[calc(95vh-180px)] space-y-4 pr-2">
                    {/* Current Configuration - Collapsed by default */}
                    <Collapsible
                        open={expandedSections.has('config')}
                        onOpenChange={() => toggleSection('config')}
                    >
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 border rounded-lg hover:bg-slate-50">
                            {expandedSections.has('config') ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                            <Settings className="h-4 w-4 text-slate-500" />
                            <span className="font-medium text-sm">Current Configuration</span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                                {REFINABLE_STATE_FIELDS.length} fields, {nodes.length} nodes
                            </Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 p-3 border rounded-lg bg-slate-50 space-y-2">
                            {REFINABLE_STATE_FIELDS.map((field) => (
                                <div key={field.key} className="text-xs">
                                    <span className="font-medium text-slate-600">{field.label}:</span>
                                    <p className="text-slate-500 truncate">
                                        {getFieldPreview(stateOverrides[field.key] || '')}
                                    </p>
                                </div>
                            ))}
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Instruction Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <Edit3 className="h-4 w-4 text-indigo-500" />
                            What do you want to change?
                        </label>
                        <Textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="e.g., Add a rule that says when addressing doctors, always use 'Dr.' before their name..."
                            className="min-h-[100px] resize-y text-sm"
                            disabled={isRefining}
                        />
                        <Button
                            onClick={handleRefine}
                            disabled={isRefining || !instruction.trim()}
                            className="w-full bg-indigo-600 hover:bg-indigo-700"
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
                        <div className="border-2 border-indigo-200 rounded-lg bg-white">
                            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-200 flex items-center justify-between">
                                <span className="font-semibold text-indigo-900">Suggested Changes</span>
                                <Badge className="bg-indigo-600">
                                    {acceptedChanges.size}/{refinementResults.length} accepted
                                </Badge>
                            </div>
                            <div className="p-4 space-y-6">
                                {refinementResults.map((result) => (
                                    <div
                                        key={result.field}
                                        className={`border-2 rounded-lg p-4 ${
                                            acceptedChanges.has(result.field)
                                                ? 'border-emerald-300 bg-emerald-50'
                                                : 'border-slate-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">
                                                    {result.fieldType === 'state' ? 'State Field' : 'Node Prompt'}
                                                </Badge>
                                                <span className="font-semibold">{result.field}</span>
                                            </div>
                                            <Button
                                                variant={acceptedChanges.has(result.field) ? 'default' : 'outline'}
                                                size="sm"
                                                className={
                                                    acceptedChanges.has(result.field)
                                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                                        : ''
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

                                        <p className="text-slate-700 mb-4 text-sm bg-slate-100 p-2 rounded">{result.explanation}</p>

                                        {/* Diff view showing original vs current edit */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-slate-500">Changes Preview</span>
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
                                        <div className="border-t pt-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                                                    <Edit3 className="h-3 w-3" />
                                                    Edit Refined Content
                                                </label>
                                                {editedRefinements[result.field] !== result.refined && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-xs text-slate-500 hover:text-slate-700"
                                                        onClick={() => handleEditRefinement(result.field, result.refined)}
                                                    >
                                                        Reset to AI suggestion
                                                    </Button>
                                                )}
                                            </div>
                                            <Textarea
                                                value={editedRefinements[result.field] ?? result.refined}
                                                onChange={(e) => handleEditRefinement(result.field, e.target.value)}
                                                className="min-h-[150px] font-mono text-xs bg-white border-slate-200 focus:ring-indigo-500"
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
                        <div className="border rounded-lg p-4 bg-indigo-50 space-y-3">
                            <div className="flex items-center gap-2">
                                <Save className="h-4 w-4 text-indigo-600" />
                                <span className="font-medium text-sm">Save as New Version</span>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={versionName}
                                    onChange={(e) => setVersionName(e.target.value)}
                                    placeholder="e.g., v3 - Added Dr. protocol"
                                    disabled={isSaving}
                                />
                                <Button
                                    onClick={handleSaveVersion}
                                    disabled={isSaving || !versionName.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-700"
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
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    {refinementResults.length > 0 && acceptedChanges.size > 0 && !showSaveVersion && (
                        <Button
                            onClick={handleApply}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            Apply {acceptedChanges.size} Change{acceptedChanges.size !== 1 ? 's' : ''}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
