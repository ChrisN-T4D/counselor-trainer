import { parseClientTextWithDeliveryTags } from "@/lib/voice/delivery-tags";

const TAG_COLORS: Record<string, string> = {
  pause: "bg-slate-200 text-slate-700",
  "long pause": "bg-slate-200 text-slate-700",
  hesitant: "bg-violet-100 text-violet-800",
  whispers: "bg-violet-100 text-violet-800",
  quietly: "bg-violet-100 text-violet-800",
  sigh: "bg-slate-200 text-slate-700",
  tearful: "bg-sky-100 text-sky-800",
  sad: "bg-sky-100 text-sky-800",
  crying: "bg-sky-100 text-sky-800",
  upset: "bg-amber-100 text-amber-900",
  nervous: "bg-amber-100 text-amber-900",
  angry: "bg-red-100 text-red-800",
  frustrated: "bg-red-100 text-red-800",
  agitated: "bg-red-100 text-red-800",
};

function tagClassName(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? "bg-amber-100 text-amber-900";
}

export function ClientTranscriptContent({ content }: { content: string }) {
  const segments = parseClientTextWithDeliveryTags(content);

  return (
    <p className="whitespace-pre-wrap">
      {segments.map((segment, index) =>
        segment.type === "tag" ? (
          <span
            key={`${segment.value}-${index}`}
            className={`mx-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tagClassName(segment.value)}`}
            title="Client delivery cue"
          >
            {segment.value}
          </span>
        ) : (
          <span key={`text-${index}`}>{segment.value}</span>
        ),
      )}
    </p>
  );
}
