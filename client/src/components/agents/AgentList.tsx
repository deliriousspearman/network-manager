import { useState, useCallback } from 'react';
import { List, Network } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import Tabs, { type TabDef } from '../ui/Tabs';
import PageHeader from '../layout/PageHeader';
import ErrorBoundary from '../ui/ErrorBoundary';
import AgentListPanel from './AgentListPanel';
import AgentNetworkDiagram from '../diagram/AgentNetworkDiagram';

const tabs: TabDef[] = [
  { id: 'list', label: 'List', icon: <List size={14} /> },
  { id: 'map', label: 'Map', icon: <Network size={14} /> },
];

export default function AgentList() {
  const [total, setTotal] = useState<number | undefined>(undefined);

  const handleTotalChange = useCallback((t: number | undefined) => setTotal(t), []);

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={typeof total === 'number' ? `${total} total` : undefined}
      />
      <Tabs tabs={tabs} hashPersist>
        {(active) => active === 'list' ? (
          <AgentListPanel onTotalChange={handleTotalChange} />
        ) : (
          <ErrorBoundary>
            <ReactFlowProvider>
              <AgentNetworkDiagram />
            </ReactFlowProvider>
          </ErrorBoundary>
        )}
      </Tabs>
    </div>
  );
}
