'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { OverridableNode, StateMemory } from '@/types/polaris';
import { PromptEditor } from '@/components/prompt-editor';
import { ChatInterface } from '@/components/chat-interface';
import { SimulationManager } from '@/components/simulation-manager';
import { StateEditor } from '@/components/state-editor';
import { BehaviorTestRunner } from '@/components/behavior-test-runner';
import { AnalyzeRefineModal } from '@/components/analyze-refine-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/lib/api';
import { Persona } from '@/types/simulation';
import { PromptSetVersion } from '@/types/polaris';
import { fetchStateMemory, fetchPromptVersions, getVersionConfig, createPromptVersion, fetchMasterVersion, updateMasterVersion } from '@/app/actions';
import { Sparkles, History, Save, Loader2, Cloud, CloudOff, Check } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DashboardProps {
    agentId: string;
    initialNodes: OverridableNode[];
    initialStateMemory?: StateMemory | null;
}

export function Dashboard({ agentId, initialNodes, initialStateMemory }: DashboardProps) {
    const [nodes, setNodes] = useState<OverridableNode[]>(initialNodes);

    // State memory for agent configuration
    const [stateMemory, setStateMemory] = useState<StateMemory | null>(initialStateMemory || null);
    const [stateOverrides, setStateOverrides] = useState<Record<string, string>>({});

    // Persistent Chat State
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatId, setChatId] = useState<string | undefined>(undefined);
    const [chatMessagesRight, setChatMessagesRight] = useState<ChatMessage[]>([]);
    const [chatIdRight, setChatIdRight] = useState<string | undefined>(undefined);

    // Persistent Simulation State
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [simulationResults, setSimulationResults] = useState<any[]>([]);

    // Analyze & Refine Modal
    const [showRefineModal, setShowRefineModal] = useState(false);

    // Prompt Set Versions
    const [promptVersions, setPromptVersions] = useState<PromptSetVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
    const [isLoadingVersion, setIsLoadingVersion] = useState(false);
    const [isSaveVersionDialogOpen, setIsSaveVersionDialogOpen] = useState(false);
    const [newVersionName, setNewVersionName] = useState('');
    const [isSavingVersion, setIsSavingVersion] = useState(false);

    // Master version sync
    const [isMasterLoaded, setIsMasterLoaded] = useState(false);
    const [masterVersionFound, setMasterVersionFound] = useState(false);
    const [isSyncingMaster, setIsSyncingMaster] = useState(false);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load master version on mount (takes priority over initialNodes if exists)
    useEffect(() => {
        const loadMaster = async () => {
            try {
                const master = await fetchMasterVersion(agentId);
                if (master && master.nodes.length > 0) {
                    console.log('[Dashboard] Loading master version...');
                    // Apply master version nodes
                    setNodes(master.nodes.map(mn => {
                        const initial = initialNodes.find(n => n.id === mn.id);
                        return {
                            id: mn.id,
                            label: mn.label,
                            type: initial?.type || mn.type || 'Agent',
                            systemMessagePrompt: mn.systemMessagePrompt,
                            humanMessagePrompt: mn.humanMessagePrompt,
                        };
                    }));
                    // Apply master version state
                    setStateOverrides(master.stateValues);
                    setMasterVersionFound(true);
                    console.log('[Dashboard] Master version loaded:', master.lastUpdated);
                } else {
                    console.log('[Dashboard] No master version found, using defaults');
                    setMasterVersionFound(false);
                }
            } catch (error) {
                console.error('[Dashboard] Failed to load master version:', error);
                setMasterVersionFound(false);
            } finally {
                setIsMasterLoaded(true);
            }
        };
        loadMaster();
    }, [agentId]);

    // Auto-sync to master version when nodes or stateOverrides change (debounced)
    const syncToMaster = useCallback(async () => {
        if (!isMasterLoaded) return; // Don't sync until initial load is complete

        setIsSyncingMaster(true);
        try {
            await updateMasterVersion(agentId, nodes, stateOverrides);
            console.log('[Dashboard] Master version synced');
        } catch (error) {
            console.error('[Dashboard] Failed to sync master version:', error);
        } finally {
            setIsSyncingMaster(false);
        }
    }, [agentId, nodes, stateOverrides, isMasterLoaded]);

    useEffect(() => {
        if (!isMasterLoaded) return;

        // Debounce the sync to avoid too many writes
        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = setTimeout(() => {
            syncToMaster();
        }, 1000); // 1 second debounce

        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, [nodes, stateOverrides, isMasterLoaded, syncToMaster]);

    // Load prompt versions on mount
    useEffect(() => {
        loadPromptVersions();
    }, []);

    const loadPromptVersions = async () => {
        try {
            const versions = await fetchPromptVersions(agentId);
            setPromptVersions(versions);
        } catch (error) {
            console.error('Failed to load prompt versions:', error);
        }
    };

    const handleVersionSelect = async (versionId: string) => {
        if (versionId === 'current') {
            setSelectedVersionId('current');
            return;
        }

        setIsLoadingVersion(true);
        try {
            const config = await getVersionConfig(agentId, versionId);
            if (config) {
                // Apply the version's nodes
                setNodes(config.nodes.map(vn => {
                    const existing = nodes.find(n => n.id === vn.id);
                    return {
                        ...vn,
                        type: existing?.type || vn.type || 'Agent',
                    };
                }));
                // Apply the version's state
                setStateOverrides(config.stateValues);
                setSelectedVersionId(versionId);
            }
        } catch (error) {
            console.error('Failed to load version:', error);
        } finally {
            setIsLoadingVersion(false);
        }
    };

    const handleSaveVersion = async () => {
        if (!newVersionName.trim()) return;

        setIsSavingVersion(true);
        try {
            await createPromptVersion(agentId, newVersionName, nodes, stateOverrides);
            await loadPromptVersions();
            setNewVersionName('');
            setIsSaveVersionDialogOpen(false);
            setSelectedVersionId('current'); // Reset to current after saving
        } catch (error) {
            console.error('Failed to save version:', error);
        } finally {
            setIsSavingVersion(false);
        }
    };

    // Load state memory on mount if not provided
    useEffect(() => {
        if (!initialStateMemory) {
            fetchStateMemory(agentId).then(sm => setStateMemory(sm));
        }
    }, [agentId, initialStateMemory]);

    // Initialize state overrides from state memory ONLY if no master version exists
    // Master version takes priority over default state memory values
    useEffect(() => {
        // Only initialize from state memory if:
        // 1. Master load has completed (isMasterLoaded = true)
        // 2. No master version was found (masterVersionFound = false)
        // 3. State memory exists
        if (isMasterLoaded && !masterVersionFound && stateMemory) {
            console.log('[Dashboard] No master found, initializing from state memory defaults');
            const overrides: Record<string, string> = {};
            stateMemory.fields.forEach(f => {
                overrides[f.key] = f.defaultValue;
            });
            setStateOverrides(overrides);
        }
    }, [stateMemory, isMasterLoaded, masterVersionFound]);

    const handleStateChange = (key: string, value: string) => {
        setStateOverrides(prev => ({ ...prev, [key]: value }));
    };

    const handleUpdateNode = (nodeId: string, type: 'systemMessagePrompt' | 'humanMessagePrompt', content: string) => {
        setNodes(prev => prev.map(n => {
            if (n.id === nodeId) {
                return { ...n, [type]: content };
            }
            return n;
        }));
    };

    const handleNewChat = () => {
        setChatMessages([]);
        setChatId(undefined);
        setChatMessagesRight([]);
        setChatIdRight(undefined);
    };

    const handleNewSimulation = () => {
        setPersonas([]);
        setSimulationResults([]);
    };

    // Calculate overrides by comparing current nodes with initial nodes
    const getOverrides = () => {
        return nodes.filter(n => {
            const initial = initialNodes.find(i => i.id === n.id);
            if (!initial) return true;
            return n.systemMessagePrompt !== initial.systemMessagePrompt ||
                n.humanMessagePrompt !== initial.humanMessagePrompt;
        });
    };

    const overrides = getOverrides();

    // Handler for applying refined prompts
    const handleApplyRefinement = (
        updatedNodes: OverridableNode[],
        updatedState: Record<string, string>
    ) => {
        setNodes(updatedNodes);
        setStateOverrides(updatedState);
    };

    return (
        <div className="grid grid-cols-1 gap-8">
            {/* Header with Analyze & Refine button */}
            <header className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
                        Prompt Refinement & Eval Tool
                    </h1>
                    <p className="text-lg text-slate-600">
                        Managing and refining agent prompts with AI-powered tools.
                    </p>
                </div>
                <Button
                    onClick={() => setShowRefineModal(true)}
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    size="lg"
                >
                    <Sparkles className="mr-2 h-5 w-5" />
                    Analyze & Refine
                </Button>
            </header>

            <div className="space-y-8">
                <Tabs defaultValue="prompts" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-8">
                        <TabsTrigger value="prompts">Prompt Editor</TabsTrigger>
                        <TabsTrigger value="simulation">
                            Simulation {personas.length > 0 && `(${personas.length})`}
                        </TabsTrigger>
                        <TabsTrigger value="chat">
                            Chat & Debug {chatMessages.length > 0 && `(${chatMessages.length})`}
                        </TabsTrigger>
                        <TabsTrigger value="behavior-tests">
                            Behavior Tests
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="prompts" className="space-y-8">
                        {/* Version Selector */}
                        <Card className="bg-slate-50 border-slate-200">
                            <CardContent className="py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <History className="h-4 w-4 text-slate-500" />
                                            <span className="text-sm font-medium text-slate-700">Prompt Version</span>
                                        </div>
                                        <Select
                                            value={selectedVersionId}
                                            onValueChange={handleVersionSelect}
                                            disabled={isLoadingVersion}
                                        >
                                            <SelectTrigger className="w-[280px] bg-white">
                                                {isLoadingVersion ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        <span>Loading...</span>
                                                    </div>
                                                ) : (
                                                    <SelectValue placeholder="Select version..." />
                                                )}
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="current">
                                                    <div className="flex items-center gap-2">
                                                        <span>Master Version</span>
                                                        <Badge variant="secondary" className="text-[10px] px-1.5 bg-emerald-100 text-emerald-700">Live</Badge>
                                                    </div>
                                                </SelectItem>
                                                {promptVersions.map((v) => (
                                                    <SelectItem key={v.id} value={v.id}>
                                                        <div className="flex items-center justify-between w-full gap-4">
                                                            <span>{v.name}</span>
                                                            <span className="text-xs text-slate-400">
                                                                {new Date(v.createdAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {promptVersions.length === 0 && (
                                            <span className="text-xs text-slate-400">No saved versions yet</span>
                                        )}

                                        {/* Master sync status indicator */}
                                        <div className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md bg-slate-100">
                                            {isSyncingMaster ? (
                                                <>
                                                    <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
                                                    <span className="text-xs text-slate-500">Syncing...</span>
                                                </>
                                            ) : isMasterLoaded ? (
                                                <>
                                                    <Cloud className="h-3 w-3 text-emerald-500" />
                                                    <span className="text-xs text-emerald-600">Synced</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CloudOff className="h-3 w-3 text-slate-400" />
                                                    <span className="text-xs text-slate-400">Loading...</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <Dialog open={isSaveVersionDialogOpen} onOpenChange={setIsSaveVersionDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Save className="h-4 w-4 mr-2" />
                                                Save as Version
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Save Prompt Version</DialogTitle>
                                                <DialogDescription>
                                                    Save the current prompts and state configuration as a named version.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="version-name" className="text-right">
                                                        Name
                                                    </Label>
                                                    <Input
                                                        id="version-name"
                                                        value={newVersionName}
                                                        onChange={(e) => setNewVersionName(e.target.value)}
                                                        placeholder="e.g. v1.0 - Improved greeting"
                                                        className="col-span-3"
                                                    />
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    onClick={handleSaveVersion}
                                                    disabled={!newVersionName.trim() || isSavingVersion}
                                                >
                                                    {isSavingVersion ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        'Save Version'
                                                    )}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </CardContent>
                        </Card>

                        {/* State Editor for brand_system_base and other state fields */}
                        {stateMemory && (
                            <StateEditor
                                agentId={agentId}
                                stateMemory={stateMemory}
                                onStateChange={handleStateChange}
                                currentOverrides={stateOverrides}
                                allNodes={nodes}
                            />
                        )}

                        {/* Prompt Editors */}
                        {nodes.map((node) => (
                            <div key={node.id} id={node.id} className="scroll-mt-24">
                                <PromptEditor
                                    agentId={agentId}
                                    node={node}
                                    onUpdate={(type, content) => handleUpdateNode(node.id, type, content)}
                                    allNodes={nodes}
                                    stateFields={stateOverrides}
                                />
                            </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="simulation">
                        <SimulationManager
                            agentId={agentId}
                            nodes={nodes}
                            personas={personas}
                            setPersonas={setPersonas}
                            simulationResults={simulationResults}
                            setSimulationResults={setSimulationResults}
                            onNewSimulation={handleNewSimulation}
                            stateOverrides={stateOverrides}
                        />
                    </TabsContent>

                    <TabsContent value="chat">
                        <ChatInterface
                            agentId={agentId}
                            nodes={nodes}
                            messages={chatMessages}
                            setMessages={setChatMessages}
                            chatId={chatId}
                            setChatId={setChatId}
                            messagesRight={chatMessagesRight}
                            setMessagesRight={setChatMessagesRight}
                            chatIdRight={chatIdRight}
                            setChatIdRight={setChatIdRight}
                            onNewChat={handleNewChat}
                            stateOverrides={stateOverrides}
                        />
                    </TabsContent>

                    <TabsContent value="behavior-tests">
                        <BehaviorTestRunner
                            agentId={agentId}
                            nodes={nodes}
                            stateOverrides={stateOverrides}
                            onApplySnapshot={(snapshotNodes, snapshotState) => {
                                // Apply snapshot nodes
                                setNodes(snapshotNodes.map(sn => {
                                    const existing = nodes.find(n => n.id === sn.id);
                                    return {
                                        ...sn,
                                        type: existing?.type || 'Agent',
                                    };
                                }));
                                // Apply snapshot state
                                setStateOverrides(snapshotState);
                            }}
                        />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Analyze & Refine Modal */}
            <AnalyzeRefineModal
                agentId={agentId}
                isOpen={showRefineModal}
                onClose={() => setShowRefineModal(false)}
                nodes={nodes}
                stateOverrides={stateOverrides}
                stateMemory={stateMemory}
                onApply={handleApplyRefinement}
            />
        </div>
    );
}
