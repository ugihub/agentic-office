"use client";
import useSWR from "swr";
import { useState } from "react";
import { createBureauClient } from "@/lib/bureau-client";
import { BureauError } from "@bureau/sdk";
import type { ProviderKeyStatus } from "@bureau/sdk";

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

function fetcher(): Promise<ProviderKeyStatus[]> {
  return createBureauClient().listProviderKeys();
}

export function ProviderKeysTab() {
  const {
    data: serverKeys,
    error,
    mutate,
  } = useSWR<ProviderKeyStatus[]>("provider-keys", fetcher, {
    revalidateOnFocus: true,
  });

  const [inputs, setInputs] = useState<Partial<Record<Provider, string>>>({});
  const [saving, setSaving] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Provider, string>>>({});

  // Build a lookup map from server data
  const statusMap = new Map<string, ProviderKeyStatus>(
    (serverKeys ?? []).map((k) => [k.provider, k]),
  );

  async function handleSave(provider: Provider) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    setSaving(provider);
    setErrors((prev) => ({ ...prev, [provider]: undefined }));
    try {
      await createBureauClient().storeProviderKey(provider, key);
      setInputs((prev) => ({ ...prev, [provider]: "" }));
      await mutate();
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
      await mutate();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [provider]: err instanceof Error ? err.message : "Failed to remove key",
      }));
    } finally {
      setRemoving(null);
    }
  }

  function listErrorMsg(): string {
    if (!error) return "";
    if (error instanceof BureauError) {
      if (error.status === 401)
        return "No API key configured. Set one in the Connection tab first.";
      if (error.status === 403)
        return "Current key lacks provider-keys:write permission.";
    }
    return "Cannot reach the API — check Connection tab.";
  }

  return (
    <div className="space-y-3 max-w-lg">
      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 flex items-start gap-2">
          <span className="text-red-400 mt-0.5 text-sm">⚠</span>
          <p className="text-sm text-red-400">{listErrorMsg()}</p>
        </div>
      )}
      <p className="text-xs text-muted">
        Provider keys are encrypted server-side (AES-256-GCM). They cannot be
        retrieved after storage.
      </p>
      {PROVIDERS.map(({ id, label, placeholder, icon }) => {
        const s = statusMap.get(id);
        const stored = s?.isActive === true;
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
                {!serverKeys && (
                  <span className="text-xs text-muted">loading…</span>
                )}
              </div>
              {stored ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted">
                    ••••{s?.keyPreview ?? ""}
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
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                  Not stored
                </span>
              )}
            </div>

            {!stored && (
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
