'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { OverridableNode, StateMemory } from '@/types/polaris';
import { PromptEditor } from '@/components/prompt-editor';
import { ChatInterface } from '@/components/chat-interface';
import { SimulationManager } from '@/components/simulation-manager';
import { StateEditor } from '@/components/state-editor';
import { BehaviorTestRunner } from '@/components/behavior-test-runner';
import { AnalyzeRefineModal } from '@/components/analyze-refine-modal';
import { OnboardingGuideModal } from '@/components/onboarding-guide-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/lib/api';
import { Persona } from '@/types/simulation';
import { PromptSetVersion } from '@/types/polaris';
import { fetchStateMemory, fetchPromptVersions, getVersionConfig, createPromptVersion, fetchMasterVersion, updateMasterVersion, saveOnboardingGuide, loadOnboardingGuide } from '@/app/actions';
import { Sparkles, History, Save, Loader2, Cloud, CloudOff, BookOpen, FileText, MessageSquare, Play, FlaskConical } from 'lucide-react';
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

    // Onboarding Guide Modal
    const [showOnboardingGuideModal, setShowOnboardingGuideModal] = useState(false);
    const [onboardingGuide, setOnboardingGuide] = useState<string | null>(null);

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

    // Load onboarding guide on mount
    useEffect(() => {
        loadOnboardingGuideData();
    }, [agentId]);

    const loadOnboardingGuideData = async () => {
        try {
            const guide = await loadOnboardingGuide(agentId);
            setOnboardingGuide(guide);
        } catch (error) {
            console.error('Failed to load onboarding guide:', error);
        }
    };

    const handleSaveOnboardingGuide = async (guideText: string) => {
        await saveOnboardingGuide(agentId, guideText);
        setOnboardingGuide(guideText);
    };

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
        <div className="h-screen bg-background overflow-hidden relative font-sans text-foreground flex flex-col p-3">
            <div className="flex-1 flex flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-card/50 backdrop-blur-sm shadow-lg relative z-10 w-full max-w-[1920px] mx-auto">
                {/* Header / Top Bar */}
                <header className="flex-shrink-0 h-14 border-b border-sidebar-border flex items-center justify-between px-6 bg-transparent z-20">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <h1 className="font-serif text-xl font-normal tracking-tight text-foreground">
                                Agent Studio
                            </h1>
                        </div>
                        <div className="h-6 w-px bg-border" />
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <History className="h-4 w-4" />
                                <span className="text-sm font-medium">Version</span>
                            </div>
                            <Select
                                value={selectedVersionId}
                                onValueChange={handleVersionSelect}
                                disabled={isLoadingVersion}
                            >
                                <SelectTrigger className="w-[200px] h-8 text-sm bg-muted/30 border-border">
                                    {isLoadingVersion ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            <span>Loading...</span>
                                        </div>
                                    ) : (
                                        <SelectValue placeholder="Select version..." />
                                    )}
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="current">
                                        <div className="flex items-center gap-2">
                                            <span>Master</span>
                                            <Badge variant="success" className="text-[10px] h-4 px-1.5">Live</Badge>
                                        </div>
                                    </SelectItem>
                                    {promptVersions.map((v) => (
                                        <SelectItem key={v.id} value={v.id}>
                                            <div className="flex items-center justify-between w-full gap-4">
                                                <span>{v.name}</span>
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {new Date(v.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Sync status */}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border border-border/50">
                                {isSyncingMaster ? (
                                    <>
                                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">Syncing</span>
                                    </>
                                ) : isMasterLoaded ? (
                                    <>
                                        <Cloud className="h-3 w-3 text-primary" />
                                        <span className="text-xs text-primary">Synced</span>
                                    </>
                                ) : (
                                    <>
                                        <CloudOff className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">Offline</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Dialog open={isSaveVersionDialogOpen} onOpenChange={setIsSaveVersionDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 border-border text-foreground hover:bg-muted hover:text-foreground">
                                    <Save className="h-3.5 w-3.5 mr-2" />
                                    Save Version
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Save Version</DialogTitle>
                                    <DialogDescription>
                                        Create a snapshot of your current prompts and configuration
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Label htmlFor="version-name">Version Name</Label>
                                    <Input
                                        id="version-name"
                                        value={newVersionName}
                                        onChange={(e) => setNewVersionName(e.target.value)}
                                        placeholder="e.g., v1.0 - Improved greeting"
                                        className="mt-2"
                                    />
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
                </header>

                <Tabs defaultValue="prompts" orientation="vertical" className="flex-1 w-full overflow-hidden">
                    <div className="flex h-full">
                        {/* Left Sidebar */}
                        <aside className="w-56 flex-shrink-0 flex flex-col border-r border-sidebar-border bg-transparent z-20">
                            <div className="flex-1 px-4 py-4 overflow-y-auto">
                                <TabsList className="flex flex-col h-auto bg-transparent space-y-1 p-0">
                                    <TabsTrigger
                                        value="prompts"
                                        className="w-full justify-start px-3 py-2 h-9 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:shadow-none transition-all rounded-md hover:text-foreground hover:bg-muted/50 ring-0 focus-visible:ring-0 outline-none"
                                    >
                                        <FileText className="h-4 w-4 mr-2" />
                                        <span>Prompts</span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="simulation"
                                        className="w-full justify-start px-3 py-2 h-9 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:shadow-none transition-all rounded-md hover:text-foreground hover:bg-muted/50 ring-0 focus-visible:ring-0 outline-none"
                                    >
                                        <Play className="h-4 w-4 mr-2" />
                                        <span>Simulation</span>
                                        {personas.length > 0 && (
                                            <Badge variant="secondary" className="ml-auto h-5 px-1.5 bg-muted text-muted-foreground">{personas.length}</Badge>
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="chat"
                                        className="w-full justify-start px-3 py-2 h-9 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:shadow-none transition-all rounded-md hover:text-foreground hover:bg-muted/50 ring-0 focus-visible:ring-0 outline-none"
                                    >
                                        <MessageSquare className="h-4 w-4 mr-2" />
                                        <span>Chat</span>
                                        {chatMessages.length > 0 && (
                                            <Badge variant="secondary" className="ml-auto h-5 px-1.5 bg-muted text-muted-foreground">{chatMessages.length}</Badge>
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="behavior-tests"
                                        className="w-full justify-start px-3 py-2 h-9 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:shadow-none transition-all rounded-md hover:text-foreground hover:bg-muted/50 ring-0 focus-visible:ring-0 outline-none"
                                    >
                                        <FlaskConical className="h-4 w-4 mr-2" />
                                        <span>Tests</span>
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <div className="p-1 border-t border-sidebar-border space-y-2">
                                <Button
                                    onClick={() => setShowOnboardingGuideModal(true)}
                                    variant="ghost"
                                    className="w-full justify-start text-muted-foreground hover:text-foreground h-9 px-3"
                                >
                                    <BookOpen className="h-4 w-4 mr-2" />
                                    Onboarding Guide
                                    {onboardingGuide && (
                                        <span className="ml-2 h-1.5 w-1.5 bg-primary rounded-full" />
                                    )}
                                </Button>
                                <Button
                                    onClick={() => setShowRefineModal(true)}
                                    size="sm"
                                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Analyze & Refine
                                </Button>
                            </div>
                        </aside>

                        {/* Main Content */}
                        <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10 bg-transparent">
                            {/* Prompts Tab - Scrollable */}
                            <TabsContent value="prompts" className="flex-1 overflow-y-auto p-4 space-y-4 m-0 focus-visible:ring-0 outline-none">
                                {stateMemory && (
                                    <StateEditor
                                        agentId={agentId}
                                        stateMemory={stateMemory}
                                        onStateChange={handleStateChange}
                                        currentOverrides={stateOverrides}
                                        allNodes={nodes}
                                    />
                                )}
                                <div className="space-y-4">
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
                                </div>
                            </TabsContent>

                            {/* Simulation Tab - Full Height */}
                            <TabsContent value="simulation" className="flex-1 overflow-hidden p-4 m-0 focus-visible:ring-0 outline-none">
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

                            {/* Chat Tab - Full Height */}
                            <TabsContent value="chat" className="flex-1 overflow-hidden p-4 m-0 focus-visible:ring-0 outline-none">
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

                            {/* Tests Tab - Full Height */}
                            <TabsContent value="behavior-tests" className="flex-1 overflow-hidden p-4 m-0 focus-visible:ring-0 outline-none">
                                <BehaviorTestRunner
                                    agentId={agentId}
                                    nodes={nodes}
                                    stateOverrides={stateOverrides}
                                    onApplySnapshot={(snapshotNodes, snapshotState) => {
                                        setNodes(snapshotNodes.map(sn => {
                                            const existing = nodes.find(n => n.id === sn.id);
                                            return { ...sn, type: existing?.type || 'Agent' };
                                        }));
                                        setStateOverrides(snapshotState);
                                    }}
                                />
                            </TabsContent>
                        </main>
                    </div>
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

            {/* Onboarding Guide Modal */}
            <OnboardingGuideModal
                agentId={agentId}
                isOpen={showOnboardingGuideModal}
                onClose={() => setShowOnboardingGuideModal(false)}
                initialGuide={onboardingGuide}
                onSave={handleSaveOnboardingGuide}
            />
        </div >
    );
}
