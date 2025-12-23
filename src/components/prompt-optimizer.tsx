'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Wand2, Check, X, ArrowLeft, Loader2 } from 'lucide-react';
import { refinePrompt, PromptRefineContext } from '@/app/actions';
import { OverridableNode } from '@/types/polaris';

interface PromptOptimizerProps {
    currentPrompt: string;
    type: 'system' | 'human';
    nodeLabel?: string;
    onRefined: (newPrompt: string) => void;
    allNodes?: OverridableNode[];
    stateFields?: Record<string, string>;
}

export function PromptOptimizer({ currentPrompt, type, nodeLabel, onRefined, allNodes, stateFields }: PromptOptimizerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [instructions, setInstructions] = useState('');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [refinedResult, setRefinedResult] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    const handleOptimize = async () => {
        if (!instructions.trim()) return;

        setIsOptimizing(true);
        try {
            // Build agent context if we have nodes and state fields
            const agentContext: PromptRefineContext | undefined = (allNodes && stateFields) ? {
                nodes: allNodes,
                stateFields
            } : undefined;

            const refined = await refinePrompt(currentPrompt, instructions, type, nodeLabel, agentContext);
            setRefinedResult(refined);
            setShowPreview(true);
        } catch (error) {
            console.error("Optimization failed", error);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleApply = () => {
        if (refinedResult) {
            onRefined(refinedResult);
        }
        handleClose();
    };

    const handleClose = () => {
        setIsOpen(false);
        setInstructions('');
        setRefinedResult(null);
        setShowPreview(false);
    };

    const handleBack = () => {
        setShowPreview(false);
        setRefinedResult(null);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) handleClose();
            else setIsOpen(true);
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                    <Sparkles className="mr-2 h-3 w-3" />
                    Refine with AI
                </Button>
            </DialogTrigger>
            <DialogContent className={showPreview ? "sm:max-w-[700px]" : "sm:max-w-[425px]"}>
                {!showPreview ? (
                    // Step 1: Enter instructions
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center">
                                <Wand2 className="mr-2 h-5 w-5 text-indigo-600" />
                                Refine {nodeLabel || 'Prompt'}
                            </DialogTitle>
                            <DialogDescription>
                                Tell the AI how to improve this content (e.g., "Make it more persuasive", "Add sales rules").
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <Textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="E.g. Be more empathetic when the user is angry..."
                                className="min-h-[100px]"
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleOptimize}
                                disabled={isOptimizing || !instructions.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {isOptimizing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Refining...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Refine
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    // Step 2: Preview and confirm
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center">
                                <Check className="mr-2 h-5 w-5 text-green-600" />
                                Review Changes
                            </DialogTitle>
                            <DialogDescription>
                                Review the AI-refined content below. Apply to use these changes or go back to modify your instructions.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Your Instructions:</label>
                                <p className="text-sm text-slate-600 bg-slate-100 p-2 rounded">{instructions}</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Refined Result:</label>
                                <ScrollArea className="h-[300px] border rounded-md">
                                    <div className="p-3 font-mono text-sm whitespace-pre-wrap bg-green-50">
                                        {refinedResult}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                        <DialogFooter className="flex justify-between sm:justify-between">
                            <Button variant="outline" onClick={handleBack}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleClose}>
                                    <X className="mr-2 h-4 w-4" />
                                    Discard
                                </Button>
                                <Button onClick={handleApply} className="bg-green-600 hover:bg-green-700">
                                    <Check className="mr-2 h-4 w-4" />
                                    Apply Changes
                                </Button>
                            </div>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
