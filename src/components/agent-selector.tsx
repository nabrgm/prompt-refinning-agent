'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Upload, Trash2, Bot, ExternalLink, Loader2 } from 'lucide-react';
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
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold mb-2">Prompt Refinement & Eval Tool</h1>
                <p className="text-muted-foreground">
                    Select an agent to evaluate, or add a new agent
                </p>
            </div>

            <div className="grid gap-4 mb-6">
                {agents.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground mb-4">No agents registered yet</p>
                            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Your First Agent
                                    </Button>
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
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {agents.map((agent) => (
                            <Card
                                key={agent.id}
                                className={`cursor-pointer transition-all hover:border-primary ${
                                    selectedAgentId === agent.id ? 'border-primary ring-2 ring-primary/20' : ''
                                }`}
                                onClick={() => onAgentSelect(agent.id)}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Bot className="h-5 w-5" />
                                            {agent.name}
                                        </CardTitle>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => handleDelete(agent.id, e)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {agent.description && (
                                        <CardDescription>{agent.description}</CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="text-xs text-muted-foreground space-y-1">
                                        <div className="flex items-center gap-1">
                                            <ExternalLink className="h-3 w-3" />
                                            <span className="truncate">{agent.apiUrl}</span>
                                        </div>
                                        {agent.createdBy && (
                                            <div>Created by: {agent.createdBy}</div>
                                        )}
                                        <div>Added: {new Date(agent.createdAt).toLocaleDateString()}</div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}

                        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                            <DialogTrigger asChild>
                                <Card className="border-dashed cursor-pointer hover:border-primary transition-all">
                                    <CardContent className="flex items-center justify-center py-8">
                                        <Button variant="ghost" className="gap-2">
                                            <Plus className="h-5 w-5" />
                                            Add New Agent
                                        </Button>
                                    </CardContent>
                                </Card>
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
                    </>
                )}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
                <DialogTitle>Add New Agent</DialogTitle>
                <DialogDescription>
                    Upload your agent's JSON and provide the Polaris API URL
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 overflow-hidden">
                <div className="space-y-2">
                    <Label htmlFor="name">Agent Name *</Label>
                    <Input
                        id="name"
                        placeholder="e.g., iProspect Support Agent"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="apiUrl">Polaris API URL *</Label>
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
                    <Label>Agent JSON *</Label>
                    <div className="flex gap-2">
                        <Button variant="outline" className="gap-2" asChild>
                            <label>
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
                            <span className="text-sm text-green-600 flex items-center">
                                JSON loaded ({Math.round(graphJson.length / 1024)}KB)
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Or paste the JSON below:
                    </p>
                    <Textarea
                        placeholder='{"nodes": [...], ...}'
                        value={graphJson}
                        onChange={(e) => setGraphJson(e.target.value)}
                        className="font-mono text-xs h-32 whitespace-pre-wrap break-all overflow-x-hidden"
                    />
                </div>

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
                    <Textarea
                        id="description"
                        placeholder="Brief description of this agent..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="h-20"
                    />
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
