import { KeyboardEvent, ReactNode, UIEvent, useMemo, useRef } from "react";

const TOKEN = /("(?:\\.|[^"\\])*"(\s*:)?)|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\]])/g;

const highlight = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const color = match[1]
      ? (match[2] ? "text-sky-600 dark:text-sky-300" : "text-orange-600 dark:text-orange-300")
      : match[3]
        ? "text-blue-600 dark:text-blue-400"
        : match[4]
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-amber-600 dark:text-yellow-300";
    nodes.push(<span key={index} className={color}>{match[0]}</span>);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/** 带行号和语法着色的 JSON 编辑器：透明的 textarea 叠在着色层上，两层滚动保持同步 */
export const JsonEditor = ({ value, onChange, ariaLabel, className = "h-[560px]" }: JsonEditorProps) => {
  const gutterRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLPreElement>(null);
  const lineCount = value.split("\n").length;
  const highlighted = useMemo(() => highlight(value), [value]);

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = event.currentTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
    if (layerRef.current) {
      layerRef.current.scrollTop = scrollTop;
      layerRef.current.scrollLeft = scrollLeft;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    event.preventDefault();
    // 弹窗的焦点管理也监听 Tab，不拦住的话光标会跳出编辑器
    event.stopPropagation();
    const target = event.currentTarget;
    target.setRangeText("  ", target.selectionStart, target.selectionEnd, "end");
    onChange(target.value);
  };

  const textClass = "m-0 p-0 font-mono text-[13px] leading-5 whitespace-pre";

  return (
    <div className={`flex overflow-hidden border-t border-default-200 ${className}`}>
      <div ref={gutterRef} aria-hidden="true" className="w-12 flex-shrink-0 select-none overflow-hidden pr-4 text-right font-mono text-[13px] leading-5 text-default-400">
        {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre ref={layerRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden text-foreground ${textClass}`}>{highlighted}{"\n"}</pre>
        <textarea
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          wrap="off"
          className={`absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent text-transparent caret-foreground outline-none selection:bg-primary/30 ${textClass}`}
        />
      </div>
    </div>
  );
};
