'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { sendChat } from '@/app/actions';
import { TracePanel } from '@/components/trace-panel';
import { OverridableNode } from '@/types/polaris';
import { ChatMessage } from '@/lib/api';
import { GlobalOptimizer } from '@/components/global-optimizer';
import { SplitSquareHorizontal } from 'lucide-react';
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
            const getNodesForVersion = (versionId: string) => {
                if (versionId === 'current') return nodes;
                const version = availableVersions.find(v => v.id === versionId);
                if (!version) return nodes;
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

            const leftNodes = getNodesForVersion(selectedVersionIdLeft);
            const responseLeftPromise = sendChat(agentId, input, chatId, leftNodes, stateOverrides);

            let responseRightPromise: Promise<any> | null = null;
            if (isSplitView) {
                const rightNodes = getNodesForVersion(selectedVersionIdRight);
                responseRightPromise = sendChat(agentId, input, chatIdRight, rightNodes, stateOverrides);
            }

            const [responseLeft, responseRight] = await Promise.all([
                responseLeftPromise,
                isSplitView ? responseRightPromise : Promise.resolve(null)
            ]);

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
        <div className="flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-medium text-sm text-foreground">Live Agent</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive h-8">
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        Clear Chat
                    </Button>
                    <Button
                        variant={isSplitView ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setIsSplitView(!isSplitView)}
                        className={`h-8 ${isSplitView ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        <SplitSquareHorizontal className="h-4 w-4 mr-1.5" />
                        Split View
                    </Button>
                    <GlobalOptimizer
                        agentId={agentId}
                        chatHistory={messages.map(m => `${m.role}: ${m.content}`).join('\n')}
                        nodes={nodes}
                    />
                </div>
            </div>

            {/* Version Selectors for Split View */}
            {isSplitView && (
                <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/10">
                    <div className="flex items-center gap-2 flex-1">
                        <Label className="text-xs text-muted-foreground">Left:</Label>
                        <Select value={selectedVersionIdLeft} onValueChange={setSelectedVersionIdLeft}>
                            <SelectTrigger className="flex-1 h-7 text-xs border-border">
                                <SelectValue placeholder="Select version" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="current">Current Draft</SelectItem>
                                {availableVersions.map(v => (
                                    <SelectItem key={v.id} value={v.id}>
                                        {v.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                        <Label className="text-xs text-muted-foreground">Right:</Label>
                        <Select value={selectedVersionIdRight} onValueChange={setSelectedVersionIdRight}>
                            <SelectTrigger className="flex-1 h-7 text-xs border-border">
                                <SelectValue placeholder="Select version" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="current">Current Draft</SelectItem>
                                {availableVersions.map(v => (
                                    <SelectItem key={v.id} value={v.id}>
                                        {v.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {/* Chat Area */}
            <div className={`flex-1 flex overflow-hidden ${isSplitView ? 'divide-x divide-border' : ''}`}>
                {/* Left Panel */}
                <ScrollArea className="flex-1 p-4">
                    {isSplitView && (
                        <Badge variant="outline" className="mb-3 bg-primary/10 text-primary border-primary/20 text-xs">
                            {getVersionLabel(selectedVersionIdLeft)}
                        </Badge>
                    )}
                    <div className="space-y-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
                                    <Avatar className={`h-7 w-7 ${msg.role === 'user' ? 'bg-primary/20' : 'bg-muted'}`}>
                                        <AvatarFallback className={`text-xs ${msg.role === 'user' ? 'text-primary' : 'text-muted-foreground'}`}>
                                            {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div
                                            className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                                : 'bg-muted/50 text-foreground border border-border rounded-tl-sm'
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
                                <div className="flex flex-row items-start gap-2">
                                    <Avatar className="h-7 w-7 bg-muted">
                                        <AvatarFallback className="text-muted-foreground text-xs"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                                    </Avatar>
                                    <div className="bg-muted/50 border border-border p-3 rounded-2xl rounded-tl-sm">
                                        <div className="flex space-x-1">
                                            <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                    <ScrollArea className="flex-1 p-4 bg-muted/5">
                        <Badge variant="outline" className="mb-3 bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                            {getVersionLabel(selectedVersionIdRight)}
                        </Badge>
                        <div className="space-y-4">
                            {messagesRight.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
                                        <Avatar className={`h-7 w-7 ${msg.role === 'user' ? 'bg-primary/20' : 'bg-amber-500/10'}`}>
                                            <AvatarFallback className={`text-xs ${msg.role === 'user' ? 'text-primary' : 'text-amber-600'}`}>
                                                {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div
                                                className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                                                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                                    : 'bg-card border border-border text-foreground rounded-tl-sm'
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
                                    <div className="flex flex-row items-start gap-2">
                                        <Avatar className="h-7 w-7 bg-amber-500/10">
                                            <AvatarFallback className="text-amber-600 text-xs"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                                        </Avatar>
                                        <div className="bg-card border border-border p-3 rounded-2xl rounded-tl-sm">
                                            <div className="flex space-x-1">
                                                <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

            {/* Input */}
            <div className="p-3 border-t border-border">
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
                        className="flex-1 bg-muted/30 border-border focus:ring-primary/20 text-foreground placeholder:text-muted-foreground"
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
}
