"use client";
import { useState } from "react";
import type { Settings } from "@/hooks/useSettings";

const inputCls =
  "w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500";

interface ConnectionTabProps {
  settings: Settings;
  onSave: (s: Settings) => void;
}

export function ConnectionTab({ settings, onSave }: ConnectionTabProps) {
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">(
    "idle",
  );

  async function testConnection() {
    setStatus("testing");
    try {
      const res = await fetch(`${form.apiUrl}/health/ready`);
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
    setStatus("idle");
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-secondary mb-1">
          API Server URL
        </label>
        <input
          type="url"
          value={form.apiUrl}
          onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
          className={inputCls}
          placeholder="http://localhost:3001"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-secondary mb-1">
          API Key
        </label>
        <input
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          className={inputCls}
          placeholder="bureau_live_..."
        />
        <p className="mt-1 text-xs text-muted">
          Requires <code className="text-brand-400">task:read</code> permission
          minimum. For API key management, also needs{" "}
          <code className="text-brand-400">keys:read</code> and{" "}
          <code className="text-brand-400">keys:write</code>.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          Save Settings
        </button>
        <button
          type="button"
          onClick={testConnection}
          disabled={status === "testing"}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:text-primary hover:bg-raised disabled:opacity-50 transition-colors"
        >
          {status === "testing" ? "Testing…" : "Test Connection"}
        </button>
      </div>
      {status === "ok" && (
        <p className="text-sm text-success">&#x2713; Connected successfully</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-400">
          &#x2717; Connection failed — check URL and API key
        </p>
      )}
    </form>
  );
}
