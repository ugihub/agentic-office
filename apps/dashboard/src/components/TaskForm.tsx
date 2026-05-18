"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBureauClient } from "@/lib/bureau-client";

const inputCls =
  "w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500";

export function TaskForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("");
  const [tier, setTier] = useState<"economy" | "standard" | "premium">(
    "standard",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const client = createBureauClient();
      const task = await client.submitTask({
        prompt: prompt.trim(),
        constraints: {
          ...(budget ? { maxCostUsd: budget } : {}),
          preferredModelTier: tier,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(`/tasks/${task.taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit task");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label
          htmlFor="task-prompt"
          className="block text-sm font-medium text-secondary mb-2"
        >
          Task Prompt <span className="text-danger">*</span>
        </label>
        <textarea
          id="task-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          required
          aria-describedby="prompt-desc"
          placeholder="Describe the task you want the AI agents to complete…"
          className={`${inputCls} resize-none`}
        />
        <p id="prompt-desc" className="mt-1 text-xs text-muted">
          {prompt.length} characters
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="task-budget"
            className="block text-sm font-medium text-secondary mb-1"
          >
            Max Budget (USD, optional)
          </label>
          <input
            id="task-budget"
            type="number"
            step="0.01"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 0.50"
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="task-tier"
            className="block text-sm font-medium text-secondary mb-1"
          >
            Model Tier
          </label>
          <select
            id="task-tier"
            value={tier}
            onChange={(e) =>
              setTier(e.target.value as "economy" | "standard" | "premium")
            }
            className={inputCls}
          >
            <option value="economy">Economy (faster, cheaper)</option>
            <option value="standard">Standard (balanced)</option>
            <option value="premium">Premium (best quality)</option>
          </select>
        </div>
      </div>

      {error !== null && (
        <div
          role="alert"
          className="rounded-lg bg-danger/10 border border-danger/30 p-3"
        >
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !prompt.trim()}
        className="w-full rounded-lg bg-brand-500 px-6 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {submitting && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {submitting ? "Submitting task…" : "Submit Task to Agents"}
      </button>
    </form>
  );
}
