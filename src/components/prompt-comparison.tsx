'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

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
            <div className="flex flex-col border rounded-lg overflow-hidden bg-slate-50">
                <div className="p-3 bg-slate-100 border-b flex justify-between items-center">
                    <span className="font-medium text-slate-700">{originalLabel}</span>
                    <Badge variant="secondary">v1</Badge>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-slate-600">{original}</pre>
                </ScrollArea>
            </div>

            <div className="flex flex-col border rounded-lg overflow-hidden bg-indigo-50/30 border-indigo-100">
                <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                    <span className="font-medium text-indigo-900">{modifiedLabel}</span>
                    <Badge className="bg-indigo-600 hover:bg-indigo-700">v2</Badge>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-indigo-900">{modified}</pre>
                </ScrollArea>
            </div>
        </div>
    );
}
