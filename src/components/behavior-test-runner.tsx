'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Loader2,
    Play,
    FlaskConical,
    CheckCircle2,
    XCircle,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    Trash2,
    AlertCircle,
    Sparkles,
    Wand2,
    Lightbulb,
    FileText
} from 'lucide-react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    createBehaviorTest,
    fetchBehaviorExperiments,
    deleteBehaviorExperimentAction,
    clearBehaviorExperiments,
    fetchPromptVersions,
    deletePromptVersionAction,
    getVersionConfig,
    refineBehaviorTestPrompt
} from '@/app/actions';
import { BehaviorExperiment, BehaviorTestResult, BehaviorTest } from '@/types/behavior-test';
import { OverridableNode, PromptSetVersion } from '@/types/polaris';
import { TracePanel } from '@/components/trace-panel';

interface BehaviorTestRunnerProps {
    agentId: string;
    nodes: OverridableNode[];
    stateOverrides?: Record<string, string>;
    onApplySnapshot?: (nodes: OverridableNode[], stateValues: Record<string, string>) => void;
}

export function BehaviorTestRunner({ agentId, nodes, stateOverrides, onApplySnapshot }: BehaviorTestRunnerProps) {
    const [problemDescription, setProblemDescription] = useState('');
    const [simulationCount, setSimulationCount] = useState<number>(10);
    const [isRunning, setIsRunning] = useState(false);
    const [experiments, setExperiments] = useState<BehaviorExperiment[]>([]);
    const [selectedExperiment, setSelectedExperiment] = useState<BehaviorExperiment | null>(null);
    const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [runningProgress, setRunningProgress] = useState<{
        completed: number;
        total: number;
        currentPersona?: string;
    } | null>(null);
    const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
    const [showScorerPrompt, setShowScorerPrompt] = useState(false);
    const [isRefining, setIsRefining] = useState(false);

    // Preview state - holds the generated test before running
    const [pendingTest, setPendingTest] = useState<BehaviorTest | null>(null);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [editableScorerPrompt, setEditableScorerPrompt] = useState('');

    // Prompt Set Versions
    const [versions, setVersions] = useState<PromptSetVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>('current');

    // Load experiments and versions on mount
    useEffect(() => {
        loadExperiments();
        loadVersions();
    }, []);

    const loadExperiments = async () => {
        setIsLoading(true);
        try {
            const loaded = await fetchBehaviorExperiments(agentId);
            setExperiments(loaded);
            if (loaded.length > 0 && !selectedExperiment) {
                setSelectedExperiment(loaded[0]);
            }
        } catch (error) {
            console.error('Failed to load experiments:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadVersions = async () => {
        try {
            const loaded = await fetchPromptVersions(agentId);
            setVersions(loaded);
        } catch (error) {
            console.error('Failed to load versions:', error);
        }
    };

    const handleApplyVersion = async (versionId: string) => {
        if (!onApplySnapshot || versionId === 'current') return;
        try {
            const versionConfig = await getVersionConfig(agentId, versionId);
            if (versionConfig) {
                onApplySnapshot(versionConfig.nodes, versionConfig.stateValues);
            }
        } catch (error) {
            console.error('Failed to apply version:', error);
        }
    };

    const handleDeleteVersion = async (versionId: string) => {
        if (!confirm('Delete this prompt version?')) return;
        try {
            await deletePromptVersionAction(agentId, versionId);
            await loadVersions();
            if (selectedVersionId === versionId) {
                setSelectedVersionId('current');
            }
        } catch (error) {
            console.error('Failed to delete version:', error);
        }
    };

    // Get the nodes and state to use for testing (either current or from selected version)
    const getTestConfig = async (): Promise<{ testNodes: OverridableNode[], testState: Record<string, string> }> => {
        if (selectedVersionId === 'current') {
            return { testNodes: nodes, testState: stateOverrides || {} };
        }
        const versionConfig = await getVersionConfig(agentId, selectedVersionId);
        if (versionConfig) {
            return { testNodes: versionConfig.nodes, testState: versionConfig.stateValues };
        }
        return { testNodes: nodes, testState: stateOverrides || {} };
    };

    const handleRefinePrompt = async () => {
        if (!problemDescription.trim()) return;

        setIsRefining(true);
        try {
            const refined = await refineBehaviorTestPrompt(problemDescription);
            setProblemDescription(refined);
        } catch (error) {
            console.error('Failed to refine prompt:', error);
            alert('Failed to refine prompt. Check console for details.');
        } finally {
            setIsRefining(false);
        }
    };

    // Step 1: Generate the test and show scorer prompt for preview
    const handleGenerateTest = async () => {
        if (!problemDescription.trim()) return;

        setIsGeneratingTest(true);
        try {
            // Create the test (this generates the scorer prompt)
            const test = await createBehaviorTest(agentId, problemDescription, simulationCount);
            setPendingTest(test);
            setEditableScorerPrompt(test.scorerPrompt);
            console.log('Test generated, scorer prompt ready for review');
        } catch (error) {
            console.error('Failed to generate test:', error);
            alert('Failed to generate test. Check console for details.');
        } finally {
            setIsGeneratingTest(false);
        }
    };

    // Step 2: Run the experiment with the approved scorer prompt
    const handleRunTest = async () => {
        if (!pendingTest) return;

        setIsRunning(true);
        setRunningProgress({ completed: 0, total: simulationCount });

        try {
            // Get the config to use (current or from selected version)
            const { testNodes, testState } = await getTestConfig();
            const versionName = selectedVersionId === 'current'
                ? 'Current Config'
                : versions.find(v => v.id === selectedVersionId)?.name || 'Unknown Version';

            console.log(`Starting experiment with ${simulationCount} simulations using: ${versionName}`);

            // Update the test with the (possibly edited) scorer prompt
            const testToRun: BehaviorTest = {
                ...pendingTest,
                scorerPrompt: editableScorerPrompt,
            };

            // Import the run function dynamically to avoid server/client issues
            const { runBehaviorExperiment } = await import('@/app/actions');

            // Run the experiment with the selected version's config
            const experiment = await runBehaviorExperiment(
                agentId,
                testToRun,
                testNodes,
                testState
            );

            console.log('Experiment completed:', experiment.summary);

            // Refresh experiments list from saved files
            await loadExperiments();

            // Re-fetch the completed experiment to ensure we have the final saved state
            const refreshedExperiments = await fetchBehaviorExperiments(agentId);
            const completedExp = refreshedExperiments.find(e => e.id === experiment.id);
            setSelectedExperiment(completedExp || experiment);

            // Clear the form and pending test
            setProblemDescription('');
            setPendingTest(null);
            setEditableScorerPrompt('');

        } catch (error) {
            console.error('Failed to run behavior test:', error);
            alert('Failed to run behavior test. Check console for details.');
        } finally {
            setIsRunning(false);
            setRunningProgress(null);
        }
    };

    // Cancel the pending test
    const handleCancelTest = () => {
        setPendingTest(null);
        setEditableScorerPrompt('');
    };

    const handleDeleteExperiment = async (experimentId: string) => {
        if (!confirm('Delete this experiment?')) return;

        try {
            await deleteBehaviorExperimentAction(agentId, experimentId);
            await loadExperiments();
            if (selectedExperiment?.id === experimentId) {
                setSelectedExperiment(null);
            }
        } catch (error) {
            console.error('Failed to delete experiment:', error);
        }
    };

    const toggleResultExpanded = (resultId: string) => {
        setExpandedResults(prev => {
            const next = new Set(prev);
            if (next.has(resultId)) {
                next.delete(resultId);
            } else {
                next.add(resultId);
            }
            return next;
        });
    };

    const getStatusColor = (passRate: number) => {
        if (passRate >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        if (passRate >= 50) return 'text-amber-600 bg-amber-50 border-amber-200';
        return 'text-red-600 bg-red-50 border-red-200';
    };

    const getStatusIcon = (passRate: number) => {
        if (passRate >= 80) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        if (passRate >= 50) return <AlertCircle className="h-4 w-4 text-amber-500" />;
        return <XCircle className="h-4 w-4 text-red-500" />;
    };

    const filteredResults = selectedExperiment?.results.filter(r => {
        if (filter === 'passed') return r.passed;
        if (filter === 'failed') return !r.passed;
        return true;
    }) || [];

    const formatDuration = (ms?: number) => {
        if (!ms) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[700px]">
            {/* Left: Create Test + History */}
            <div className="lg:col-span-4 flex flex-col gap-6">
                {/* Create New Test */}
                <Card className="shrink-0">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <FlaskConical className="h-5 w-5 text-indigo-500" />
                            New Behavior Test
                        </CardTitle>
                        <CardDescription>
                            Describe a behavior issue to test
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Step 1: Enter problem description */}
                        {!pendingTest && !isRunning && (
                            <>
                                <div className="space-y-2">
                                    <Textarea
                                        value={problemDescription}
                                        onChange={(e) => setProblemDescription(e.target.value)}
                                        placeholder="e.g., Agent should use 'Dr.' when addressing doctors, Agent should always mention refund policy when customer is upset..."
                                        className="min-h-[100px] resize-none text-sm"
                                        disabled={isGeneratingTest || isRefining}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleRefinePrompt}
                                        disabled={isGeneratingTest || isRefining || !problemDescription.trim()}
                                        className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                    >
                                        {isRefining ? (
                                            <>
                                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                                Refining...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="mr-1.5 h-3 w-3" />
                                                Refine with AI
                                            </>
                                        )}
                                    </Button>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Select
                                        value={simulationCount.toString()}
                                        onValueChange={(v) => setSimulationCount(Number(v))}
                                        disabled={isGeneratingTest}
                                    >
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="5">5 tests</SelectItem>
                                            <SelectItem value="10">10 tests</SelectItem>
                                            <SelectItem value="20">20 tests</SelectItem>
                                            <SelectItem value="50">50 tests</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Button
                                        onClick={handleGenerateTest}
                                        disabled={isGeneratingTest || !problemDescription.trim()}
                                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        {isGeneratingTest ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <FileText className="mr-2 h-4 w-4" />
                                                Generate Scorer
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </>
                        )}

                        {/* Step 2: Preview and approve scorer prompt */}
                        {pendingTest && !isRunning && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <span className="text-sm font-medium text-slate-700">Scorer Prompt Generated</span>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {pendingTest.name}
                                    </Badge>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">
                                        Review & Edit Scorer Prompt
                                    </label>
                                    <Textarea
                                        value={editableScorerPrompt}
                                        onChange={(e) => setEditableScorerPrompt(e.target.value)}
                                        className="min-h-[200px] font-mono text-xs bg-slate-50 resize-y"
                                    />
                                    <p className="text-[10px] text-slate-500">
                                        This prompt will be used to evaluate each conversation. Edit if needed.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={handleCancelTest}
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleRunTest}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        <Play className="mr-2 h-4 w-4" />
                                        Approve & Run ({simulationCount} tests)
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Progress indicator */}
                        {isRunning && (
                            <div className="space-y-3 pt-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 animate-pulse"
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Running {simulationCount} simulations in parallel...</span>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    This may take a few minutes. Check terminal for progress logs.
                                </p>
                            </div>
                        )}

                        {/* Prompt Set Version Selector */}
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-600">Test with Version</span>
                                <Badge variant="outline" className="text-[10px]">
                                    {versions.length} saved
                                </Badge>
                            </div>

                            {/* Select version to test with */}
                            <Select
                                value={selectedVersionId}
                                onValueChange={setSelectedVersionId}
                                disabled={isRunning}
                            >
                                <SelectTrigger className="text-xs h-9">
                                    <SelectValue placeholder="Select prompt version..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="current">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium">Current Config</span>
                                            <Badge variant="secondary" className="text-[9px] px-1 py-0">Live</Badge>
                                        </div>
                                    </SelectItem>
                                    {versions.map((v) => (
                                        <SelectItem key={v.id} value={v.id}>
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-xs">{v.name}</span>
                                                <span className="text-[10px] text-slate-400 ml-2">
                                                    {new Date(v.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {selectedVersionId !== 'current' && (
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-slate-500">
                                        Tests will use this version's config
                                    </p>
                                    <div className="flex gap-1">
                                        {onApplySnapshot && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[10px] text-indigo-600 hover:text-indigo-700"
                                                onClick={() => handleApplyVersion(selectedVersionId)}
                                            >
                                                <Wand2 className="h-3 w-3 mr-1" />
                                                Apply to Editor
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-[10px] text-red-500 hover:text-red-600"
                                            onClick={() => handleDeleteVersion(selectedVersionId)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Quick save current config */}
                            {versions.length === 0 && (
                                <div className="text-[10px] text-slate-400 text-center py-2">
                                    No saved versions. Save your first version after running a test.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Experiment History */}
                <Card className="flex-1 flex flex-col min-h-0">
                    <CardHeader className="pb-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Experiment History</CardTitle>
                            {experiments.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-slate-400 hover:text-red-500"
                                    onClick={async () => {
                                        if (confirm('Clear all experiments?')) {
                                            await clearBehaviorExperiments(agentId);
                                            await loadExperiments();
                                            setSelectedExperiment(null);
                                        }
                                    }}
                                >
                                    Clear All
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 p-0">
                        <ScrollArea className="h-full px-6 pb-6">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : experiments.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No experiments yet</p>
                                    <p className="text-xs mt-1">Create a test above to get started</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {experiments.map((exp) => (
                                        <div
                                            key={exp.id}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                                selectedExperiment?.id === exp.id
                                                    ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                                                    : 'bg-white hover:bg-slate-50 border-slate-200'
                                            }`}
                                            onClick={() => setSelectedExperiment(exp)}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {getStatusIcon(exp.summary.passRate)}
                                                    <span className="font-medium text-sm truncate">
                                                        {exp.test.name}
                                                    </span>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={`shrink-0 text-xs ${getStatusColor(exp.summary.passRate)}`}
                                                >
                                                    {exp.summary.passRate}%
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                                                {exp.test.problemDescription}
                                            </p>
                                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                                <span>{exp.summary.passed}/{exp.summary.total} passed</span>
                                                <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Right: Results View */}
            <Card className="lg:col-span-8 flex flex-col">
                {selectedExperiment ? (
                    <>
                        <CardHeader className="shrink-0 pb-4">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="flex items-center gap-2">
                                        {selectedExperiment.test.name}
                                        {selectedExperiment.status === 'running' && (
                                            <Badge variant="outline" className="bg-indigo-50 text-indigo-600 animate-pulse">
                                                Running
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription className="max-w-xl">
                                        {selectedExperiment.test.problemDescription}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedExperiment.braintrustUrl && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs"
                                            onClick={() => window.open(selectedExperiment.braintrustUrl, '_blank')}
                                        >
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            Braintrust
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-slate-400 hover:text-red-500"
                                        onClick={() => handleDeleteExperiment(selectedExperiment.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Summary Stats */}
                            <div className="grid grid-cols-4 gap-4 mt-4">
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-slate-800">
                                        {selectedExperiment.summary.passed}/{selectedExperiment.summary.total}
                                    </div>
                                    <div className="text-xs text-slate-500">Passed</div>
                                </div>
                                <div className={`rounded-lg p-3 text-center ${getStatusColor(selectedExperiment.summary.passRate)}`}>
                                    <div className="text-2xl font-bold">
                                        {selectedExperiment.summary.passRate}%
                                    </div>
                                    <div className="text-xs opacity-80">Pass Rate</div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-slate-800">
                                        {selectedExperiment.summary.avgScore.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-slate-500">Avg Score</div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-slate-800">
                                        {selectedExperiment.status === 'completed'
                                            ? formatDuration(selectedExperiment.summary.duration)
                                            : 'Running...'}
                                    </div>
                                    <div className="text-xs text-slate-500">Duration</div>
                                </div>
                            </div>

                            {/* AI Summary - Always show when completed */}
                            {selectedExperiment.status === 'completed' && selectedExperiment.summary.aiSummary && (
                                <div className={`mt-4 p-4 rounded-lg border ${
                                    selectedExperiment.summary.passRate === 100
                                        ? 'bg-emerald-50 border-emerald-200'
                                        : selectedExperiment.summary.passRate >= 50
                                        ? 'bg-amber-50 border-amber-200'
                                        : 'bg-red-50 border-red-200'
                                }`}>
                                    <div className="flex items-start gap-3">
                                        <Sparkles className={`h-5 w-5 shrink-0 mt-0.5 ${
                                            selectedExperiment.summary.passRate === 100
                                                ? 'text-emerald-600'
                                                : selectedExperiment.summary.passRate >= 50
                                                ? 'text-amber-600'
                                                : 'text-red-600'
                                        }`} />
                                        <div className="flex-1 space-y-2">
                                            <h4 className={`font-medium text-sm ${
                                                selectedExperiment.summary.passRate === 100
                                                    ? 'text-emerald-800'
                                                    : selectedExperiment.summary.passRate >= 50
                                                    ? 'text-amber-800'
                                                    : 'text-red-800'
                                            }`}>
                                                AI Analysis
                                            </h4>
                                            <p className={`text-sm ${
                                                selectedExperiment.summary.passRate === 100
                                                    ? 'text-emerald-700'
                                                    : selectedExperiment.summary.passRate >= 50
                                                    ? 'text-amber-700'
                                                    : 'text-red-700'
                                            }`}>
                                                {selectedExperiment.summary.aiSummary}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Recommendations - Show when there are any */}
                            {selectedExperiment.status === 'completed' &&
                             selectedExperiment.summary.recommendations &&
                             selectedExperiment.summary.recommendations.length > 0 && (
                                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <Lightbulb className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-medium text-indigo-800 text-sm">
                                                    Recommendations
                                                </h4>
                                                {selectedExperiment.summary.failed > 0 && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-xs bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200"
                                                        onClick={() => setFilter('failed')}
                                                    >
                                                        View Failed Tests
                                                    </Button>
                                                )}
                                            </div>
                                            <ul className="text-sm text-indigo-700 space-y-1.5">
                                                {selectedExperiment.summary.recommendations.map((rec, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <span className="text-indigo-400 mt-0.5">•</span>
                                                        <span>{rec}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Scorer Prompt - Collapsible */}
                            <Collapsible open={showScorerPrompt} onOpenChange={setShowScorerPrompt} className="mt-4">
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="w-full justify-between text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            <span className="text-xs">Evaluation Criteria (Scorer Prompt)</span>
                                        </div>
                                        {showScorerPrompt ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">
                                            {selectedExperiment.test.scorerPrompt}
                                        </pre>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </CardHeader>

                        <Separator />

                        {/* Filter Tabs */}
                        <div className="px-6 py-3 flex items-center gap-2 shrink-0">
                            <span className="text-sm text-slate-500 mr-2">Filter:</span>
                            {(['all', 'passed', 'failed'] as const).map((f) => (
                                <Button
                                    key={f}
                                    variant={filter === f ? 'default' : 'outline'}
                                    size="sm"
                                    className={`text-xs ${filter === f ? 'bg-slate-800' : ''}`}
                                    onClick={() => setFilter(f)}
                                >
                                    {f === 'all' ? 'All' : f === 'passed' ? 'Passed' : 'Failed'}
                                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                                        {f === 'all'
                                            ? selectedExperiment.results.length
                                            : f === 'passed'
                                            ? selectedExperiment.summary.passed
                                            : selectedExperiment.summary.failed}
                                    </Badge>
                                </Button>
                            ))}
                        </div>

                        <Separator />

                        {/* Results List */}
                        <CardContent className="flex-1 min-h-0 p-0">
                            <ScrollArea className="h-full">
                                <div className="p-6 space-y-3">
                                    {filteredResults.map((result) => (
                                        <ResultCard
                                            key={result.id}
                                            result={result}
                                            isExpanded={expandedResults.has(result.id)}
                                            onToggle={() => toggleResultExpanded(result.id)}
                                        />
                                    ))}
                                    {filteredResults.length === 0 && (
                                        <div className="text-center py-8 text-slate-400">
                                            <p className="text-sm">No {filter !== 'all' ? filter : ''} results</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                        <p className="text-sm">Select an experiment to view results</p>
                        <p className="text-xs mt-1">or create a new behavior test</p>
                    </div>
                )}
            </Card>
        </div>
    );
}

// Result Card Component
function ResultCard({
    result,
    isExpanded,
    onToggle
}: {
    result: BehaviorTestResult;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    return (
        <div className={`border rounded-lg overflow-hidden transition-all ${
            result.passed ? 'border-emerald-200' : 'border-red-200'
        }`}>
            {/* Header */}
            <div
                className={`p-4 cursor-pointer ${
                    result.passed ? 'bg-emerald-50/50' : 'bg-red-50/50'
                }`}
                onClick={onToggle}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {result.passed ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                            <div className="font-medium text-sm">{result.persona.name}</div>
                            <div className="text-xs text-slate-500">{result.persona.role}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge
                            variant="outline"
                            className={result.passed
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-red-100 text-red-700 border-red-200'
                            }
                        >
                            Score: {result.score.toFixed(2)}
                        </Badge>
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                    </div>
                </div>

                {/* Rationale preview */}
                {!isExpanded && (
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2 pl-8">
                        {result.rationale}
                    </p>
                )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t bg-white">
                    {/* Rationale */}
                    <div className="p-4 bg-slate-50 border-b">
                        <div className="text-xs font-medium text-slate-500 mb-1">Judge's Rationale</div>
                        <p className="text-sm text-slate-700">{result.rationale}</p>
                    </div>

                    {/* Conversation */}
                    <div className="p-4">
                        <div className="text-xs font-medium text-slate-500 mb-3">Conversation</div>
                        <div className="space-y-3">
                            {result.conversation.map((turn, i) => (
                                <div
                                    key={i}
                                    className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[85%] rounded-lg p-3 ${
                                        turn.role === 'user'
                                            ? 'bg-indigo-50 border border-indigo-100'
                                            : 'bg-slate-100 border border-slate-200'
                                    }`}>
                                        <div className="text-[10px] font-medium text-slate-500 mb-1">
                                            {turn.role === 'user' ? 'Lead' : 'Agent'}
                                        </div>
                                        <p className="text-sm text-slate-800 whitespace-pre-wrap">
                                            {turn.content}
                                        </p>
                                        {turn.traceData && <TracePanel reasoning={turn.traceData} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
