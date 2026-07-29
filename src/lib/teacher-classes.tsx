import JoinQr from "@/components/classes/JoinQr";
import type { ClassCode } from "@/components/classes/ClassCodes";
import { headers } from "next/headers";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

// Lifted out of app/teacher/page.tsx when the dashboard was split into tabs,
// so the Classes screen owns its own data and the Overview screen no longer
// pays for a QR encode it does not render.
export async function getClassCodes(): Promise<ClassCode[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.rpc("teacher_class_codes");
    return (data as ClassCode[] | null) ?? [];
  } catch {
    return [];
  }
}

// A QR has to carry an absolute URL, so the origin comes from the request
// rather than a hardcoded domain — the same code then works on localhost,
// a preview deployment and production without configuration.
export async function joinQrs(codes: ClassCode[]): Promise<Record<string, React.ReactNode>> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return {};
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";

  const entries = codes
    .filter((c) => c.code)
    .map((c) => [
      c.classId,
      <JoinQr key={c.classId} url={`${protocol}://${host}/join?code=${encodeURIComponent(c.code!)}`} />,
    ] as const);

  return Object.fromEntries(entries);
}
