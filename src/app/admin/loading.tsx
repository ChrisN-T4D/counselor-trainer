import { AppHeader } from "@/components/layout/app-header";

export default function AdminLoading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Admin dashboard</h1>
          <p className="mt-1 text-slate-600">Loading admin tools…</p>
        </div>
      </main>
    </>
  );
}
