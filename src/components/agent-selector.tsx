'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Upload, Trash2, Sparkles, ExternalLink, Loader2, ArrowRight } from 'lucide-react';
import { AgentConfig } from '@/types/polaris';
import { fetchAgents, createAgent, deleteAgentAction } from '@/app/actions';

interface AgentSelectorProps {
    onAgentSelect: (agentId: string) => void;
    selectedAgentId?: string;
}

export function AgentSelector({ onAgentSelect, selectedAgentId }: AgentSelectorProps) {
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [apiUrl, setApiUrl] = useState('');
    const [graphJson, setGraphJson] = useState('');
    const [createdBy, setCreatedBy] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    const loadAgents = useCallback(async () => {
        try {
            const agentList = await fetchAgents();
            setAgents(agentList);
        } catch (err) {
            console.error('Failed to load agents:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAgents();
    }, [loadAgents]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const content = await file.text();
            // Validate JSON
            JSON.parse(content);
            setGraphJson(content);
            setError('');

            // Try to extract name from filename if not set
            if (!name) {
                const fileName = file.name.replace('.json', '');
                setName(fileName.replace(/-/g, ' ').replace(/_/g, ' '));
            }
        } catch (err) {
            setError('Invalid JSON file');
        }
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            setError('Please enter an agent name');
            return;
        }
        if (!apiUrl.trim()) {
            setError('Please enter the Polaris API URL');
            return;
        }
        if (!graphJson.trim()) {
            setError('Please upload or paste the agent JSON');
            return;
        }

        setError('');
        setCreating(true);

        try {
            const parsedJson = JSON.parse(graphJson);
            const agent = await createAgent(
                name.trim(),
                apiUrl.trim(),
                parsedJson,
                createdBy.trim() || undefined,
                description.trim() || undefined
            );

            // Reset form
            setName('');
            setApiUrl('');
            setGraphJson('');
            setCreatedBy('');
            setDescription('');
            setIsCreateOpen(false);

            // Reload agents and select the new one
            await loadAgents();
            onAgentSelect(agent.id);
        } catch (err: any) {
            setError(err.message || 'Failed to create agent');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (agentId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this agent? All data will be lost.')) {
            return;
        }

        try {
            await deleteAgentAction(agentId);
            await loadAgents();
            if (selectedAgentId === agentId) {
                // Agent was deleted, clear selection
                onAgentSelect('');
            }
        } catch (err) {
            console.error('Failed to delete agent:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading agents...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            {/* Compact header */}
            <div className="border-b">
                <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded bg-primary/10">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-primary">Agents</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-sm font-medium">Select Agent</span>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {agents.map((agent) => (
                        <div
                            key={agent.id}
                            className={`group relative border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors ${
                                selectedAgentId === agent.id ? 'border-primary bg-primary/5' : 'bg-card'
                            }`}
                            onClick={() => onAgentSelect(agent.id)}
                        >
                            <div className="flex items-start gap-2.5">
                                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-sm truncate">{agent.name}</h3>
                                    {agent.description && (
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                                            {agent.description}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                                        {new Date(agent.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={(e) => handleDelete(agent.id, e)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}

                    {/* Add new agent card */}
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <div className="border border-dashed rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground min-h-[76px]">
                                <Plus className="h-4 w-4" />
                                <span className="text-sm">Add Agent</span>
                            </div>
                        </DialogTrigger>
                        <CreateAgentDialog
                            name={name}
                            setName={setName}
                            apiUrl={apiUrl}
                            setApiUrl={setApiUrl}
                            graphJson={graphJson}
                            setGraphJson={setGraphJson}
                            createdBy={createdBy}
                            setCreatedBy={setCreatedBy}
                            description={description}
                            setDescription={setDescription}
                            error={error}
                            creating={creating}
                            handleFileUpload={handleFileUpload}
                            handleCreate={handleCreate}
                        />
                    </Dialog>
                </div>
            </div>
        </div>
    );
}

interface CreateAgentDialogProps {
    name: string;
    setName: (v: string) => void;
    apiUrl: string;
    setApiUrl: (v: string) => void;
    graphJson: string;
    setGraphJson: (v: string) => void;
    createdBy: string;
    setCreatedBy: (v: string) => void;
    description: string;
    setDescription: (v: string) => void;
    error: string;
    creating: boolean;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleCreate: () => void;
}

function CreateAgentDialog({
    name,
    setName,
    apiUrl,
    setApiUrl,
    graphJson,
    setGraphJson,
    createdBy,
    setCreatedBy,
    description,
    setDescription,
    error,
    creating,
    handleFileUpload,
    handleCreate,
}: CreateAgentDialogProps) {
    return (
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Add New Agent</DialogTitle>
                <DialogDescription>
                    Upload your agent configuration to start refining prompts
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Agent Name</Label>
                    <Input
                        id="name"
                        placeholder="e.g., Customer Support Agent"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="apiUrl">API URL</Label>
                    <Input
                        id="apiUrl"
                        placeholder="https://polaris.invoca.net/api/v1/prediction/..."
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Supported: polaris.invoca.net or polaris.invocadev.com
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>Agent JSON Configuration</Label>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2" asChild>
                            <label className="cursor-pointer">
                                <Upload className="h-4 w-4" />
                                Upload JSON
                                <input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </label>
                        </Button>
                        {graphJson && (
                            <span className="text-xs text-emerald-600 font-medium">
                                JSON loaded ({Math.round(graphJson.length / 1024)}KB)
                            </span>
                        )}
                    </div>
                    <Textarea
                        placeholder='{"nodes": [...], ...}'
                        value={graphJson}
                        onChange={(e) => setGraphJson(e.target.value)}
                        className="font-mono text-xs h-28"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="createdBy">Your Name (optional)</Label>
                        <Input
                            id="createdBy"
                            placeholder="e.g., John Doe"
                            value={createdBy}
                            onChange={(e) => setCreatedBy(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description (optional)</Label>
                        <Input
                            id="description"
                            placeholder="Brief description..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>

                {error && (
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                        {error}
                    </div>
                )}
            </div>

            <DialogFooter>
                <Button onClick={handleCreate} disabled={creating}>
                    {creating ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                        </>
                    ) : (
                        <>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Agent
                        </>
                    )}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
