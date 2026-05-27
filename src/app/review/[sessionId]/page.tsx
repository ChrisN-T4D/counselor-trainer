import { AppHeader } from "@/components/layout/app-header";
import { SessionReviewPanel } from "@/components/review/session-review-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionReviewPage({ params }: PageProps) {
  const { sessionId } = await params;

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <SessionReviewPanel sessionId={sessionId} />
      </main>
    </>
  );
}
