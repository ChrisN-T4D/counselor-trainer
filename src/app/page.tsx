import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4">
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Counselor Trainer</h1>
        <p className="mt-3 text-slate-600">
          Practice client interactions, build session skills, and review transcripts.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-slate-300 px-5 py-2.5 text-slate-700 hover:bg-slate-50"
          >
            Register
          </Link>
        </div>
      </div>
    </main>
  );
}
