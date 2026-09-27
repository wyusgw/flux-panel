import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";

// 转发规则诊断（forward.tsx）与隧道诊断（tunnel.tsx）共用的 TCP ping 诊断结果展示：
// 逐次列出每次连接尝试的结果（类似 ping 输出，一行一次），与后端 TcpPingDiagnosisUtil 的数据结构对应。

export interface PingAttempt {
  seq: number;
  success: boolean;
  timeMs?: number;
  error?: string;
}

export interface DiagnosisResultItem {
  success: boolean;
  description: string;
  nodeName: string;
  nodeId?: string | number;
  groupId?: number | null;
  leg?: 'inbound' | 'outbound';
  targetIp: string;
  targetPort?: number;
  message?: string;
  averageTime?: number;
  packetLoss?: number;
  dispatchFailed?: boolean;
  recovered?: boolean;
  attempts?: PingAttempt[];
}

export interface DispatchStats {
  sent: number;
  failed: number;
  recovered: number;
}

// 某一段诊断的逐次连接尝试明细；旧版节点 Agent 未返回 attempts 明细时，回退显示汇总消息
export function renderDiagnosisLines(result: DiagnosisResultItem) {
  const addr = `${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`;
  if (result.attempts && result.attempts.length > 0) {
    return (
      <>
        {result.attempts.map((attempt) => (
          <div key={attempt.seq} className="font-mono text-xs text-default-400">
            {attempt.success
              ? `连接 ${attempt.seq}: 来自 ${addr} 时间=${attempt.timeMs?.toFixed(0)}ms`
              : `连接 ${attempt.seq}: 来自 ${addr} 失败${attempt.error ? `（${attempt.error}）` : ''}`}
          </div>
        ))}
        {result.recovered && result.success && (
          <div className="text-xs text-default-500 pt-1">
            平均延迟 {result.averageTime?.toFixed(0)}ms · 丢包 {result.packetLoss?.toFixed(0)}%
          </div>
        )}
      </>
    );
  }
  if (result.message) {
    return <div className="text-xs text-default-400">{result.message}</div>;
  }
  return <div className="text-xs text-default-400">无数据</div>;
}

// 诊断分区：每一段诊断渲染成一张卡片（名称 + 可选 GID），内容逐行展示连接明细
export function DiagnosisLeg({
  title,
  subtitle,
  results,
  emptyText,
  resolveGroupName,
}: {
  title: string;
  subtitle: string;
  results: DiagnosisResultItem[];
  emptyText: string;
  resolveGroupName?: (groupId: number) => string | undefined;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2">
        {title} <span className="text-default-400 font-normal">({subtitle})</span>
      </h3>
      {results.length === 0 ? (
        <div className="text-xs text-default-400 border border-default-200 rounded-lg px-4 py-3">{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {results.map((result, index) => {
            const groupName = result.groupId != null ? resolveGroupName?.(result.groupId) : undefined;
            return (
              <Card key={index} className="shadow-sm border border-default-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-default-100">
                  <span className="font-semibold text-foreground truncate">{groupName || result.nodeName}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {result.groupId != null && <Chip size="sm" variant="flat" color="primary">GID: {result.groupId}</Chip>}
                    {!result.success && <Chip size="sm" variant="flat" color="danger">失败</Chip>}
                  </div>
                </div>
                <div className="px-4 py-3 space-y-1">
                  {renderDiagnosisLines(result)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 面板反馈：诊断请求的发出/失败/回收统计
export function DiagnosisPanelFeedback({ stats }: { stats?: DispatchStats }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2">
        面板反馈 <span className="text-default-400 font-normal">(Backend)</span>
      </h3>
      <div className="border border-default-200 rounded-lg px-4 py-3 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-default-500">发出任务</span><span className="font-mono text-foreground">{stats?.sent ?? 0}</span></div>
        <div className="flex justify-between"><span className="text-default-500">发出失败</span><span className="font-mono text-foreground">{stats?.failed ?? 0}</span></div>
        <div className="flex justify-between"><span className="text-default-500">回收任务</span><span className="font-mono text-foreground">{stats?.recovered ?? 0}</span></div>
      </div>
    </div>
  );
}
