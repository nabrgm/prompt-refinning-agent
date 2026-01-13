'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface PromptComparisonProps {
    original: string;
    modified: string;
    originalLabel?: string;
    modifiedLabel?: string;
}

export function PromptComparison({
    original,
    modified,
    originalLabel = 'Original',
    modifiedLabel = 'Modified'
}: PromptComparisonProps) {
    return (
        <div className="grid grid-cols-2 gap-4 h-[500px]">
            <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-muted/30">
                <div className="p-3 bg-muted/50 border-b border-border flex justify-between items-center">
                    <span className="font-medium text-muted-foreground">{originalLabel}</span>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">v1</Badge>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-foreground">{original}</pre>
                </ScrollArea>
            </div>

            <div className="flex flex-col border border-primary/30 rounded-lg overflow-hidden bg-primary/5">
                <div className="p-3 bg-primary/10 border-b border-primary/20 flex justify-between items-center">
                    <span className="font-medium text-foreground">{modifiedLabel}</span>
                    <Badge className="bg-primary text-primary-foreground">v2</Badge>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-foreground">{modified}</pre>
                </ScrollArea>
            </div>
        </div>
    );
}
