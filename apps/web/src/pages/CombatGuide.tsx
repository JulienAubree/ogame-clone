import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';

const TABS = [
  { id: 'beginner', label: 'Comprendre le combat' },
  { id: 'reference', label: 'Référence technique' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function CombatGuide() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'beginner';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams(tab === 'beginner' ? {} : { tab });
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Guide de combat spatial" />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'beginner' ? <BeginnerTab /> : <ReferenceTab />}
    </div>
  );
}

function BeginnerTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Contenu débutant — à venir.</p>
    </div>
  );
}

function ReferenceTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Référence technique — à venir.</p>
    </div>
  );
}
