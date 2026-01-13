'use client';

import { useState, useEffect } from 'react';
import { fetchNodes, fetchStateMemory, fetchAgents } from '@/app/actions';
import { Dashboard } from '@/components/dashboard';
import { AgentSelector } from '@/components/agent-selector';
import { OverridableNode, StateMemory, AgentConfig } from '@/types/polaris';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [nodes, setNodes] = useState<OverridableNode[]>([]);
  const [stateMemory, setStateMemory] = useState<StateMemory | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const checkAgents = async () => {
      try {
        const agents = await fetchAgents();
        if (agents.length === 1) {
          handleAgentSelect(agents[0].id);
        }
      } catch (err) {
        console.error('Failed to check agents:', err);
      } finally {
        setInitialLoading(false);
      }
    };
    checkAgents();
  }, []);

  const handleAgentSelect = async (agentId: string) => {
    if (!agentId) {
      setSelectedAgentId(null);
      setSelectedAgent(null);
      setNodes([]);
      setStateMemory(null);
      return;
    }

    setLoading(true);
    try {
      const [nodesData, stateData, agents] = await Promise.all([
        fetchNodes(agentId),
        fetchStateMemory(agentId),
        fetchAgents(),
      ]);

      const agent = agents.find(a => a.id === agentId);

      setSelectedAgentId(agentId);
      setSelectedAgent(agent || null);
      setNodes(nodesData);
      setStateMemory(stateData);
    } catch (err) {
      console.error('Failed to load agent:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSelector = () => {
    setSelectedAgentId(null);
    setSelectedAgent(null);
    setNodes([]);
    setStateMemory(null);
  };

  if (initialLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading agent configuration...</p>
        </div>
      </main>
    );
  }

  if (!selectedAgentId) {
    return (
      <main className="min-h-screen bg-background">
        <AgentSelector
          onAgentSelect={handleAgentSelect}
          selectedAgentId={selectedAgentId || undefined}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-4 px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToSelector}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Switch Agent</span>
          </Button>

          <div className="h-4 w-px bg-border" />

          {selectedAgent && (
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none">{selectedAgent.name}</span>
                <span className="text-xs text-muted-foreground">Active Agent</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="px-6 py-6">
        <Dashboard
          agentId={selectedAgentId}
          initialNodes={nodes}
          initialStateMemory={stateMemory}
        />
      </div>
    </main>
  );
}
