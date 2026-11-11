import { useRef, useState } from "react";
import { Spinner } from "@heroui/spinner";
import { Card } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { TerminalBox, TERM_TEXT, TERM_DIM, TERM_ERR } from "@/components/terminal-box";

// 转发规则诊断（forward.tsx）与隧道诊断（tunnel.tsx）共用的 TCP ping 诊断结果展示：
// 逐次列出每次连接尝试的结果（终端命令行风格，类似 ping 输出，一行一次），与后端 TcpPingDiagnosisUtil 的数据结构对应。

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

// 终端风格的诊断输出：像命令行里的 ping 一样一行一次，失败的行标红，完整视图末尾附统计

function formatMs(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? '-' : value.toFixed(1);
}

// 某一段诊断的逐次连接尝试明细，渲染成终端输出；旧版节点 Agent 未返回 attempts 明细时，回退显示汇总消息
// maxLines：卡片里只预览前几条，完整明细在点开的详细结果里（不传则全部列出，并附统计）
// boxClassName：追加到终端框上的样式（例如卡片里去掉圆角铺满整块区域）
export function renderDiagnosisLines(result: DiagnosisResultItem, maxLines?: number, boxClassName = '') {
  const addr = `${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`;
  const attempts = result.attempts ?? [];

  const body = (() => {
    if (attempts.length > 0) {
      const shown = maxLines ? attempts.slice(0, maxLines) : attempts;
      const ok = attempts.filter(a => a.success && a.timeMs !== undefined);
      const times = ok.map(a => a.timeMs as number);
      const received = attempts.filter(a => a.success).length;
      const loss = ((attempts.length - received) / attempts.length) * 100;
      return (
        <>
          {shown.map((attempt) => (
            <div key={attempt.seq} className={attempt.success ? TERM_TEXT : TERM_ERR}>
              {attempt.success
                ? `${addr} tcp_seq=${attempt.seq} time=${formatMs(attempt.timeMs)} ms`
                : `${addr} tcp_seq=${attempt.seq} failed${attempt.error ? `: ${attempt.error}` : ''}`}
            </div>
          ))}
          {!maxLines && (
            <div className={`${TERM_TEXT} pt-2`}>
              <div>--- {addr} tcp ping statistics ---</div>
              <div>{attempts.length} attempts, {received} succeeded, {loss.toFixed(0)}% packet loss</div>
              {times.length > 0 && (
                <div>rtt min/avg/max = {formatMs(Math.min(...times))}/{formatMs(times.reduce((a, b) => a + b, 0) / times.length)}/{formatMs(Math.max(...times))} ms</div>
              )}
            </div>
          )}
        </>
      );
    }
    if (result.message) {
      return <div className={result.success ? TERM_TEXT : TERM_ERR}>{result.message}</div>;
    }
    return <div className={TERM_DIM}>no data</div>;
  })();

  return (
    <TerminalBox className={boxClassName}>
      {body}
    </TerminalBox>
  );
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
  const hasAttempts = !!result?.attempts && result.attempts.length > 0;
  return (
    <Modal isOpen={result !== null} onOpenChange={(open) => !open && onClose()} size="lg" backdrop="opaque" placement="center" hideCloseButton>
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
                {!hasAttempts && result.averageTime !== undefined && (
                  <div className="flex justify-between gap-4"><span className="text-default-500">平均延迟</span><span className="font-mono text-foreground">{result.averageTime.toFixed(0)}ms</span></div>
                )}
                {!hasAttempts && result.packetLoss !== undefined && (
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
                <h4 className="text-xs font-semibold text-default-500 mb-1">连接尝试明细</h4>
                <div className="max-h-80 overflow-y-auto rounded-md">
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
// 卡片不用 isPressable（点击时不要按下缩放 / 阴影 / 波纹效果）；HeroUI Card 非 isPressable 时会丢掉 onClick，所以点击放在外层 div 上
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
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(result)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(result); } }}
                className="cursor-pointer outline-none"
              >
              <Card className="shadow-none border border-default-200 overflow-hidden w-full">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-default-100 w-full">
                  <span className="font-semibold text-foreground truncate">{groupName || result.nodeName}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {result.groupId != null && <Chip size="sm" variant="light" color="primary">GID: {result.groupId}</Chip>}
                    {!result.success && <Chip size="sm" variant="light" color="danger">失败</Chip>}
                  </div>
                </div>
                <div className="text-left w-full flex-1 flex">
                  {renderDiagnosisLines(result, PREVIEW_LINES, 'flex-1 rounded-none px-4 py-3')}
                </div>
              </Card>
              </div>
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
