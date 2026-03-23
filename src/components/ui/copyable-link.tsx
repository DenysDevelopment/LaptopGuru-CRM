"use client";

import { useState } from "react";

interface CopyableLinkProps {
  url: string;
}

export function CopyableLink({ url }: CopyableLinkProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <code className="text-sm text-brand bg-brand-light px-3 py-1.5 rounded-lg flex-1 truncate">
        {url}
      </code>
      <button
        onClick={handleCopy}
        className="text-xs text-gray-500 hover:text-brand transition-colors whitespace-nowrap"
      >
        {copied ? "Скопировано!" : "Копировать"}
      </button>
    </div>
  );
}
