'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Activity, Database, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TracePanelProps {
    reasoning: any[];
}

export function TracePanel({ reasoning }: TracePanelProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (!reasoning || reasoning.length === 0) return null;

    return (
        <div className="mt-2 border-t border-slate-100 pt-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center text-xs text-slate-500 hover:text-indigo-600 transition-colors"
            >
                {isOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                <Activity className="h-3 w-3 mr-1" />
                Debug Info ({reasoning.length} steps)
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 space-y-3 pl-2 border-l-2 border-indigo-100">
                            {reasoning.map((step, index) => (
                                <div key={index} className="text-xs space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-slate-700 flex items-center">
                                            <Badge variant="outline" className="mr-2 text-[10px] h-5 px-1">{step.nodeName || 'Node'}</Badge>
                                            {step.agentName}
                                        </span>
                                        <span className="text-slate-400 font-mono text-[10px]">{step.nodeId}</span>
                                    </div>

                                    {/* Messages */}
                                    {step.messages && step.messages.length > 0 && (
                                        <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                            <p className="text-slate-500 font-medium mb-1">Output:</p>
                                            <p className="text-slate-700 whitespace-pre-wrap">{step.messages[0]}</p>
                                        </div>
                                    )}

                                    {/* Tools */}
                                    {Array.isArray(step.usedTools) && step.usedTools.length > 0 && (
                                        <div className="space-y-2">
                                            {step.usedTools.filter((tool: any) => tool != null).map((tool: any, tIndex: number) => {
                                                let inputDisplay = tool.toolInput;
                                                let outputDisplay = tool.toolOutput;

                                                try {
                                                    if (typeof tool.toolInput === 'string') {
                                                        const parsed = JSON.parse(tool.toolInput);
                                                        inputDisplay = JSON.stringify(parsed, null, 2);
                                                    } else {
                                                        inputDisplay = JSON.stringify(tool.toolInput, null, 2);
                                                    }
                                                } catch (e) { /* keep as string */ }

                                                try {
                                                    if (typeof tool.toolOutput === 'string') {
                                                        const parsed = JSON.parse(tool.toolOutput);
                                                        outputDisplay = JSON.stringify(parsed, null, 2);
                                                    } else {
                                                        outputDisplay = JSON.stringify(tool.toolOutput, null, 2);
                                                    }
                                                } catch (e) { /* keep as string */ }

                                                return (
                                                    <div key={tIndex} className="bg-amber-50 p-2 rounded border border-amber-100">
                                                        <div className="flex items-center text-amber-700 mb-1">
                                                            <Terminal className="h-3 w-3 mr-1" />
                                                            <span className="font-medium">Tool: {tool.tool}</span>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            <div>
                                                                <span className="text-amber-600 font-medium">Input:</span>
                                                                <pre className="text-[10px] bg-white p-1 rounded border border-amber-100 overflow-x-auto whitespace-pre-wrap">
                                                                    {inputDisplay}
                                                                </pre>
                                                            </div>
                                                            <div>
                                                                <span className="text-amber-600 font-medium">Output:</span>
                                                                <pre className="text-[10px] bg-white p-1 rounded border border-amber-100 overflow-x-auto whitespace-pre-wrap">
                                                                    {outputDisplay}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* State */}
                                    {step.state && Object.keys(step.state).length > 0 && (
                                        <div className="bg-blue-50 p-2 rounded border border-blue-100">
                                            <div className="flex items-center text-blue-700 mb-1">
                                                <Database className="h-3 w-3 mr-1" />
                                                <span className="font-medium">State Update</span>
                                            </div>
                                            <pre className="text-[10px] bg-white p-1 rounded border border-blue-100 overflow-x-auto">
                                                {JSON.stringify(step.state, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
