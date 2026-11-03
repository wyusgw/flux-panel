import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import toast from 'react-hot-toast';

import { getNodeList, runLookingGlass } from "@/api";
import { EmptyState } from "@/components/empty-state";

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
  const [result, setResult] = useState<LookingGlassResult | null>(null);

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
    if (!target.trim()) {
      toast.error('请输入目标地址');
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await runLookingGlass({ nodeId, type, target: target.trim() });
      if (res.code === 0) {
        setResult(res.data);
      } else {
        toast.error(res.msg || '诊断失败');
      }
    } catch (error) {
      toast.error('诊断失败，请重试');
    } finally {
      setRunning(false);
    }
  };

  const renderPingResult = (data: PingResultData) => (
    <div className="space-y-1">
      {data.attempts && data.attempts.length > 0 ? (
        <>
          {data.attempts.map((attempt) => (
            <div key={attempt.seq} className="font-mono text-xs text-default-500">
              {attempt.success
                ? `连接 ${attempt.seq}: 来自 ${result?.target} 时间=${attempt.timeMs?.toFixed(0)}ms`
                : `连接 ${attempt.seq}: 来自 ${result?.target} 失败${attempt.error ? `（${attempt.error}）` : ''}`}
            </div>
          ))}
          <div className="text-xs text-default-500 pt-1">
            平均延迟 {data.averageTime !== undefined && data.averageTime >= 0 ? `${data.averageTime.toFixed(0)}ms` : '-'} · 丢包 {data.packetLoss?.toFixed(0) ?? 0}%
          </div>
        </>
      ) : (
        <div className="text-xs text-default-500">{data.errorMessage || (data.success ? 'TCP 连接成功' : '连接失败')}</div>
      )}
    </div>
  );

  const renderRawOutputResult = (data: RawOutputResultData) => (
    <div className="space-y-2">
      {data.errorMessage && (
        <div className="text-xs text-danger">{data.errorMessage}</div>
      )}
      {data.output && (
        <pre className="text-xs font-mono text-default-600 bg-default-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
          {data.output}
        </pre>
      )}
      {!data.output && !data.errorMessage && (
        <div className="text-xs text-default-500">无输出</div>
      )}
    </div>
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
                  <SelectItem key="ping">Ping（TCP 连通性）</SelectItem>
                  <SelectItem key="icmp_ping">ICMP Ping</SelectItem>
                  <SelectItem key="traceroute">Traceroute（路由跟踪）</SelectItem>
                  <SelectItem key="mtr">MTR（路由质量）</SelectItem>
                  <SelectItem key="dns">DNS 查询</SelectItem>
                </Select>

                <Input
                  size="sm"
                  labelPlacement="outside-top"
                  autoComplete="off"
                  label="目标地址"
                  placeholder={TARGET_PLACEHOLDERS[type]}
                  value={target}
                  onValueChange={setTarget}
                  variant="bordered"
                  isDisabled={running}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
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
              诊断结果{result ? `：${result.nodeName} → ${result.target}` : ''}
            </h2>
            {result && (
              <Chip size="sm" variant="light" color={result.data.success ? 'success' : 'danger'}>
                {result.data.success ? '成功' : '失败'}
              </Chip>
            )}
          </CardHeader>
          <CardBody className="px-6 py-5">
            {result ? (
              result.type === 'ping' ? renderPingResult(result.data) : renderRawOutputResult(result.data)
            ) : running ? (
              <div className="flex items-center justify-center gap-3 h-full min-h-[320px]">
                <Spinner size="sm" />
                <span className="text-default-600">正在诊断...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[320px]">
                <EmptyState text="填写左侧信息并开始诊断，结果将显示在这里" />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
