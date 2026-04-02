"use client";

import { signOut } from "next-auth/react";

interface SuperAdminNavActionsProps {
  email: string;
}

export function SuperAdminNavActions({ email }: SuperAdminNavActionsProps) {
  return (
    <div className="flex items-center gap-4">
      {email && (
        <span className="text-gray-400 text-sm hidden sm:block">{email}</span>
      )}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        Выйти
      </button>
    </div>
  );
}
