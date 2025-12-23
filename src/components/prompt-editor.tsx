'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { OverridableNode, PromptVersion } from '@/types/polaris';
import { saveNodeOverride, saveVersion, fetchVersions, updateVersion } from '@/app/actions';
import { motion } from 'framer-motion';
import { Save, RefreshCw, History, GitBranch, SplitSquareHorizontal } from 'lucide-react';
import { PromptOptimizer } from '@/components/prompt-optimizer';
import { PromptComparison } from '@/components/prompt-comparison';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


interface PromptEditorProps {
    agentId: string;
    node: OverridableNode;
    onUpdate?: (type: 'systemMessagePrompt' | 'humanMessagePrompt', content: string) => void;
    allNodes?: OverridableNode[];
    stateFields?: Record<string, string>;
}

export function PromptEditor({ agentId, node, onUpdate, allNodes, stateFields }: PromptEditorProps) {
    const [systemPrompt, setSystemPrompt] = useState(node.systemMessagePrompt || '');
    const [humanPrompt, setHumanPrompt] = useState(node.humanMessagePrompt || '');
    const [isSaving, setIsSaving] = useState(false);
    const [versions, setVersions] = useState<PromptVersion[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<string>('current');
    const [newVersionLabel, setNewVersionLabel] = useState('');
    const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
    const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);
    const [compareVersionId, setCompareVersionId] = useState<string>('');

    // Sync local state when node prop changes (e.g., when master version loads)
    useEffect(() => {
        setSystemPrompt(node.systemMessagePrompt || '');
        setHumanPrompt(node.humanMessagePrompt || '');
    }, [node.systemMessagePrompt, node.humanMessagePrompt]);

    useEffect(() => {
        loadVersions();
    }, [node.id]);

    const loadVersions = async () => {
        const v = await fetchVersions(agentId, node.id);
        setVersions(v);
    };

    const handleSaveVersion = async () => {
        if (!newVersionLabel) return;
        await saveVersion(agentId, node.id, newVersionLabel, systemPrompt, humanPrompt);
        setNewVersionLabel('');
        setIsVersionDialogOpen(false);
        loadVersions();
    };

    const handleVersionSelect = (versionId: string) => {
        setSelectedVersion(versionId);
        if (versionId === 'current') {
            // In a real app, we might want to revert to the "live" version
            // For now, we just keep the current state or maybe reload from props?
            // Let's reload from props to be safe, but user might lose unsaved changes.
            setSystemPrompt(node.systemMessagePrompt || '');
            setHumanPrompt(node.humanMessagePrompt || '');
        } else {
            const version = versions.find(v => v.id === versionId);
            if (version) {
                setSystemPrompt(version.systemMessagePrompt || '');
                setHumanPrompt(version.humanMessagePrompt || '');
            }
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Always save to the current/live prompts
            if (systemPrompt !== node.systemMessagePrompt) {
                await saveNodeOverride(agentId, node.id, 'systemMessagePrompt', systemPrompt);
                onUpdate?.('systemMessagePrompt', systemPrompt);
            }
            if (humanPrompt !== node.humanMessagePrompt) {
                await saveNodeOverride(agentId, node.id, 'humanMessagePrompt', humanPrompt);
                onUpdate?.('humanMessagePrompt', humanPrompt);
            }

            // Also update the selected version if one is selected (not 'current')
            if (selectedVersion !== 'current') {
                await updateVersion(agentId, node.id, selectedVersion, systemPrompt, humanPrompt);
                // Reload versions to reflect the update
                await loadVersions();
            }

            // Simulate network delay for effect
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Failed to save', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Card className="w-full bg-white/50 backdrop-blur-sm border-slate-200 shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-xl font-bold text-slate-800">
                        Edit Prompt: <span className="text-indigo-600">{node.label}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <GitBranch className="h-4 w-4 mr-2" />
                                    Save Version
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Save New Version</DialogTitle>
                                    <DialogDescription>
                                        Create a snapshot of the current prompts to restore later.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="name" className="text-right">
                                            Label
                                        </Label>
                                        <Input
                                            id="name"
                                            value={newVersionLabel}
                                            onChange={(e) => setNewVersionLabel(e.target.value)}
                                            placeholder="e.g. v1.0 - More empathetic"
                                            className="col-span-3"
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleSaveVersion}>Save Version</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Select value={selectedVersion} onValueChange={handleVersionSelect}>
                            <SelectTrigger className="w-[180px] h-8">
                                <History className="h-4 w-4 mr-2 text-slate-500" />
                                <SelectValue placeholder="Load Version" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="current">Current Draft</SelectItem>
                                {versions.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                        {v.label} <span className="text-xs text-slate-400 ml-2">({new Date(v.timestamp).toLocaleDateString()})</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {isSaving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>

                    <Dialog open={isCompareDialogOpen} onOpenChange={setIsCompareDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-2">
                                <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                                Compare
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl h-[80vh]">
                            <DialogHeader>
                                <DialogTitle>Compare Versions</DialogTitle>
                                <DialogDescription>
                                    Compare the current draft with a saved version.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex items-center gap-4 mb-4">
                                <Label>Compare against:</Label>
                                <Select value={compareVersionId} onValueChange={setCompareVersionId}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Select version" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {versions.map((v) => (
                                            <SelectItem key={v.id} value={v.id}>
                                                {v.label} ({new Date(v.timestamp).toLocaleDateString()})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {compareVersionId && (
                                <div className="flex-1 overflow-hidden">
                                    {node.systemMessagePrompt !== undefined && (
                                        <div className="mb-4">
                                            <h4 className="font-medium mb-2">System Prompt</h4>
                                            <PromptComparison
                                                original={versions.find(v => v.id === compareVersionId)?.systemMessagePrompt || ''}
                                                modified={systemPrompt}
                                                originalLabel={versions.find(v => v.id === compareVersionId)?.label}
                                                modifiedLabel="Current Draft"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent className="space-y-6">
                    {node.systemMessagePrompt !== undefined && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="system-prompt" className="text-slate-600 font-medium">System Message Prompt</Label>
                                <PromptOptimizer
                                    currentPrompt={systemPrompt}
                                    type="system"
                                    nodeLabel={node.label}
                                    onRefined={setSystemPrompt}
                                    allNodes={allNodes}
                                    stateFields={stateFields}
                                />
                            </div>
                            <Textarea
                                id="system-prompt"
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                className="min-h-[200px] font-mono text-sm bg-slate-50 border-slate-200 focus:ring-indigo-500"
                                placeholder="Enter system prompt..."
                            />
                        </div>
                    )}

                    {node.humanMessagePrompt !== undefined && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="human-prompt" className="text-slate-600 font-medium">Human Message Prompt</Label>
                                <PromptOptimizer
                                    currentPrompt={humanPrompt}
                                    type="human"
                                    nodeLabel={node.label}
                                    onRefined={setHumanPrompt}
                                    allNodes={allNodes}
                                    stateFields={stateFields}
                                />
                            </div>
                            <Textarea
                                id="human-prompt"
                                value={humanPrompt}
                                onChange={(e) => setHumanPrompt(e.target.value)}
                                className="min-h-[100px] font-mono text-sm bg-slate-50 border-slate-200 focus:ring-indigo-500"
                                placeholder="Enter human prompt..."
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
