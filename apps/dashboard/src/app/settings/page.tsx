"use client";
import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">(
    "idle",
  );

  useEffect(() => {
    setForm(settings);
  }, [settings]);

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
    save(form);
    setStatus("idle");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Server URL
          </label>
          <input
            type="url"
            value={form.apiUrl}
            onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="http://localhost:3001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="bureau_live_..."
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={status === "testing"}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {status === "testing" ? "Testing…" : "Test Connection"}
          </button>
        </div>
        {status === "ok" && (
          <p className="text-sm text-green-600">✓ Connected successfully</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red-600">
            ✗ Connection failed — check URL and API key
          </p>
        )}
      </form>
    </div>
  );
}
