'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { sendChat } from '@/app/actions';
import { TracePanel } from '@/components/trace-panel';
import { OverridableNode } from '@/types/polaris';
import { ChatMessage } from '@/lib/api';
import { GlobalOptimizer } from '@/components/global-optimizer';
import { SplitSquareHorizontal, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { fetchPromptVersions } from '@/app/actions';
import { PromptSetVersion } from '@/types/polaris';

interface ChatInterfaceProps {
    agentId: string;
    nodes: OverridableNode[];
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    chatId: string | undefined;
    setChatId: React.Dispatch<React.SetStateAction<string | undefined>>;
    messagesRight: ChatMessage[];
    setMessagesRight: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    chatIdRight: string | undefined;
    setChatIdRight: React.Dispatch<React.SetStateAction<string | undefined>>;
    onNewChat: () => void;
    stateOverrides?: Record<string, string>;
}

export function ChatInterface({
    agentId,
    nodes,
    messages,
    setMessages,
    chatId,
    setChatId,
    messagesRight,
    setMessagesRight,
    chatIdRight,
    setChatIdRight,
    onNewChat,
    stateOverrides
}: ChatInterfaceProps) {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Split View State
    const [isSplitView, setIsSplitView] = useState(false);
    const scrollRefRight = useRef<HTMLDivElement>(null);
    const [selectedVersionIdLeft, setSelectedVersionIdLeft] = useState<string>('current');
    const [selectedVersionIdRight, setSelectedVersionIdRight] = useState<string>('current');
    const [availableVersions, setAvailableVersions] = useState<PromptSetVersion[]>([]);

    useEffect(() => {
        if (isSplitView) {
            loadAllVersions();
        }
    }, [isSplitView]);

    const loadAllVersions = async () => {
        const versions = await fetchPromptVersions(agentId);
        setAvailableVersions(versions);
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
        if (scrollRefRight.current) {
            scrollRefRight.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, messagesRight]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input,
            id: Date.now().toString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        if (isSplitView) {
            setMessagesRight((prev) => [...prev, { ...userMessage, id: `right-${Date.now()}` }]);
        }

        setInput('');
        setIsLoading(true);

        try {
            // Helper to get nodes from a version
            const getNodesForVersion = (versionId: string) => {
                if (versionId === 'current') return nodes;
                const version = availableVersions.find(v => v.id === versionId);
                if (!version) return nodes;
                // Map version nodes back to OverridableNode format
                return version.nodes.map(vNode => {
                    const originalNode = nodes.find(n => n.id === vNode.id);
                    return {
                        ...originalNode,
                        id: vNode.id,
                        label: vNode.label,
                        type: vNode.type,
                        systemMessagePrompt: vNode.systemMessagePrompt,
                        humanMessagePrompt: vNode.humanMessagePrompt
                    } as OverridableNode;
                });
            };

            // Build left panel nodes with selected version
            const leftNodes = getNodesForVersion(selectedVersionIdLeft);

            // Left Panel
            const responseLeftPromise = sendChat(agentId, input, chatId, leftNodes, stateOverrides);

            // Right Panel (Configured Versions)
            let responseRightPromise: Promise<any> | null = null;
            if (isSplitView) {
                const rightNodes = getNodesForVersion(selectedVersionIdRight);
                responseRightPromise = sendChat(agentId, input, chatIdRight, rightNodes, stateOverrides);
            }

            const [responseLeft, responseRight] = await Promise.all([
                responseLeftPromise,
                isSplitView ? responseRightPromise : Promise.resolve(null)
            ]);

            // Handle Left Response
            if (responseLeft.chatId && !chatId) {
                setChatId(responseLeft.chatId);
            }
            const agentMessageLeft: ChatMessage = {
                role: 'assistant',
                content: responseLeft.text,
                id: responseLeft.chatMessageId,
                traceData: responseLeft.agentReasoning
            };
            setMessages(prev => [...prev, agentMessageLeft]);

            // Handle Right Response
            if (responseRight) {
                if (responseRight.chatId && !chatIdRight) {
                    setChatIdRight(responseRight.chatId);
                }
                const agentMessageRight: ChatMessage = {
                    role: 'assistant',
                    content: responseRight.text,
                    id: responseRight.chatMessageId,
                    traceData: responseRight.agentReasoning
                };
                setMessagesRight(prev => [...prev, agentMessageRight]);
            }

        } catch (error) {
            console.error('Failed to send message:', error);
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                id: Date.now().toString()
            };
            setMessages(prev => [...prev, errorMessage]);
            if (isSplitView) {
                setMessagesRight(prev => [...prev, { ...errorMessage, id: `right-error-${Date.now()}` }]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        if (window.confirm('Start a new chat? This will clear all messages.')) {
            onNewChat();
        }
    };

    const getVersionLabel = (versionId: string) => {
        if (versionId === 'current') return 'Current Draft';
        const version = availableVersions.find(v => v.id === versionId);
        return version ? version.name : versionId;
    };

    return (
        <div className="flex flex-col h-[600px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-medium text-slate-700">Live Agent</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClear} className="text-slate-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Chat
                </Button>
                <Button
                    variant={isSplitView ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setIsSplitView(!isSplitView)}
                    className={isSplitView ? "bg-indigo-100 text-indigo-700" : "text-slate-500"}
                >
                    <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                    {isSplitView ? 'Split View On' : 'Split View'}
                </Button>

                {isSplitView && (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Label className="text-sm text-slate-600">Left:</Label>
                            <Select value={selectedVersionIdLeft} onValueChange={setSelectedVersionIdLeft}>
                                <SelectTrigger className="w-[180px] h-8">
                                    <SelectValue placeholder="Select version" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="current">Current Draft</SelectItem>
                                    {availableVersions.map(v => (
                                        <SelectItem key={v.id} value={v.id}>
                                            {v.name} ({new Date(v.createdAt).toLocaleDateString()})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label className="text-sm text-slate-600">Right:</Label>
                            <Select value={selectedVersionIdRight} onValueChange={setSelectedVersionIdRight}>
                                <SelectTrigger className="w-[180px] h-8">
                                    <SelectValue placeholder="Select version" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="current">Current Draft</SelectItem>
                                    {availableVersions.map(v => (
                                        <SelectItem key={v.id} value={v.id}>
                                            {v.name} ({new Date(v.createdAt).toLocaleDateString()})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
                <GlobalOptimizer
                    agentId={agentId}
                    chatHistory={messages.map(m => `${m.role}: ${m.content}`).join('\n')}
                    nodes={nodes}
                />
            </div>

            <div className={`flex-1 flex overflow-hidden ${isSplitView ? 'divide-x divide-slate-200' : ''}`}>
                {/* Left Panel */}
                <ScrollArea className="flex-1 p-4">
                    {isSplitView && (
                        <div className="mb-2 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded inline-block">
                            {getVersionLabel(selectedVersionIdLeft)}
                        </div>
                    )}
                    <div className="space-y-6">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
                                    <Avatar className={`h-8 w-8 ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                                        <AvatarFallback className={msg.role === 'user' ? 'text-indigo-600' : 'text-emerald-600'}>
                                            {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div
                                            className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                                : 'bg-slate-100 text-slate-800 rounded-tl-none'
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                        {msg.role === 'assistant' && msg.traceData && (
                                            <TracePanel reasoning={msg.traceData} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="flex flex-row items-start gap-3">
                                    <Avatar className="h-8 w-8 bg-emerald-100">
                                        <AvatarFallback className="text-emerald-600"><Bot className="h-4 w-4" /></AvatarFallback>
                                    </Avatar>
                                    <div className="bg-slate-100 p-3 rounded-2xl rounded-tl-none">
                                        <div className="flex space-x-1">
                                            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                {/* Right Panel */}
                {isSplitView && (
                    <ScrollArea className="flex-1 p-4 bg-slate-50/30">
                        <div className="mb-2 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded inline-block">
                            {getVersionLabel(selectedVersionIdRight)}
                        </div>
                        <div className="space-y-6">
                            {messagesRight.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
                                        <Avatar className={`h-8 w-8 ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-purple-100'}`}>
                                            <AvatarFallback className={msg.role === 'user' ? 'text-indigo-600' : 'text-purple-600'}>
                                                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                            </AvatarFallback>
                                        </Avatar>

                                        <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div
                                                className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                                                    }`}
                                            >
                                                {msg.content}
                                            </div>
                                            {msg.role === 'assistant' && msg.traceData && (
                                                <TracePanel reasoning={msg.traceData} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="flex flex-row items-start gap-3">
                                        <Avatar className="h-8 w-8 bg-purple-100">
                                            <AvatarFallback className="text-purple-600"><Bot className="h-4 w-4" /></AvatarFallback>
                                        </Avatar>
                                        <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none">
                                            <div className="flex space-x-1">
                                                <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={scrollRefRight} />
                        </div>
                    </ScrollArea>
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex gap-2"
                >
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-slate-50 border-slate-200 focus:ring-indigo-500"
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()} className="bg-indigo-600 hover:bg-indigo-700">
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Send</span>
                    </Button>
                </form>
            </div>
        </div>
    );
}
