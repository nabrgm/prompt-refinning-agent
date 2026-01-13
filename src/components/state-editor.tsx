'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, RefreshCw, Settings2 } from 'lucide-react';
import { StateMemory, StateField, OverridableNode } from '@/types/polaris';
import { updateStateField } from '@/app/actions';
import { PromptOptimizer } from '@/components/prompt-optimizer';

interface StateEditorProps {
    agentId: string;
    stateMemory: StateMemory;
    onStateChange: (key: string, value: string) => void;
    currentOverrides?: Record<string, string>;
    allNodes?: OverridableNode[];
}

// Fields to hide from editing (system/internal fields - typically set during conversation)
const HIDDEN_FIELDS = [
    'firstName', 'lastName', 'customerType',
    'preferredApptTime', 'preferredApptDate', 'preferredApptTimezone',
    'intent', 'search_needed', 'recommendations',
    'patientName', 'patientDOB', 'patientPhone', 'patientEmail',
    'appointmentType', 'appointmentDate', 'appointmentTime',
    'selectedProvider', 'selectedLocation', 'insuranceProvider',
    'callbackRequested', 'callbackTime', 'conversationSummary'
];

// Helper to determine if a field should use large textarea (for rules, prompts, descriptions)
function isLargeTextField(key: string): boolean {
    const largeFieldPatterns = [
        'rules', 'base', 'description', 'qa_pairs', 'prompt',
        'guidelines', 'instructions', 'system', 'voice'
    ];
    const lowerKey = key.toLowerCase();
    return largeFieldPatterns.some(pattern => lowerKey.includes(pattern));
}

export function StateEditor({ agentId, stateMemory, onStateChange, currentOverrides, allNodes }: StateEditorProps) {
    const [localValues, setLocalValues] = useState<Record<string, string>>(() => {
        // Initialize from stateMemory on first render
        const values: Record<string, string> = {};
        stateMemory.fields.forEach(f => {
            values[f.key] = currentOverrides?.[f.key] ?? f.defaultValue ?? '';
        });
        return values;
    });
    const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});

    // Re-initialize when stateMemory or currentOverrides change
    // This ensures StateEditor updates when master version loads
    useEffect(() => {
        const values: Record<string, string> = {};
        stateMemory.fields.forEach(f => {
            values[f.key] = currentOverrides?.[f.key] ?? f.defaultValue ?? '';
        });
        setLocalValues(values);
    }, [stateMemory, currentOverrides]);

    // Get the "saved" value for comparison (what's currently persisted)
    const getSavedValue = (key: string) => {
        return currentOverrides?.[key] ?? stateMemory.fields.find(f => f.key === key)?.defaultValue ?? '';
    };

    const handleSave = async (key: string) => {
        setIsSaving(prev => ({ ...prev, [key]: true }));
        try {
            console.log('Saving field:', key, 'value:', localValues[key]);
            await updateStateField(agentId, key, localValues[key]);
            onStateChange(key, localValues[key]);
            console.log('Save successful for:', key);
        } catch (error) {
            console.error('Failed to save state field:', error);
        } finally {
            setIsSaving(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleChange = (key: string, value: string) => {
        setLocalValues(prev => ({ ...prev, [key]: value }));
    };

    // Show all fields except hidden ones - no more hardcoded list
    const editableFields = stateMemory.fields.filter(f => !HIDDEN_FIELDS.includes(f.key));

    const renderField = (field: StateField, isLarge: boolean = false) => {
        const savedValue = getSavedValue(field.key);
        const isDirty = localValues[field.key] !== savedValue;
        const saving = isSaving[field.key];

        return (
            <div key={field.key} className="space-y-2 p-4 bg-muted/10 rounded-lg border border-border">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Label className="text-foreground font-medium">{formatFieldName(field.key)}</Label>
                        {isDirty && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/20">Modified</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                        {isLarge && (
                            <PromptOptimizer
                                currentPrompt={localValues[field.key] || ''}
                                type="system"
                                nodeLabel={formatFieldName(field.key)}
                                onRefined={(newValue) => handleChange(field.key, newValue)}
                                allNodes={allNodes}
                                stateFields={localValues}
                            />
                        )}
                        <Button
                            onClick={() => handleSave(field.key)}
                            disabled={saving || !isDirty}
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {saving ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                            Save
                        </Button>
                    </div>
                </div>
                {isLarge ? (
                    <Textarea
                        value={localValues[field.key] || ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        className="min-h-[200px] font-mono text-sm bg-muted/30 border-border focus:ring-primary/20"
                        placeholder={`Enter ${formatFieldName(field.key)}...`}
                    />
                ) : (
                    <Input
                        value={localValues[field.key] || ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        className="bg-muted/30 border-border focus:ring-primary/20"
                        placeholder={`Enter ${formatFieldName(field.key)}...`}
                    />
                )}
            </div>
        );
    };

    return (
        <Card className="w-full bg-card border-border shadow-none">
            <CardHeader className="pb-3 border-b border-border mb-4">
                <div className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg font-serif font-normal text-foreground">
                        Agent State Configuration
                    </CardTitle>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        {stateMemory.fields.length} fields
                    </Badge>
                </div>
                <CardDescription className="text-muted-foreground">
                    Configure agent behavior rules, brand settings, and system guidelines
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* All editable fields - dynamically determined */}
                {editableFields.map(field => {
                    // Use pattern matching to determine if field needs large textarea
                    const isLarge = isLargeTextField(field.key);
                    return renderField(field, isLarge);
                })}
            </CardContent>
        </Card>
    );
}

function formatFieldName(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
