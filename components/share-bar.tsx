"use client";

import { useState } from "react";

function absoluteUrl(url: string) {
  if (url.startsWith("http")) return url;
  return `${window.location.origin}${url}`;
}

export function ShareBar({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="action-row no-print">
      <button
        className="button secondary"
        type="button"
        onClick={() => {
          const share = `${text} ${absoluteUrl(url)}`;
          window.open(`https://wa.me/?text=${encodeURIComponent(share)}`, "_blank", "noopener,noreferrer");
        }}
      >
        Share on WhatsApp
      </button>
      <button
        className="button secondary"
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(absoluteUrl(url));
          setCopied(true);
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
