'use client';

interface UnifiedDiffProps {
    original: string;
    modified: string;
    className?: string;
}

export function UnifiedDiff({ original, modified, className = '' }: UnifiedDiffProps) {
    return (
        <div className={`rounded-lg border overflow-hidden ${className}`}>
            <div className="grid grid-cols-2 divide-x">
                {/* Original */}
                <div>
                    <div className="bg-red-100 px-3 py-2 border-b font-medium text-red-800 text-sm">
                        Original
                    </div>
                    <div className="p-3 bg-red-50/50 max-h-[75vh] overflow-y-auto">
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                            {original || '(empty)'}
                        </pre>
                    </div>
                </div>

                {/* Refined */}
                <div>
                    <div className="bg-emerald-100 px-3 py-2 border-b font-medium text-emerald-800 text-sm">
                        Refined
                    </div>
                    <div className="p-3 bg-emerald-50/50 max-h-[75vh] overflow-y-auto">
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                            {modified}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
