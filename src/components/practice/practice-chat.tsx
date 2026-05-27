"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Message = {
  id: string;
  role: "CLIENT" | "THERAPIST" | "SYSTEM";
  content: string;
  sequence: number;
  createdAt: string;
};

type PracticeSession = {
  id: string;
  status: string;
  scenario: {
    title: string;
    dsmCategory: string;
    presentingProblem: string;
  };
  messages: Message[];
};

export function PracticeChat({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        setError("Could not load session");
        setLoading(false);
        return;
      }

      const data = (await response.json()) as { session: PracticeSession };
      setPracticeSession(data.session);
      setLoading(false);
    }

    loadSession();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [practiceSession?.messages.length, sending]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || sending || practiceSession?.status !== "ACTIVE") {
      return;
    }

    setSending(true);
    setError(null);

    const response = await fetch(`/api/sessions/${sessionId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Failed to send message");
      setSending(false);
      return;
    }

    const data = (await response.json()) as {
      therapistMessage: Message;
      clientMessage: Message;
    };

    setPracticeSession((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, data.therapistMessage, data.clientMessage],
          }
        : current,
    );
    setInput("");
    setSending(false);
  }

  async function handleEndSession() {
    setEnding(true);
    setError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setError("Failed to end session");
      setEnding(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (loading) {
    return <p className="text-slate-600">Loading session...</p>;
  }

  if (!practiceSession) {
    return <p className="text-red-600">{error ?? "Session not found"}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">{practiceSession.scenario.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{practiceSession.scenario.dsmCategory}</p>
        <p className="mt-2 text-sm text-slate-700">{practiceSession.scenario.presentingProblem}</p>
      </div>

      <div className="min-h-[420px] rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="space-y-3">
          {practiceSession.messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                message.role === "THERAPIST"
                  ? "ml-auto bg-slate-900 text-white"
                  : "bg-white text-slate-900 shadow-sm"
              }`}
            >
              <p className="mb-1 text-xs font-medium opacity-70">
                {message.role === "THERAPIST" ? "You (Therapist)" : "Client"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
          {sending && (
            <p className="text-sm text-slate-500">Client is thinking...</p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {practiceSession.status === "ACTIVE" ? (
        <form onSubmit={handleSend} className="flex flex-col gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Respond as the therapist..."
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={sending}
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send response"}
            </button>
            <button
              type="button"
              onClick={handleEndSession}
              disabled={ending}
              className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {ending ? "Ending..." : "End session"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate-600">This session has ended.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
