import { AppHeader } from "@/components/layout/app-header";
import { PracticeChat } from "@/components/practice/practice-chat";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function PracticePage({ params }: PageProps) {
  const { sessionId } = await params;

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PracticeChat sessionId={sessionId} />
      </main>
    </>
  );
}
