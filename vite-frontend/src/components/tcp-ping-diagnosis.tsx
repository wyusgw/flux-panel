import { useRef, useState } from "react";
import { Spinner } from "@heroui/spinner";
import { Card } from "@heroui/card";
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
    return <div className={TERM_DIM}>无数据</div>;
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
              // 只显示连接尝试明细，终端框铺满整个弹窗内容区，内容过多时在框内滚动
              <div className="max-h-[60vh] overflow-y-auto rounded-md">
                {renderDiagnosisLines(result, undefined, 'min-h-[200px]')}
              </div>
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

// 卡片右上角的小标签：细边框 + 浅色底（GID、失败）
const LegTag = ({ color, children }: { color: 'primary' | 'danger'; children: React.ReactNode }) => (
  <span className={`inline-flex items-center h-5 px-1.5 rounded border text-xs leading-none whitespace-nowrap ${color === 'primary' ? 'text-primary border-primary/40 bg-primary/10' : 'text-danger border-danger/40 bg-danger/10'}`}>{children}</span>
);

// 诊断分区：每一段诊断渲染成一张卡片（名称 + 可选 GID），内容逐行展示连接明细；点击卡片可查看详细结果
// 卡片不用 isPressable（点击时不要按下缩放 / 阴影 / 波纹效果）；HeroUI Card 非 isPressable 时会丢掉 onClick，所以点击放在外层 div 上
export function DiagnosisLeg({
  title,
  subtitle,
  results,
  emptyText = '无数据',
  resolveGroupName,
  loadDetail,
  placeholder,
}: {
  title: string;
  subtitle: string;
  results: DiagnosisResultItem[];
  emptyText?: string;
  resolveGroupName?: (groupId: number) => string | undefined;
  /** 这一段没有任何结果时，仍显示一张对应设备组的卡片（名称 + GID），内容为「无数据」 */
  placeholder?: { name: string; groupId?: number | null };
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
      <h3 className="text-base font-semibold text-foreground mb-2">{title} ({subtitle})</h3>
      {results.length === 0 && placeholder ? (
        <div className="border border-default-200 bg-default-50 rounded-md overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-default-200">
            <span className="text-sm font-semibold text-foreground truncate">{placeholder.name}</span>
            {placeholder.groupId != null && <LegTag color="primary">GID: {placeholder.groupId}</LegTag>}
          </div>
          <div className="px-3 py-2 text-sm text-default-500">{emptyText}</div>
        </div>
      ) : results.length === 0 ? (
        <div className="text-sm text-default-500 border border-default-200 bg-default-50 rounded-md px-3 py-2">{emptyText}</div>
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
              <Card className="shadow-none border border-default-200 bg-default-50 rounded-md overflow-hidden w-full">
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-default-200 w-full">
                  <span className="text-sm font-semibold text-foreground truncate">{groupName || result.nodeName}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!result.success && <LegTag color="danger">失败</LegTag>}
                    {result.groupId != null && <LegTag color="primary">GID: {result.groupId}</LegTag>}
                  </div>
                </div>
                {/* 没有任何明细和消息时，直接在卡片里显示「无数据」，不用黑色终端框 */}
                {(result.attempts ?? []).length === 0 && !result.message ? (
                  <div className="px-3 py-2 text-left text-sm text-default-500">无数据</div>
                ) : (
                  <div className="text-left w-full flex-1 flex">
                    {renderDiagnosisLines(result, PREVIEW_LINES, 'flex-1 rounded-none px-3 py-2')}
                  </div>
                )}
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
      <h3 className="text-base font-semibold text-foreground mb-2">面板反馈 (Backend)</h3>
      {/* 等宽字体逐行显示：标签后直接跟数字 */}
      <div className="border border-default-200 bg-default-50 rounded-md px-3 py-2 font-mono text-sm leading-relaxed text-foreground">
        <div>发出任务 {stats?.sent ?? 0}</div>
        <div>发出失败 {stats?.failed ?? 0}</div>
        <div>回收任务 {stats?.recovered ?? 0}</div>
      </div>
    </div>
  );
}
