'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Loader2,
    RefreshCw,
    Play,
    Users,
    Heart,
    Target,
    Check,
    Plus,
    Pencil,
    Trash2,
    X
} from 'lucide-react';
import {
    Persona,
    EmotionDimension,
    Intent,
    SimulationConfig,
    GeneratedSimulationOptions
} from '@/types/simulation';

interface SimulationConfigPanelProps {
    options: GeneratedSimulationOptions | null;
    isGenerating: boolean;
    isRunning: boolean;
    onGenerate: () => Promise<void>;
    onRunSimulations: (config: SimulationConfig) => Promise<void>;
    onOptionsUpdate?: (options: GeneratedSimulationOptions) => void;
}

type EditMode =
    | { type: 'persona'; item?: Persona }
    | { type: 'emotion'; item?: EmotionDimension }
    | { type: 'intent'; item?: Intent }
    | null;

export function SimulationConfigPanel({
    options,
    isGenerating,
    isRunning,
    onGenerate,
    onRunSimulations,
    onOptionsUpdate,
}: SimulationConfigPanelProps) {
    const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set());
    const [selectedEmotions, setSelectedEmotions] = useState<Set<string>>(new Set());
    const [selectedIntents, setSelectedIntents] = useState<Set<string>>(new Set());
    const [simulationCount, setSimulationCount] = useState(5);
    const [editMode, setEditMode] = useState<EditMode>(null);

    // Form state for editing
    const [formData, setFormData] = useState<any>({});

    // Select all helper
    const selectAll = (
        items: { id: string }[],
        setter: React.Dispatch<React.SetStateAction<Set<string>>>
    ) => {
        setter(new Set(items.map(i => i.id)));
    };

    // Clear all helper
    const clearAll = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
        setter(new Set());
    };

    // Toggle item helper
    const toggleItem = (
        id: string,
        selected: Set<string>,
        setter: React.Dispatch<React.SetStateAction<Set<string>>>
    ) => {
        const newSet = new Set(selected);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setter(newSet);
    };

    const handleRunSimulations = async () => {
        if (!options) return;

        const config: SimulationConfig = {
            selectedPersonas: options.personas.filter(p => selectedPersonas.has(p.id)),
            selectedEmotions: options.emotions.filter(e => selectedEmotions.has(e.id)),
            selectedIntents: options.intents.filter(i => selectedIntents.has(i.id)),
            simulationCount,
        };

        await onRunSimulations(config);
    };

    // Auto-select all when options are generated
    const handleGenerate = async () => {
        await onGenerate();
    };

    // When options change, select all by default
    if (options && selectedPersonas.size === 0 && selectedEmotions.size === 0 && selectedIntents.size === 0) {
        selectAll(options.personas, setSelectedPersonas);
        selectAll(options.emotions, setSelectedEmotions);
        selectAll(options.intents, setSelectedIntents);
    }

    // Open add/edit modal
    const openEditModal = (type: 'persona' | 'emotion' | 'intent', item?: any) => {
        setEditMode({ type, item });
        if (item) {
            setFormData({ ...item });
        } else {
            // Default values for new items
            if (type === 'persona') {
                setFormData({ name: '', role: '', goal: '', context: '', tone: '' });
            } else if (type === 'emotion') {
                setFormData({ name: '', description: '' });
            } else if (type === 'intent') {
                setFormData({ name: '', flowType: 'NEW_SALES_LEAD', description: '', goal: '', initialMessage: '' });
            }
        }
    };

    const closeEditModal = () => {
        setEditMode(null);
        setFormData({});
    };

    // Save item (add or update)
    const handleSaveItem = () => {
        if (!options || !editMode || !onOptionsUpdate) return;

        const isNew = !editMode.item;
        const newId = isNew ? `${editMode.type}-${Date.now()}` : editMode.item!.id;

        let updatedOptions = { ...options };

        if (editMode.type === 'persona') {
            const persona: Persona = { ...formData, id: newId };
            if (isNew) {
                updatedOptions.personas = [...options.personas, persona];
                setSelectedPersonas(prev => new Set([...prev, newId]));
            } else {
                updatedOptions.personas = options.personas.map(p => p.id === newId ? persona : p);
            }
        } else if (editMode.type === 'emotion') {
            const emotion: EmotionDimension = { ...formData, id: newId };
            if (isNew) {
                updatedOptions.emotions = [...options.emotions, emotion];
                setSelectedEmotions(prev => new Set([...prev, newId]));
            } else {
                updatedOptions.emotions = options.emotions.map(e => e.id === newId ? emotion : e);
            }
        } else if (editMode.type === 'intent') {
            const intent: Intent = { ...formData, id: newId };
            if (isNew) {
                updatedOptions.intents = [...options.intents, intent];
                setSelectedIntents(prev => new Set([...prev, newId]));
            } else {
                updatedOptions.intents = options.intents.map(i => i.id === newId ? intent : i);
            }
        }

        onOptionsUpdate(updatedOptions);
        closeEditModal();
    };

    // Delete item
    const handleDeleteItem = (type: 'persona' | 'emotion' | 'intent', id: string) => {
        if (!options || !onOptionsUpdate) return;

        let updatedOptions = { ...options };

        if (type === 'persona') {
            updatedOptions.personas = options.personas.filter(p => p.id !== id);
            setSelectedPersonas(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } else if (type === 'emotion') {
            updatedOptions.emotions = options.emotions.filter(e => e.id !== id);
            setSelectedEmotions(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } else if (type === 'intent') {
            updatedOptions.intents = options.intents.filter(i => i.id !== id);
            setSelectedIntents(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        }

        onOptionsUpdate(updatedOptions);
    };

    const canRun = options &&
        selectedPersonas.size > 0 &&
        selectedEmotions.size > 0 &&
        selectedIntents.size > 0 &&
        !isRunning;

    if (!options) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Target className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-base font-medium text-foreground mb-2">
                    Generate Simulation Options
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm text-center mb-6">
                    Generate personas, emotions, and intents from your onboarding guide.
                </p>
                <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Generate Options
                        </>
                    )}
                </Button>
            </div>
        );
    }

    const SelectionCard = ({
        icon: Icon,
        title,
        type,
        items,
        selected,
        setSelected,
        renderItem,
    }: {
        icon: typeof Users;
        title: string;
        type: 'persona' | 'emotion' | 'intent';
        items: { id: string }[];
        selected: Set<string>;
        setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
        renderItem: (item: any, isSelected: boolean) => React.ReactNode;
    }) => (
        <div className="flex flex-col border border-border rounded-lg bg-card overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-foreground">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                            {selected.size}/{items.length}
                        </Badge>
                        <button
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                            onClick={() => openEditModal(type)}
                            title={`Add ${type}`}
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button
                        className="px-2 py-1 text-xs rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={() => selectAll(items, setSelected)}
                    >
                        All
                    </button>
                    <button
                        className="px-2 py-1 text-xs rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={() => clearAll(setSelected)}
                    >
                        None
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[280px]">
                {items.map((item: any) => {
                    const isSelected = selected.has(item.id);
                    return (
                        <div
                            key={item.id}
                            className={`group p-2.5 rounded-lg cursor-pointer transition-all border ${
                                isSelected
                                    ? 'bg-primary/5 border-primary/30'
                                    : 'border-transparent hover:bg-muted/50'
                            }`}
                            onClick={() => toggleItem(item.id, selected, setSelected)}
                        >
                            <div className="flex items-start gap-2.5">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                    isSelected
                                        ? 'bg-primary border-primary text-primary-foreground'
                                        : 'border-border'
                                }`}>
                                    {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    {renderItem(item, isSelected)}
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openEditModal(type, item);
                                        }}
                                        title="Edit"
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                        className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteItem(type, item.id);
                                        }}
                                        title="Delete"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
            <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Personas */}
                    <SelectionCard
                        icon={Users}
                        title="Personas"
                        type="persona"
                        items={options.personas}
                        selected={selectedPersonas}
                        setSelected={setSelectedPersonas}
                        renderItem={(persona: Persona) => (
                            <>
                                <p className="text-sm font-medium text-foreground truncate">{persona.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{persona.role}</p>
                            </>
                        )}
                    />

                    {/* Emotions */}
                    <SelectionCard
                        icon={Heart}
                        title="Emotions"
                        type="emotion"
                        items={options.emotions}
                        selected={selectedEmotions}
                        setSelected={setSelectedEmotions}
                        renderItem={(emotion: EmotionDimension) => (
                            <>
                                <p className="text-sm font-medium text-foreground">{emotion.name}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{emotion.description}</p>
                            </>
                        )}
                    />

                    {/* Intents */}
                    <SelectionCard
                        icon={Target}
                        title="Intents"
                        type="intent"
                        items={options.intents}
                        selected={selectedIntents}
                        setSelected={setSelectedIntents}
                        renderItem={(intent: Intent) => (
                            <>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-foreground">{intent.name}</p>
                                    <Badge
                                        variant="outline"
                                        className={`text-[9px] px-1.5 py-0 ${
                                            intent.flowType === 'NEW_SALES_LEAD'
                                                ? 'bg-primary/10 text-primary border-primary/20'
                                                : intent.flowType === 'EXISTING_CUSTOMER'
                                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                : 'bg-muted text-muted-foreground border-border'
                                        }`}
                                    >
                                        {intent.flowType === 'NEW_SALES_LEAD' ? 'New Lead' :
                                         intent.flowType === 'EXISTING_CUSTOMER' ? 'Existing' : 'Other'}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{intent.description}</p>
                            </>
                        )}
                    />
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Simulations:</span>
                            <select
                                value={simulationCount}
                                onChange={(e) => setSimulationCount(Number(e.target.value))}
                                className="text-sm border border-border rounded-md px-2 py-1 bg-card text-foreground"
                                disabled={isRunning}
                            >
                                <option value={3}>3</option>
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={30}>30</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGenerate}
                            disabled={isGenerating || isRunning}
                            className="border-border text-foreground hover:bg-muted"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isGenerating ? 'animate-spin' : ''}`} />
                            Regenerate
                        </Button>
                    </div>
                    <Button
                        onClick={handleRunSimulations}
                        disabled={!canRun}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {isRunning ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Running...
                            </>
                        ) : (
                            <>
                                <Play className="mr-2 h-4 w-4" />
                                Run {simulationCount} Simulations
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Edit/Add Modal */}
            <Dialog open={editMode !== null} onOpenChange={(open) => !open && closeEditModal()}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>
                            {editMode?.item ? 'Edit' : 'Add'} {editMode?.type === 'persona' ? 'Persona' : editMode?.type === 'emotion' ? 'Emotion' : 'Intent'}
                        </DialogTitle>
                    </DialogHeader>

                    {editMode?.type === 'persona' && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Name</label>
                                <Input
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Sarah Johnson"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Role</label>
                                <Input
                                    value={formData.role || ''}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    placeholder="e.g., Small business owner"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Goal</label>
                                <Textarea
                                    value={formData.goal || ''}
                                    onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                                    placeholder="What they want to achieve..."
                                    className="min-h-[60px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Context</label>
                                <Textarea
                                    value={formData.context || ''}
                                    onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                                    placeholder="Background and situation..."
                                    className="min-h-[60px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Tone</label>
                                <Input
                                    value={formData.tone || ''}
                                    onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                                    placeholder="e.g., friendly, impatient, skeptical"
                                />
                            </div>
                        </div>
                    )}

                    {editMode?.type === 'emotion' && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Name</label>
                                <Input
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Frustrated"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Description</label>
                                <Textarea
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="How this emotion manifests in conversation..."
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>
                    )}

                    {editMode?.type === 'intent' && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Name</label>
                                <Input
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Billing Inquiry"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Flow Type</label>
                                <select
                                    value={formData.flowType || 'NEW_SALES_LEAD'}
                                    onChange={(e) => setFormData({ ...formData, flowType: e.target.value })}
                                    className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card text-foreground"
                                >
                                    <option value="NEW_SALES_LEAD">New Sales Lead</option>
                                    <option value="EXISTING_CUSTOMER">Existing Customer</option>
                                    <option value="UNDETERMINED">Undetermined</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Description</label>
                                <Textarea
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="What this intent represents..."
                                    className="min-h-[60px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Goal</label>
                                <Textarea
                                    value={formData.goal || ''}
                                    onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                                    placeholder="What the customer wants to accomplish..."
                                    className="min-h-[60px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Initial Message</label>
                                <Textarea
                                    value={formData.initialMessage || ''}
                                    onChange={(e) => setFormData({ ...formData, initialMessage: e.target.value })}
                                    placeholder="Example first message from customer..."
                                    className="min-h-[60px]"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={closeEditModal}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveItem} className="bg-primary text-primary-foreground">
                            {editMode?.item ? 'Save Changes' : 'Add'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
