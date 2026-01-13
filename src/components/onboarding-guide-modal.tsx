'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Save, BookOpen, FileText } from 'lucide-react';

interface OnboardingGuideModalProps {
    agentId: string;
    isOpen: boolean;
    onClose: () => void;
    initialGuide: string | null;
    onSave: (guideText: string) => Promise<void>;
}

export function OnboardingGuideModal({
    agentId,
    isOpen,
    onClose,
    initialGuide,
    onSave,
}: OnboardingGuideModalProps) {
    const [guideText, setGuideText] = useState(initialGuide || '');
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Update guide text when modal opens with new initial data
    useEffect(() => {
        if (isOpen) {
            setGuideText(initialGuide || '');
            setHasChanges(false);
        }
    }, [isOpen, initialGuide]);

    const handleTextChange = (value: string) => {
        setGuideText(value);
        setHasChanges(value !== (initialGuide || ''));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(guideText);
            setHasChanges(false);
            onClose();
        } catch (error) {
            console.error('Failed to save onboarding guide:', error);
            alert('Failed to save onboarding guide. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (hasChanges) {
            if (!window.confirm('You have unsaved changes. Are you sure you want to close?')) {
                return;
            }
        }
        onClose();
    };

    const characterCount = guideText.length;
    const wordCount = guideText.trim() ? guideText.trim().split(/\s+/).length : 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        Onboarding Guide
                    </DialogTitle>
                    <DialogDescription>
                        Paste your onboarding guide or training document here. This will be used to generate
                        realistic personas, emotions, and intents for simulation testing.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex flex-col gap-4 min-h-0">
                    {/* Text area */}
                    <div className="flex-1 min-h-0">
                        <Textarea
                            value={guideText}
                            onChange={(e) => handleTextChange(e.target.value)}
                            placeholder={`Example content to include:

1. Company/Brand Overview
- Company name and what you do
- Main products or services offered

2. Customer Types
- New prospects looking for information
- Existing customers with support needs
- Different customer personas and their concerns

3. Common Scenarios
- Sales inquiries and scheduling
- Billing questions
- Technical support issues
- Service upgrades or changes

4. Agent Guidelines
- How the agent should respond
- What information to collect
- When to transfer to human support

5. Business Hours & Policies
- Operating hours
- Refund policies
- Service guarantees`}
                            className="h-full resize-none font-mono text-sm"
                        />
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-4">
                            <span>{characterCount.toLocaleString()} characters</span>
                            <span>{wordCount.toLocaleString()} words</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasChanges && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                    Unsaved changes
                                </Badge>
                            )}
                            {initialGuide && !hasChanges && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    <FileText className="h-3 w-3 mr-1" />
                                    Guide saved
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between border-t pt-4">
                    <Button variant="outline" onClick={handleClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || !guideText.trim()}>
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Guide
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
