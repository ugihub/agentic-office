"use client";
import { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { ConnectionTab } from "@/components/settings/ConnectionTab";
import { ApiKeysTab } from "@/components/settings/ApiKeysTab";
import { ProviderKeysTab } from "@/components/settings/ProviderKeysTab";

type Tab = "connection" | "api-keys" | "provider-keys";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "api-keys", label: "API Keys" },
  { id: "provider-keys", label: "Provider Keys" },
];

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>("connection");

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-primary">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? "border-brand-500 text-brand-400"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "connection" && (
          <ConnectionTab settings={settings} onSave={save} />
        )}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "provider-keys" && <ProviderKeysTab />}
      </div>
    </div>
  );
}
