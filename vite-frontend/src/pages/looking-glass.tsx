import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import toast from 'react-hot-toast';

import { getNodeList, runLookingGlass } from "@/api";
import { EmptyState } from "@/components/empty-state";
import { TerminalBox, TERM_TEXT, TERM_DIM, TERM_ERR } from "@/components/terminal-box";
import { renderDiagnosisLines } from "@/components/tcp-ping-diagnosis";

interface NodeOption {
  id: number;
  name: string;
  status: number; // 1: 在线, 0: 离线
}

interface PingAttempt {
  seq: number;
  success: boolean;
  timeMs?: number;
  error?: string;
}

interface PingResultData {
  success: boolean;
  averageTime?: number;
  packetLoss?: number;
  errorMessage?: string;
  attempts?: PingAttempt[];
}

interface RawOutputResultData {
  host: string;
  success: boolean;
  output?: string;
  errorMessage?: string;
}

interface LookingGlassResult {
  nodeId: number;
  nodeName: string;
  type: DiagnosisType;
  target: string;
  data: PingResultData & RawOutputResultData;
}

type DiagnosisType = 'ping' | 'traceroute' | 'mtr' | 'dns' | 'icmp_ping';

interface TargetRun {
  target: string;
  status: 'pending' | 'running' | 'done';
  result?: LookingGlassResult;
  error?: string;
}

// 一次最多诊断的目标数：后端一次只诊断一个目标，这里逐个发起，限制数量避免长时间占用节点
const MAX_TARGETS = 10;

// 目标按换行、逗号、分号或空格拆分，去掉空项和重复项
const parseTargets = (text: string): string[] =>
  Array.from(new Set(text.split(/[\s,;，；]+/).map(t => t.trim()).filter(Boolean)));

const TARGET_PLACEHOLDERS: Record<DiagnosisType, string> = {
  ping: 'example.com:443 或 1.2.3.4（不填端口默认 80）',
  traceroute: 'example.com 或 1.2.3.4',
  mtr: 'example.com 或 1.2.3.4',
  dns: 'example.com',
  icmp_ping: 'example.com 或 1.2.3.4',
};

export default function LookingGlassPage() {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [type, setType] = useState<DiagnosisType>('ping');
  const [target, setTarget] = useState('');
  const [running, setRunning] = useState(false);
  // 每个目标一项：按顺序逐个诊断，诊断完一个显示一个
  const [items, setItems] = useState<TargetRun[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getNodeList();
        if (res.code === 0) {
          setNodes(res.data || []);
        }
      } catch {
        // 忽略，下方列表为空时会提示无节点
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRun = async () => {
    if (!nodeId) {
      toast.error('请选择发起诊断的节点');
      return;
    }
    const targets = parseTargets(target);
    if (targets.length === 0) {
      toast.error('请输入目标地址');
      return;
    }
    if (targets.length > MAX_TARGETS) {
      toast.error(`一次最多诊断 ${MAX_TARGETS} 个目标`);
      return;
    }
    setRunning(true);
    const runs: TargetRun[] = targets.map(t => ({ target: t, status: 'pending' }));
    setItems(runs);
    const update = (index: number, patch: Partial<TargetRun>) => {
      runs[index] = { ...runs[index], ...patch };
      setItems([...runs]);
    };
    try {
      for (let i = 0; i < targets.length; i++) {
        update(i, { status: 'running' });
        try {
          const res = await runLookingGlass({ nodeId, type, target: targets[i] });
          if (res.code === 0) {
            update(i, { status: 'done', result: res.data });
          } else {
            update(i, { status: 'done', error: res.msg || '诊断失败' });
          }
        } catch (error) {
          update(i, { status: 'done', error: '诊断失败，请重试' });
        }
      }
    } finally {
      setRunning(false);
    }
  };

  // 目标形如 example.com:443 / 1.2.3.4（不填端口默认 80）；拆成地址和端口，用与转发诊断相同的终端 ping 样式展示
  const splitTarget = (value: string): { host: string; port: number } => {
    const m = value.match(/^(.*):(\d{1,5})$/);
    return m && !m[1].includes(':') ? { host: m[1], port: Number(m[2]) } : { host: value, port: 80 };
  };

  const renderPingResult = (data: PingResultData, targetText: string) => {
    const { host, port } = splitTarget(targetText);
    return renderDiagnosisLines({
      success: data.success,
      description: '',
      nodeName: '',
      targetIp: host,
      targetPort: port,
      attempts: data.attempts,
      message: data.errorMessage || (data.success ? 'TCP 连接成功' : '连接失败'),
    });
  };

  // traceroute / mtr / dns / icmp ping 本来就是命令行输出，原样放进终端框，保留列对齐
  const renderRawOutputResult = (data: RawOutputResultData) => (
    <TerminalBox className="max-h-96 overflow-y-auto">
      {data.errorMessage && <div className={TERM_ERR}>{data.errorMessage}</div>}
      {data.output && <div className={TERM_TEXT}>{data.output}</div>}
      {!data.output && !data.errorMessage && <div className={TERM_DIM}>no output</div>}
    </TerminalBox>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-default-600">正在加载...</span>
        </div>
      </div>
    );
  }

  // 与仪表盘、队列监控一致：不单独放页面标题，两张卡片直接开头，卡片标题栏（小号粗体标题 + 分隔线）说明用途
  return (
    <div className="management-page px-4 lg:px-6 py-5 lg:py-6">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
        <Card className="management-table-card" shadow="none">
          <CardHeader className="px-6 py-4 border-b border-default-100">
            <h2 className="text-sm font-semibold">发起诊断</h2>
          </CardHeader>
          <CardBody className="px-6 py-5 space-y-4">
            {nodes.length === 0 ? (
              <EmptyState text="暂无可用节点" />
            ) : (
              <>
                <Select
                  size="sm"
                  labelPlacement="outside-top"
                  label="发起节点"
                  placeholder="请选择发起诊断的节点"
                  listboxProps={{ emptyContent: <EmptyState compact /> }}
                  selectedKeys={nodeId ? [nodeId.toString()] : []}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0] as string;
                    if (selectedKey) {
                      setNodeId(parseInt(selectedKey));
                    }
                  }}
                  variant="bordered"
                  isDisabled={running}
                >
                  {nodes.map((node) => (
                    <SelectItem
                      key={node.id}
                      textValue={`${node.name} (${node.status === 1 ? '在线' : '离线'})`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{node.name}</span>
                        <Chip color={node.status === 1 ? 'success' : 'danger'} variant="light" size="sm">
                          {node.status === 1 ? '在线' : '离线'}
                        </Chip>
                      </div>
                    </SelectItem>
                  ))}
                </Select>

                <Select
                  size="sm"
                  labelPlacement="outside-top"
                  label="诊断类型"
                  listboxProps={{ emptyContent: <EmptyState compact /> }}
                  selectedKeys={[type]}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0] as DiagnosisType;
                    if (selectedKey) {
                      setType(selectedKey);
                    }
                  }}
                  variant="bordered"
                  isDisabled={running}
                  disallowEmptySelection
                >
                  <SelectItem key="ping">TCP Ping</SelectItem>
                  <SelectItem key="icmp_ping">ICMP Ping</SelectItem>
                  <SelectItem key="traceroute">Traceroute</SelectItem>
                  <SelectItem key="mtr">MTR</SelectItem>
                  <SelectItem key="dns">DNS 查询</SelectItem>
                </Select>

                <Textarea
                  size="sm"
                  labelPlacement="outside-top"
                  autoComplete="off"
                  label="目标地址"
                  placeholder={`${TARGET_PLACEHOLDERS[type]}，可填多个，一行一个`}
                  value={target}
                  onValueChange={setTarget}
                  variant="bordered"
                  isDisabled={running}
                  disableAutosize
                  rows={3}
                  classNames={{ input: 'resize-y min-h-[4.5rem]' }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRun(); }}
                />

                <div className="flex justify-end pt-1">
                  <Button size="sm" color="primary" onPress={handleRun} isLoading={running}>
                    开始诊断
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card className="management-table-card lg:min-h-[420px]" shadow="none">
          <CardHeader className="px-6 py-4 border-b border-default-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold min-w-0 truncate">
              诊断结果{items.length === 1 && items[0].result ? `：${items[0].result.nodeName} → ${items[0].target}` : ''}
            </h2>
            {items.length === 1 && items[0].status === 'done' && (
              <Chip size="sm" variant="light" color={items[0].result?.data.success ? 'success' : 'danger'}>
                {items[0].result?.data.success ? '成功' : '失败'}
              </Chip>
            )}
          </CardHeader>
          <CardBody className="px-6 py-5">
            {items.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[320px]">
                <EmptyState text="填写左侧信息并开始诊断，结果将显示在这里" />
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.target} className="space-y-2">
                    {items.length > 1 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-foreground min-w-0 truncate">
                          {item.result ? `${item.result.nodeName} → ${item.target}` : item.target}
                        </span>
                        {item.status === 'done' && (
                          <Chip size="sm" variant="light" color={item.result?.data.success ? 'success' : 'danger'}>
                            {item.result?.data.success ? '成功' : '失败'}
                          </Chip>
                        )}
                      </div>
                    )}
                    {item.status === 'pending' ? (
                      <div className="text-xs text-default-400">等待诊断...</div>
                    ) : item.status === 'running' ? (
                      <div className="flex items-center gap-3 py-2">
                        <Spinner size="sm" />
                        <span className="text-default-600 text-sm">正在诊断 {item.target}...</span>
                      </div>
                    ) : item.result ? (
                      item.result.type === 'ping' ? renderPingResult(item.result.data, item.result.target) : renderRawOutputResult(item.result.data)
                    ) : (
                      <TerminalBox><div className={TERM_ERR}>{item.error}</div></TerminalBox>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
