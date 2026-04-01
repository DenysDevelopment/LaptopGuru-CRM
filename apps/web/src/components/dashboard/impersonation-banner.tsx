"use client";

import { useSession } from "next-auth/react";

export function ImpersonationBanner() {
  const { data: session } = useSession();
  const user = session?.user as Record<string, unknown> | undefined;
  const impersonating = user?.impersonating as boolean | undefined;
  const companyId = user?.companyId as string | undefined;

  if (!impersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black px-4 py-2 flex items-center justify-between text-sm font-medium shadow-md">
      <span>
        👁 Просмотр компании: <strong>{companyId}</strong>
      </span>
      <a
        href="/super-admin/companies"
        className="bg-black text-white px-3 py-1 rounded text-xs hover:bg-gray-800 transition-colors"
      >
        Выйти из просмотра →
      </a>
    </div>
  );
}
