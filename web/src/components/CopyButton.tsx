import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch { /* clipboard unavailable */ }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, lang = "html" }: { code: string; lang?: string }) {
  return (
    <div className="code" data-lang={lang}>
      <div className="copy"><CopyButton text={code} /></div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
