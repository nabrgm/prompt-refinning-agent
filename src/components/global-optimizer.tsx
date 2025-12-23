'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Sparkles, ArrowRight, X } from 'lucide-react';
import { optimizeGlobalPrompts, saveNodeOverride } from '@/app/actions';
import { OverridableNode } from '@/types/polaris';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface GlobalOptimizerProps {
    chatHistory: string;
    nodes: OverridableNode[];
}

interface Suggestion {
    nodeId: string;
    type: 'systemMessagePrompt' | 'humanMessagePrompt';
    reasoning: string;
    newPrompt: string;
}

export function GlobalOptimizer({ chatHistory, nodes }: GlobalOptimizerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());
    const [userRule, setUserRule] = useState('');

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        try {
            const results = await optimizeGlobalPrompts(chatHistory, nodes, userRule);
            setSuggestions(results);
        } catch (error) {
            console.error("Analysis failed", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApply = async (suggestion: Suggestion, index: number) => {
        try {
            await saveNodeOverride(suggestion.nodeId, suggestion.type, suggestion.newPrompt);
            setAppliedSuggestions(prev => new Set(prev).add(index));
        } catch (error) {
            console.error("Failed to apply", error);
        }
    };

    const getNodeLabel = (id: string) => nodes.find(n => n.id === id)?.label || id;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="default" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze & Refine
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-xl">
                        <Sparkles className="mr-2 h-5 w-5 text-indigo-600" />
                        Global Prompt Optimizer
                    </DialogTitle>
                    <DialogDescription>
                        AI analysis of the current conversation to suggest improvements across all agent nodes.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden py-4">
                    {suggestions.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4 p-8">
                            <div className="w-full max-w-md space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rule">Specific Rule (Optional)</Label>
                                    <Textarea
                                        id="rule"
                                        placeholder="e.g. 'When the user mentions pricing, always offer a 10% discount.'"
                                        value={userRule}
                                        onChange={(e) => setUserRule(e.target.value)}
                                        className="bg-white"
                                    />
                                    <p className="text-xs text-slate-500">
                                        Leave empty for general optimization, or describe a specific behavior you want to enforce.
                                    </p>
                                </div>

                                <Button onClick={handleAnalyze} disabled={isAnalyzing} size="lg" className="w-full">
                                    {isAnalyzing ? "Analyzing..." : "Start Analysis"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-6">
                                {suggestions.map((suggestion, index) => (
                                    <div key={index} className="border rounded-xl p-4 bg-slate-50 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                                <Badge variant="outline" className="font-mono">
                                                    {getNodeLabel(suggestion.nodeId)}
                                                </Badge>
                                                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-0">
                                                    {suggestion.type === 'systemMessagePrompt' ? 'System' : 'Human'}
                                                </Badge>
                                            </div>
                                            {appliedSuggestions.has(index) ? (
                                                <Badge className="bg-green-100 text-green-700 border-green-200">
                                                    <Check className="mr-1 h-3 w-3" /> Applied
                                                </Badge>
                                            ) : (
                                                <Button size="sm" onClick={() => handleApply(suggestion, index)}>
                                                    Apply Change
                                                </Button>
                                            )}
                                        </div>

                                        <div className="bg-white p-3 rounded border border-slate-200 text-sm text-slate-600">
                                            <span className="font-semibold text-slate-800 block mb-1">Reasoning:</span>
                                            {suggestion.reasoning}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <span className="text-xs font-medium text-slate-500">Current Prompt</span>
                                                <div className="bg-red-50 border border-red-100 rounded p-2 text-xs font-mono text-slate-600 max-h-[150px] overflow-y-auto opacity-70">
                                                    {nodes.find(n => n.id === suggestion.nodeId)?.[suggestion.type] || "(Empty)"}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-xs font-medium text-slate-500">New Prompt</span>
                                                <div className="bg-green-50 border border-green-100 rounded p-2 text-xs font-mono text-slate-800 max-h-[150px] overflow-y-auto">
                                                    {suggestion.newPrompt}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
