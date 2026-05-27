import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
      <div className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Access your counselor training dashboard.</p>
        <div className="mt-6">
          <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
