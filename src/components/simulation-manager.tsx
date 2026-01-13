'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, AlertCircle, RefreshCw, History, Eye } from 'lucide-react';
import {
    generateSimulationOptions,
    fetchSimulationOptions,
    updateSimulationOptions,
    startSimulationBatch,
    fetchSimulationBatches,
    fetchBatchSimulations,
    removeBatch,
    loadOnboardingGuide
} from '@/app/actions';
import {
    Persona,
    EnhancedSimulation,
    SimulationConfig,
    GeneratedSimulationOptions,
    SimulationBatch
} from '@/types/simulation';
import { OverridableNode } from '@/types/polaris';
import { SimulationConfigPanel } from '@/components/simulation-config-panel';
import { SimulationResultsView } from '@/components/simulation-results-view';
import { generateSimulationHTML, downloadHTML, generateExportFilename } from '@/lib/export';

interface SimulationManagerProps {
    agentId: string;
    nodes: OverridableNode[];
    personas: Persona[];
    setPersonas: React.Dispatch<React.SetStateAction<Persona[]>>;
    simulationResults: any[];
    setSimulationResults: React.Dispatch<React.SetStateAction<any[]>>;
    onNewSimulation: () => void;
    stateOverrides?: Record<string, string>;
}

type ViewMode = 'loading' | 'no-guide' | 'config' | 'results';

export function SimulationManager({
    agentId,
    nodes,
    personas,
    setPersonas,
    simulationResults,
    setSimulationResults,
    onNewSimulation,
    stateOverrides
}: SimulationManagerProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('loading');
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [simulationOptions, setSimulationOptions] = useState<GeneratedSimulationOptions | null>(null);
    const [batches, setBatches] = useState<SimulationBatch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [batchSimulations, setBatchSimulations] = useState<Record<string, EnhancedSimulation[]>>({});
    const [error, setError] = useState<string | null>(null);
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

    // Initial load
    useEffect(() => {
        loadInitialData();
        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [agentId]);

    const loadInitialData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Check for onboarding guide
            const guide = await loadOnboardingGuide(agentId);
            if (!guide) {
                setViewMode('no-guide');
                setIsLoading(false);
                return;
            }

            // Load existing batches
            const existingBatches = await fetchSimulationBatches(agentId);
            setBatches(existingBatches);

            // Load simulations for each batch
            const simsMap: Record<string, EnhancedSimulation[]> = {};
            for (const batch of existingBatches) {
                simsMap[batch.id] = await fetchBatchSimulations(agentId, batch.id);
            }
            setBatchSimulations(simsMap);

            // Load simulation options
            const options = await fetchSimulationOptions(agentId);
            setSimulationOptions(options);

            // Determine view mode
            if (existingBatches.length > 0) {
                setSelectedBatchId(existingBatches[0].id);
                setViewMode('results');
                // Start polling if any batch is running
                if (existingBatches.some(b => b.status === 'running')) {
                    startPolling();
                }
            } else {
                setViewMode('config');
            }
        } catch (err) {
            console.error('Failed to load simulation data:', err);
            setError('Failed to load simulation data. Please try again.');
            setViewMode('config');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateOptions = async () => {
        setIsGenerating(true);
        setError(null);
        try {
            const options = await generateSimulationOptions(agentId, nodes);
            setSimulationOptions(options);
        } catch (err) {
            console.error('Failed to generate options:', err);
            setError(err instanceof Error ? err.message : 'Failed to generate simulation options');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleOptionsUpdate = async (options: GeneratedSimulationOptions) => {
        setSimulationOptions(options);
        try {
            await updateSimulationOptions(agentId, options);
        } catch (err) {
            console.error('Failed to save options:', err);
        }
    };

    const handleRunSimulations = async (config: SimulationConfig) => {
        setIsRunning(true);
        setError(null);
        try {
            // Start the batch and get initial data immediately
            const { batch, simulations } = await startSimulationBatch(agentId, config, nodes, stateOverrides);

            // Update state with new batch
            setBatches(prev => [batch, ...prev]);
            setBatchSimulations(prev => ({ ...prev, [batch.id]: simulations }));
            setSelectedBatchId(batch.id);

            // Navigate to results immediately
            setViewMode('results');

            // Start polling for updates
            startPolling();
        } catch (err) {
            console.error('Failed to run simulations:', err);
            setError(err instanceof Error ? err.message : 'Failed to run simulations');
        } finally {
            setIsRunning(false);
        }
    };

    const startPolling = useCallback(() => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        const interval = setInterval(async () => {
            try {
                // Fetch updated batches
                const updatedBatches = await fetchSimulationBatches(agentId);
                setBatches(updatedBatches);

                // Update simulations for running batches
                const simsMap: Record<string, EnhancedSimulation[]> = { ...batchSimulations };
                let hasRunning = false;
                for (const batch of updatedBatches) {
                    if (batch.status === 'running') {
                        hasRunning = true;
                        simsMap[batch.id] = await fetchBatchSimulations(agentId, batch.id);
                    }
                }
                setBatchSimulations(simsMap);

                // Stop polling if no batches are running
                if (!hasRunning) {
                    stopPolling();
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2000); // Poll every 2 seconds
        setPollingInterval(interval);
    }, [agentId, pollingInterval, batchSimulations]);

    const stopPolling = useCallback(() => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
        }
    }, [pollingInterval]);

    const handleBackToConfig = () => {
        setViewMode('config');
    };

    const handleDeleteBatch = async (batchId: string) => {
        if (window.confirm('This will delete this batch and all its simulations. Are you sure?')) {
            await removeBatch(agentId, batchId);
            setBatches(prev => prev.filter(b => b.id !== batchId));
            setBatchSimulations(prev => {
                const updated = { ...prev };
                delete updated[batchId];
                return updated;
            });
            // Select another batch if this was selected
            if (selectedBatchId === batchId) {
                const remaining = batches.filter(b => b.id !== batchId);
                setSelectedBatchId(remaining.length > 0 ? remaining[0].id : null);
                if (remaining.length === 0) {
                    setViewMode('config');
                }
            }
        }
    };

    const handleDownload = (batchId: string) => {
        const sims = batchSimulations[batchId] || [];
        if (sims.length === 0) return;
        const html = generateSimulationHTML(sims);
        const batch = batches.find(b => b.id === batchId);
        const filename = generateExportFilename(batch?.name);
        downloadHTML(html, filename);
    };

    // Render based on view mode
    if (viewMode === 'loading' || isLoading) {
        return (
            <div className="h-full flex items-center justify-center border border-border rounded-lg bg-card">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading simulation data...</p>
                </div>
            </div>
        );
    }

    if (viewMode === 'no-guide') {
        return (
            <div className="h-full flex items-center justify-center border border-border rounded-lg bg-card">
                <div className="text-center py-12 max-w-md px-6">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-serif text-foreground mb-2">
                        Onboarding Guide Required
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                        To generate realistic simulations, you need to add an onboarding guide first.
                        Click the "Onboarding Guide" button in the header to add your training document.
                    </p>
                    <div className="bg-muted/30 p-4 rounded-lg text-left text-xs text-muted-foreground">
                        <p className="font-medium mb-2 text-foreground">What to include:</p>
                        <ul className="space-y-1 list-disc list-inside">
                            <li>Company/brand overview</li>
                            <li>Products or services offered</li>
                            <li>Customer types and personas</li>
                            <li>Common scenarios and issues</li>
                            <li>Agent guidelines and policies</li>
                        </ul>
                    </div>
                    <Button
                        className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={loadInitialData}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Check Again
                    </Button>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center border border-border rounded-lg bg-card">
                <div className="text-center max-w-md px-6">
                    <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-serif text-foreground mb-2">
                        Something went wrong
                    </h3>
                    <p className="text-sm text-destructive mb-6">{error}</p>
                    <div className="flex gap-3 justify-center">
                        <Button variant="outline" onClick={() => setError(null)} className="border-border text-foreground hover:bg-muted">
                            Dismiss
                        </Button>
                        <Button onClick={loadInitialData} className="bg-primary text-primary-foreground hover:bg-primary/90">
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (viewMode === 'results' && batches.length > 0) {
        return (
            <div className="h-full">
                <SimulationResultsView
                    agentId={agentId}
                    batches={batches}
                    batchSimulations={batchSimulations}
                    selectedBatchId={selectedBatchId}
                    onSelectBatch={setSelectedBatchId}
                    onDeleteBatch={handleDeleteBatch}
                    onBackToConfig={handleBackToConfig}
                    onDownload={handleDownload}
                    onSimulationsUpdate={(batchId, sims) => {
                        setBatchSimulations(prev => ({ ...prev, [batchId]: sims }));
                    }}
                />
            </div>
        );
    }

    // Default: config view
    return (
        <div className="space-y-4">
            {/* Show previous simulations banner if they exist */}
            {batches.length > 0 && (
                <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <History className="h-5 w-5 text-primary" />
                                <div>
                                    <p className="font-medium text-foreground">Previous Simulations Available</p>
                                    <p className="text-sm text-muted-foreground">
                                        {batches.length} batch{batches.length !== 1 ? 'es' : ''} with simulation results
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={() => setViewMode('results')}
                                variant="outline"
                                className="bg-transparent border-primary/20 hover:bg-primary/10 text-primary hover:text-primary"
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                View Results
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-card border-border shadow-none">
                <CardHeader className="pb-3 border-b border-border mb-4">
                    <CardTitle className="font-serif text-xl">Enhanced Simulation</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Generate personas, emotions, and intents from your onboarding guide,
                        then run realistic multi-turn simulations.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <SimulationConfigPanel
                        options={simulationOptions}
                        isGenerating={isGenerating}
                        isRunning={isRunning}
                        onGenerate={handleGenerateOptions}
                        onRunSimulations={handleRunSimulations}
                        onOptionsUpdate={handleOptionsUpdate}
                    />
                </CardContent>
            </Card>

            {isRunning && (
                <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <div>
                                <p className="font-medium text-foreground">Starting Simulations...</p>
                                <p className="text-sm text-muted-foreground">
                                    Preparing to run simulations
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
