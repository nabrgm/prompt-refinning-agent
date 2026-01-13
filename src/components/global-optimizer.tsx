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
    agentId: string;
    chatHistory: string;
    nodes: OverridableNode[];
}

interface Suggestion {
    nodeId: string;
    type: 'systemMessagePrompt' | 'humanMessagePrompt';
    reasoning: string;
    newPrompt: string;
}

export function GlobalOptimizer({ agentId, chatHistory, nodes }: GlobalOptimizerProps) {
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
            await saveNodeOverride(agentId, suggestion.nodeId, suggestion.type, suggestion.newPrompt);
            setAppliedSuggestions(prev => new Set(prev).add(index));
        } catch (error) {
            console.error("Failed to apply", error);
        }
    };

    const getNodeLabel = (id: string) => nodes.find(n => n.id === id)?.label || id;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze & Refine
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-xl text-foreground">
                        <Sparkles className="mr-2 h-5 w-5 text-primary" />
                        Global Prompt Optimizer
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        AI analysis of the current conversation to suggest improvements across all agent nodes.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden py-4">
                    {suggestions.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4 p-8">
                            <div className="w-full max-w-md space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rule" className="text-foreground">Specific Rule (Optional)</Label>
                                    <Textarea
                                        id="rule"
                                        placeholder="e.g. 'When the user mentions pricing, always offer a 10% discount.'"
                                        value={userRule}
                                        onChange={(e) => setUserRule(e.target.value)}
                                        className="bg-muted/30 border-border text-foreground"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Leave empty for general optimization, or describe a specific behavior you want to enforce.
                                    </p>
                                </div>

                                <Button onClick={handleAnalyze} disabled={isAnalyzing} size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                                    {isAnalyzing ? "Analyzing..." : "Start Analysis"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-6">
                                {suggestions.map((suggestion, index) => (
                                    <div key={index} className="border border-border rounded-xl p-4 bg-muted/20 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                                <Badge variant="outline" className="font-mono border-border text-foreground">
                                                    {getNodeLabel(suggestion.nodeId)}
                                                </Badge>
                                                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0">
                                                    {suggestion.type === 'systemMessagePrompt' ? 'System' : 'Human'}
                                                </Badge>
                                            </div>
                                            {appliedSuggestions.has(index) ? (
                                                <Badge className="bg-primary/10 text-primary border-primary/20">
                                                    <Check className="mr-1 h-3 w-3" /> Applied
                                                </Badge>
                                            ) : (
                                                <Button size="sm" onClick={() => handleApply(suggestion, index)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                                                    Apply Change
                                                </Button>
                                            )}
                                        </div>

                                        <div className="bg-muted/30 p-3 rounded border border-border text-sm text-muted-foreground">
                                            <span className="font-semibold text-foreground block mb-1">Reasoning:</span>
                                            {suggestion.reasoning}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <span className="text-xs font-medium text-muted-foreground">Current Prompt</span>
                                                <div className="bg-destructive/5 border border-destructive/20 rounded p-2 text-xs font-mono text-muted-foreground max-h-[150px] overflow-y-auto opacity-70">
                                                    {nodes.find(n => n.id === suggestion.nodeId)?.[suggestion.type] || "(Empty)"}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-xs font-medium text-muted-foreground">New Prompt</span>
                                                <div className="bg-primary/5 border border-primary/20 rounded p-2 text-xs font-mono text-foreground max-h-[150px] overflow-y-auto">
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
