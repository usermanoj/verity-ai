import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";
import SessionBadgeClient from "@/components/SessionBadgeClient";

// The Chinese homepage is a real prerendered page, not a client-side swap of
// the English one — Chinese is the first language market, so it gets the same
// static-from-the-edge treatment and is separately indexable.
export const dynamic = "force-static";

export const metadata: Metadata = {
  alternates: { canonical: "/zh", languages: { en: "/", zh: "/zh" } },
};

export default function HomeZh() {
  return (
    <>
      {/* Only the root layout can render <html>, so it carries lang="en" for
          the rest of the app. This corrects it for this page before first
          paint (an inline script runs during parse), which matters for screen
          readers and CJK font selection. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang='zh'` }} />
      <HomeContent locale="zh" session={<SessionBadgeClient />} />
    </>
  );
}
