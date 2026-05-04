"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the dashboard content area. Inbox-like routes (/messaging, /allegro)
 * need full-width because they render their own three-column layout
 * (list / thread / sidebar). Everything else is centered with a max-width
 * for comfortable reading.
 */
const FULLWIDTH_PREFIXES = ["/messaging", "/allegro", "/labels"];

export function MessagingDetector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidth = FULLWIDTH_PREFIXES.some((p) => pathname.startsWith(p));

  if (fullWidth) {
    return <div className="h-screen">{children}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
      {children}
    </div>
  );
}
