'use client';

import { useState, useEffect } from 'react';
import { fetchNodes, fetchStateMemory, fetchAgents } from '@/app/actions';
import { Dashboard } from '@/components/dashboard';
import { AgentSelector } from '@/components/agent-selector';
import { OverridableNode, StateMemory, AgentConfig } from '@/types/polaris';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [nodes, setNodes] = useState<OverridableNode[]>([]);
  const [stateMemory, setStateMemory] = useState<StateMemory | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Check if there's only one agent, auto-select it
  useEffect(() => {
    const checkAgents = async () => {
      try {
        const agents = await fetchAgents();
        if (agents.length === 1) {
          // Auto-select if only one agent
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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Loading agent...</p>
        </div>
      </main>
    );
  }

  if (!selectedAgentId) {
    return (
      <main className="min-h-screen bg-slate-50">
        <AgentSelector
          onAgentSelect={handleAgentSelect}
          selectedAgentId={selectedAgentId || undefined}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Agent header with back button */}
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={handleBackToSelector}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Switch Agent
          </Button>
          {selectedAgent && (
            <div className="text-sm text-muted-foreground">
              Working with: <span className="font-medium text-foreground">{selectedAgent.name}</span>
            </div>
          )}
        </div>

        <Dashboard
          agentId={selectedAgentId}
          initialNodes={nodes}
          initialStateMemory={stateMemory}
        />
      </div>
    </main>
  );
}
