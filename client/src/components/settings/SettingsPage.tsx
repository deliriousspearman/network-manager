import { Settings as SettingsIcon, Monitor, Bot, Highlighter } from 'lucide-react';
import Tabs, { type TabDef } from '../ui/Tabs';
import PageHeader from '../layout/PageHeader';
import GeneralTab from './tabs/GeneralTab';
import DeviceIconsTab from './tabs/DeviceIconsTab';
import AgentTypesTab from './tabs/AgentTypesTab';
import HighlightRulesTab from './tabs/HighlightRulesTab';

const tabs: TabDef[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon size={14} /> },
  { id: 'device-icons', label: 'Device Icons', icon: <Monitor size={14} /> },
  { id: 'agent-types', label: 'Agent Types', icon: <Bot size={14} /> },
  { id: 'highlight-rules', label: 'Highlight Rules', icon: <Highlighter size={14} /> },
];

export default function SettingsPage() {
  const renderTab = (id: string) => {
    switch (id) {
      case 'general': return <GeneralTab />;
      case 'device-icons': return <DeviceIconsTab />;
      case 'agent-types': return <AgentTypesTab />;
      case 'highlight-rules': return <HighlightRulesTab />;
      default: return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Project Settings"
        subtitle="Manage backup, icons, and highlight rules"
      />
      <Tabs tabs={tabs} hashPersist>
        {renderTab}
      </Tabs>
    </div>
  );
}
