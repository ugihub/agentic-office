"use client";
import { useState } from "react";
import useSWR from "swr";
import { createBureauClient } from "@/lib/bureau-client";
import type { ApiKey, CreateApiKeyResult } from "@bureau/sdk";

const PERMISSIONS = [
  "task:read",
  "task:write",
  "keys:read",
  "keys:write",
  "provider-keys:write",
];

const inputCls =
  "w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500";

function fetcher(): Promise<ApiKey[]> {
  return createBureauClient().listApiKeys();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ApiKeysTab() {
  const {
    data: keys,
    error,
    mutate,
  } = useSWR<ApiKey[]>("api-keys", fetcher, {
    revalidateOnFocus: true,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([
    "task:read",
    "task:write",
  ]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Plaintext modal
  const [newKey, setNewKey] = useState<CreateApiKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || permissions.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createBureauClient().createApiKey({
        name: name.trim(),
        permissions,
        expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
      });
      setNewKey(result);
      setShowCreate(false);
      setName("");
      setExpiresInDays("");
      setPermissions(["task:read", "task:write"]);
      await mutate();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create key",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    setRevoking(keyId);
    try {
      await createBureauClient().revokeApiKey(keyId);
      await mutate();
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setNewKey(null);
    }, 1500);
  }

  function togglePermission(perm: string) {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger/10 border border-danger/30 p-4">
        <p className="text-sm text-red-400">
          Failed to load API keys — your current key may lack{" "}
          <code className="text-brand-400">keys:read</code> permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Plaintext modal */}
      {newKey !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-base font-bold text-primary">
              API Key Created
            </h3>
            <div className="rounded-lg bg-raised border border-border p-3">
              <p
                className="text-xs font-mono text-brand-400 break-all"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {newKey.plaintext}
              </p>
            </div>
            <p className="text-xs text-warning">
              &#x26A0; This key will not be shown again. Copy it now.
            </p>
            <button
              onClick={() => handleCopy(newKey.plaintext)}
              className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              {copied ? "&#x2713; Copied!" : "Copy to Clipboard"}
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm text-secondary hover:text-primary"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-secondary">API Keys</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
        >
          {showCreate ? "Cancel" : "+ Create New Key"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border bg-raised p-4 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Key Name <span className="text-danger">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. production-app"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">
              Permissions <span className="text-danger">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PERMISSIONS.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(p)}
                    onChange={() => togglePermission(p)}
                    className="rounded border-border bg-raised accent-brand-500"
                  />
                  <span className="text-xs font-mono text-secondary">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Expires In Days (optional)
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="e.g. 90"
              className={inputCls}
            />
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim() || permissions.length === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Key"}
          </button>
        </form>
      )}

      {/* Keys table */}
      {!keys && !error && (
        <p className="text-sm text-secondary">Loading keys…</p>
      )}
      {keys && keys.length === 0 && (
        <p className="text-sm text-muted">No API keys yet.</p>
      )}
      {keys && keys.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-raised">
              <tr>
                {["Name", "Prefix", "Permissions", "Created", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {keys.map((key) => (
                <tr key={key.keyId}>
                  <td className="px-3 py-2.5 text-xs text-primary">
                    {key.name}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-secondary">
                    {key.keyPrefix}…
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {key.permissions.join(", ")}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {timeAgo(key.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleRevoke(key.keyId)}
                      disabled={revoking === key.keyId}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {revoking === key.keyId ? "Revoking…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
