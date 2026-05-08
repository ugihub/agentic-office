"use client";
import { useState, useEffect } from "react";
import { createBureauClient } from "@/lib/bureau-client";

type Provider =
  | "anthropic"
  | "google"
  | "openai"
  | "deepseek"
  | "mistral"
  | "qwen";

interface ProviderConfig {
  id: Provider;
  label: string;
  placeholder: string;
  icon: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    icon: "🤖",
  },
  { id: "google", label: "Google Gemini", placeholder: "AIza...", icon: "🔷" },
  { id: "openai", label: "OpenAI", placeholder: "sk-...", icon: "🟢" },
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-...", icon: "🔵" },
  { id: "mistral", label: "Mistral", placeholder: "...", icon: "🔸" },
  { id: "qwen", label: "Qwen", placeholder: "...", icon: "🟠" },
];

type ProviderStatus = Record<
  Provider,
  { stored: boolean; preview: string | null }
>;

const STORAGE_KEY = "bureau_provider_keys_status";

function loadStatus(): ProviderStatus {
  if (typeof window === "undefined") {
    return Object.fromEntries(
      PROVIDERS.map((p) => [p.id, { stored: false, preview: null }]),
    ) as ProviderStatus;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProviderStatus;
  } catch {
    // ignore
  }
  return Object.fromEntries(
    PROVIDERS.map((p) => [p.id, { stored: false, preview: null }]),
  ) as ProviderStatus;
}

function saveStatus(status: ProviderStatus) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

export function ProviderKeysTab() {
  const [status, setStatus] = useState<ProviderStatus>(loadStatus);
  const [inputs, setInputs] = useState<Partial<Record<Provider, string>>>({});
  const [saving, setSaving] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Provider, string>>>({});

  useEffect(() => {
    setStatus(loadStatus());
  }, []);

  async function handleSave(provider: Provider) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    setSaving(provider);
    setErrors((prev) => ({ ...prev, [provider]: undefined }));
    try {
      await createBureauClient().storeProviderKey(provider, key);
      const preview = key.slice(-4);
      const next: ProviderStatus = {
        ...status,
        [provider]: { stored: true, preview },
      };
      setStatus(next);
      saveStatus(next);
      setInputs((prev) => ({ ...prev, [provider]: "" }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [provider]: err instanceof Error ? err.message : "Failed to store key",
      }));
    } finally {
      setSaving(null);
    }
  }

  async function handleRemove(provider: Provider) {
    if (!confirm(`Remove ${provider} key? It will be deleted from the server.`))
      return;
    setRemoving(provider);
    try {
      await createBureauClient().removeProviderKey(provider);
      const next: ProviderStatus = {
        ...status,
        [provider]: { stored: false, preview: null },
      };
      setStatus(next);
      saveStatus(next);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [provider]: err instanceof Error ? err.message : "Failed to remove key",
      }));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-3 max-w-lg">
      <p className="text-xs text-muted mb-4">
        Provider keys are encrypted server-side (AES-256-GCM). They cannot be
        retrieved after storage.
      </p>
      {PROVIDERS.map(({ id, label, placeholder, icon }) => {
        const s = status[id];
        const inputValue = inputs[id] ?? "";
        const isSaving = saving === id;
        const isRemoving = removing === id;
        const errMsg = errors[id];

        return (
          <div
            key={id}
            className="rounded-xl border border-border bg-surface p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span className="text-sm font-medium text-primary">
                  {label}
                </span>
              </div>
              {s.stored ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted">
                    &#x2022;&#x2022;&#x2022;&#x2022;{s.preview}
                  </span>
                  <button
                    onClick={() => handleRemove(id)}
                    disabled={isRemoving}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {isRemoving ? "Removing…" : "Remove"}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted">Not stored</span>
              )}
            </div>

            {!s.stored && (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [id]: e.target.value }))
                  }
                  placeholder={placeholder}
                  className="flex-1 rounded-lg border border-border bg-raised px-3 py-1.5 text-xs text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  onClick={() => handleSave(id)}
                  disabled={isSaving || !inputValue.trim()}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Add Key"}
                </button>
              </div>
            )}

            {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
          </div>
        );
      })}
    </div>
  );
}
