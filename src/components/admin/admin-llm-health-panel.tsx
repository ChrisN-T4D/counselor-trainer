"use client";

import { useEffect, useState } from "react";
import type { LlmHealthResult } from "@/lib/llm/health";

export function AdminLlmHealthPanel() {
  const [health, setHealth] = useState<LlmHealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch("/api/llm/health");
        const data = (await response.json()) as LlmHealthResult & { error?: string };

        if (cancelled) {
          return;
        }

        if (!response.ok && !data.baseUrl) {
          throw new Error(data.error ?? "Could not check LLM connectivity");
        }

        setHealth(data);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not check LLM connectivity");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-10 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">LLM connectivity</h2>
      <p className="mt-1 text-sm text-slate-600">
        Live check against your configured Ollama/API host from this server.
      </p>

      {loading && <p className="mt-4 text-sm text-slate-600">Checking connection…</p>}

      {error && !loading && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}

      {health && !loading && (
        <>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className={health.ok ? "font-medium text-green-700" : "font-medium text-red-700"}>
                {health.ok ? "Connected" : "Failed"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Model</dt>
              <dd className="font-medium text-slate-900">{health.model ?? "unset"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Host</dt>
              <dd className="font-medium text-slate-900">{health.baseUrl ?? "unset"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Latency</dt>
              <dd className="font-medium text-slate-900">
                {health.latencyMs != null ? `${health.latencyMs} ms` : "—"}
              </dd>
            </div>
          </dl>
          {health.replyPreview && (
            <p className="mt-3 text-sm text-slate-700">
              Test reply: <span className="font-medium">{health.replyPreview}</span>
            </p>
          )}
          {health.error && (
            <p className="mt-3 text-sm text-red-600">{health.error}</p>
          )}
          {health.hint && (
            <p className="mt-2 text-sm text-amber-700">{health.hint}</p>
          )}
        </>
      )}
    </section>
  );
}
