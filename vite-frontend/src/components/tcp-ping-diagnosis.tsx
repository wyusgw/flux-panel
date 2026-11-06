import { useRef, useState } from "react";
import { Spinner } from "@heroui/spinner";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";

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
  timestamp?: number;
}

export interface DispatchStats {
  sent: number;
  failed: number;
  recovered: number;
}

// 某一段诊断的逐次连接尝试明细；旧版节点 Agent 未返回 attempts 明细时，回退显示汇总消息
// maxLines：卡片里只预览前几条，完整明细在点开的详细结果里（不传则全部列出）
export function renderDiagnosisLines(result: DiagnosisResultItem, maxLines?: number) {
  const addr = `${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`;
  if (result.attempts && result.attempts.length > 0) {
    return (
      <>
        {(maxLines ? result.attempts.slice(0, maxLines) : result.attempts).map((attempt) => (
          <div key={attempt.seq} className="font-mono text-xs text-default-400">
            {attempt.success
              ? `连接 ${attempt.seq}: 来自 ${addr} 时间=${attempt.timeMs?.toFixed(0)}ms`
              : `连接 ${attempt.seq}: 来自 ${addr} 失败${attempt.error ? `（${attempt.error}）` : ''}`}
          </div>
        ))}
        {maxLines && result.attempts.length > maxLines && (
          <div className="text-xs text-default-400 pt-1">共 {result.attempts.length} 条，点击查看详细结果</div>
        )}
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

// 详细结果弹窗：点击某一条诊断结果时展示完整信息（含目标地址、描述、消息、时间等卡片上未直接展示的字段）
function DiagnosisDetailModal({
  result,
  displayName,
  onClose,
  loading = false,
}: {
  result: DiagnosisResultItem | null;
  displayName: string;
  onClose: () => void;
  /** 正在按「诊断详情连接次数」重新测试：期间只显示加载提示，测完用新结果替换 */
  loading?: boolean;
}) {
  const addr = result ? `${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}` : '';
  return (
    <Modal isOpen={result !== null} onOpenChange={(open) => !open && onClose()} size="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {result && (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-bold truncate">{displayName}</h3>
              <span className="text-small text-default-500">详细诊断结果</span>
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex items-center justify-center gap-3 py-16">
                  <Spinner size="sm" />
                  <span className="text-default-600">正在按详情次数重新测试...</span>
                </div>
              ) : (
              <>
              <div className="space-y-1 text-sm mb-3">
                <div className="flex justify-between gap-4"><span className="text-default-500">状态</span>
                  <Chip size="sm" variant="light" color={result.success ? 'success' : 'danger'}>{result.success ? '成功' : '失败'}</Chip>
                </div>
                {result.description && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">描述</span><span className="text-foreground text-right">{result.description}</span></div>
                )}
                <div className="flex justify-between gap-4"><span className="text-default-500">目标地址</span><span className="font-mono text-foreground">{addr}</span></div>
                {result.averageTime !== undefined && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">平均延迟</span><span className="font-mono text-foreground">{result.averageTime.toFixed(0)}ms</span></div>
                )}
                {result.packetLoss !== undefined && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">丢包率</span><span className="font-mono text-foreground">{result.packetLoss.toFixed(0)}%</span></div>
                )}
                {result.message && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">消息</span><span className="text-foreground text-right">{result.message}</span></div>
                )}
                {result.timestamp && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">时间</span><span className="font-mono text-foreground">{new Date(result.timestamp).toLocaleString()}</span></div>
                )}
                {result.dispatchFailed && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">下发状态</span><Chip size="sm" variant="light" color="danger">下发失败</Chip></div>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-default-500 mb-1">连接尝试明细{result.attempts && result.attempts.length > 0 ? `（共 ${result.attempts.length} 条）` : ''}</h4>
                <div className="border border-default-200 rounded-lg px-4 py-3 space-y-1 max-h-80 overflow-y-auto">
                  {renderDiagnosisLines(result)}
                </div>
              </div>
              </>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>关闭</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

const PREVIEW_LINES = 5;

// 诊断分区：每一段诊断渲染成一张卡片（名称 + 可选 GID），内容逐行展示连接明细；点击卡片可查看详细结果
export function DiagnosisLeg({
  title,
  subtitle,
  results,
  emptyText = '无数据',
  resolveGroupName,
  loadDetail,
}: {
  title: string;
  subtitle: string;
  results: DiagnosisResultItem[];
  emptyText?: string;
  resolveGroupName?: (groupId: number) => string | undefined;
  /**
   * 点开某一段的详细结果时，对这一段按「诊断详情连接次数」重新测试并返回新结果（失败返回 null，继续显示首次诊断的结果）。
   * 不传则直接展示首次诊断的明细，不重新测试
   */
  loadDetail?: (result: DiagnosisResultItem) => Promise<DiagnosisResultItem | null>;
}) {
  const [selected, setSelected] = useState<DiagnosisResultItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // 连续点开不同卡片、或测试途中关闭时，丢弃过期的返回结果
  const requestToken = useRef(0);

  const openDetail = async (result: DiagnosisResultItem) => {
    const token = ++requestToken.current;
    setSelected(result);
    // 没有目标端口的结果（例如整次诊断失败时前端自造的占位结果）没法单独重测
    if (!loadDetail || !result.targetPort) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const fresh = await loadDetail(result);
      if (token === requestToken.current && fresh) setSelected(fresh);
    } finally {
      if (token === requestToken.current) setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    requestToken.current++;
    setSelected(null);
    setDetailLoading(false);
  };

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
              <Card
                key={index}
                isPressable
                onPress={() => openDetail(result)}
                className="shadow-sm border border-default-200 overflow-hidden w-full cursor-pointer"
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-default-100 w-full">
                  <span className="font-semibold text-foreground truncate">{groupName || result.nodeName}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {result.groupId != null && <Chip size="sm" variant="light" color="primary">GID: {result.groupId}</Chip>}
                    {!result.success && <Chip size="sm" variant="light" color="danger">失败</Chip>}
                  </div>
                </div>
                <div className="px-4 py-3 space-y-1 text-left w-full">
                  {renderDiagnosisLines(result, PREVIEW_LINES)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <DiagnosisDetailModal
        result={selected}
        displayName={selected ? ((selected.groupId != null && resolveGroupName?.(selected.groupId)) || selected.nodeName) : ''}
        onClose={closeDetail}
        loading={detailLoading}
      />
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
