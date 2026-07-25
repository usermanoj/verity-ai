import HomeContent from "@/components/HomeContent";

// Statically prerendered at build time and served from the CDN edge — no
// serverless invocation, so no cold start. It previously rendered on every
// request (because next-intl read the locale cookie), which measured 1575ms
// cold against ~75ms warm; a marketing page most visitors hit exactly once
// was therefore usually cold.
export const dynamic = "force-static";

export default function Home() {
  return <HomeContent locale="en" />;
}
