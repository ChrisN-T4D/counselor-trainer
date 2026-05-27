import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function AppHeader() {
  const session = await auth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
          Counselor Trainer
        </Link>
        {session?.user && (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/scenarios" className="text-slate-600 hover:text-slate-900">
              Scenarios
            </Link>
            <span className="text-slate-500">{session.user.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
