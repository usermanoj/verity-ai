import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Verity AI — Curriculum AI for ESL Classrooms",
  description:
    "Verity AI answers only from your school's approved material — never the open internet, cited every time — and speaks a student's own language, starting with Chinese (Mandarin, Simplified). Built for ESL students at international schools.",
};

// Deliberately synchronous and request-free.
//
// This used to await getLocale()/getMessages(), which read cookies — and a
// cookie read in the ROOT layout opts every route in the app into dynamic
// rendering. Nothing could be prerendered or CDN-cached, so even the static
// marketing homepage paid a serverless invocation per visit (1575ms cold).
// The two translated pages (/ and /zh) now supply their own messages at build
// time instead; see components/HomeContent.tsx.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
