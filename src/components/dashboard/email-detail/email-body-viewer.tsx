"use client";

import { useRef, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";

export function EmailBodyViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sanitizedHtml = useMemo(() => {
    if (typeof window === "undefined") return html;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br", "b", "i", "u", "em", "strong", "a", "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "table", "thead",
        "tbody", "tr", "td", "th", "img", "hr", "blockquote", "pre", "code",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "width", "height", "target", "rel"],
      ALLOW_DATA_ATTR: false,
    });
  }, [html]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const resize = () => {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        iframe.style.height = `${doc.body.scrollHeight + 20}px`;
      }
    };

    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-500">Тело письма</h3>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={sanitizedHtml}
        sandbox="allow-same-origin"
        className="w-full border-0"
        style={{ minHeight: 200 }}
      />
    </div>
  );
}
