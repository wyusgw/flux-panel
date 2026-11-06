import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getNodeConfig } from "@/api";

/** 设备管理「查看节点配置」打开的新窗口：直接显示 node/config 接口返回的 JSON */
export default function NodeConfigPage() {
  const [searchParams] = useSearchParams();
  const [response, setResponse] = useState<unknown>(null);
  const [pretty, setPretty] = useState(false);
  const rawId = searchParams.get("id");
  const nodeId = Number(rawId);

  useEffect(() => {
    document.title = `节点配置 #${rawId ?? ""}`;
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      setResponse({ code: -1, msg: "缺少有效的节点 ID", data: null });
      return;
    }
    let cancelled = false;
    getNodeConfig(nodeId)
      .then((res) => { if (!cancelled) setResponse(res); })
      .catch((error) => { if (!cancelled) setResponse({ code: -1, msg: String(error?.message ?? error), data: null }); });
    return () => { cancelled = true; };
  }, [nodeId, rawId]);

  const text = useMemo(() => {
    if (response === null) return "加载中...";
    return JSON.stringify(response, null, pretty ? 2 : undefined);
  }, [response, pretty]);

  return (
    <div className="min-h-screen bg-white text-foreground dark:bg-[#141414]">
      <label className="flex items-center gap-1 border-b border-default-300 bg-default-100 px-1 py-0.5 text-sm">
        美化排版
        <input type="checkbox" checked={pretty} onChange={(e) => setPretty(e.target.checked)} />
      </label>
      <pre className={`p-1 font-mono text-[13px] leading-[15px] ${pretty ? "whitespace-pre" : "whitespace-pre-wrap break-all"}`}>{text}</pre>
    </div>
  );
}
