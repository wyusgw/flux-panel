import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@heroui/button';
import axios from 'axios';
import { getDeviceGroupList, getNodeList, getUserGroupNames, getNodeGroupNames } from '@/api';
import { ThemeSwitch } from '@/components/theme-switch';
import { isAdmin } from '@/utils/auth';
import 'flag-icons/css/flag-icons.min.css';

const UploadIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 20 20">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 16V4M5 9l5-5 5 5" />
  </svg>
);
const DownloadIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 20 20">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 4v12M5 11l5 5 5-5" />
  </svg>
);

type Node = {
  id: number; name: string; ip?: string; serverIp?: string; status?: number; version?: string; portSta?: number; portEnd?: number;
  nodeGroupIds?: number[];
  connectionStatus?: 'online' | 'offline';
  systemInfo?: {
    cpuUsage: number; cpuModel?: string;
    memoryUsage: number; memoryTotal?: number; memoryUsed?: number; memoryAvailable?: number;
    storageUsage: number; storageTotal?: number; storageUsed?: number; storageFree?: number;
    uploadTraffic: number; downloadTraffic: number; uploadSpeed: number; downloadSpeed: number;
    inboundTcpConnections?: number; outboundTcpConnections?: number;
    inboundUdpConnections?: number; outboundUdpConnections?: number;
    uptime: number;
  } | null;
};
type DeviceGroup = { id: number; name: string; nodeId: number; nodeName?: string; node?: Node; userGroupIds?: number[]; ownerUserId?: number | null; singleTunnelGroupName?: string | null; ratio?: number; remark?: string; hideInProbe?: number };
type UserGroup = { id: number; name: string };
type NodeGroup = { id: number; name: string };

const formatBytes = (value = 0) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(2)} MB` : `${(value / 1024).toFixed(2)} KB`;
const formatSpeed = (value = 0) => `${formatBytes(value)}/s`;
const formatUptime = (value = 0) => {
  if (value >= 86400) return `${Math.floor(value / 86400)} 天`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(value / 3600))}:${pad(Math.floor(value % 3600 / 60))}:${pad(Math.floor(value % 60))}`;
};
const meterTone = (value?: number) => value === undefined ? 'idle' : value >= 80 ? 'danger' : value >= 50 ? 'warning' : 'safe';
const RegionCell = ({ code }: { code?: string }) => code ? <span className={`fi fi-${code} fis probe-flag`} /> : null;

// 可点击/悬停查看详情的一行 popover 内容
const PopRow = ({ children }: { children: React.ReactNode }) => <div className="probe-node-popover-row">{children}</div>;

// 各个详情 popover 的内容，都在父组件里做成纯函数，而不是在 NodeRow 里算好、把算出来的 JSX
// 当"快照"存进 state——那样的话，弹窗打开着的时候节点数据再更新（CPU/RAM/连接数变化、上下线等），
// 弹窗内容也不会跟着变，得关掉重开才能看到新的。现在父组件每次渲染都用最新的 nodes 数据重新算一遍，
// 哪个弹窗开着，内容就跟着 WebSocket 推送实时刷新，交互方式（点击/悬停才展开）本身不变
const buildStatusContent = (node: Node, groupMeta: DeviceGroup | undefined, effectiveAdmin: boolean, userGroupNames: (ids?: number[]) => string) => {
  const isOnline = node.connectionStatus === 'online';
  return effectiveAdmin ? (
    <>
      <PopRow><b>{node.name}</b></PopRow>
      <PopRow>服务器：{node.serverIp || '—'}</PopRow>
      <PopRow>入口：{node.ip || '—'}</PopRow>
      <PopRow>端口：{node.portSta ?? '—'} - {node.portEnd ?? '—'}</PopRow>
      <PopRow>可见用户组：{userGroupNames(groupMeta?.userGroupIds)}</PopRow>
      <PopRow>流量倍率：{groupMeta?.ratio ?? '—'}</PopRow>
      <PopRow>备注：{groupMeta?.remark || '—'}</PopRow>
    </>
  ) : (
    <>
      <PopRow><b>{node.name}</b></PopRow>
      <PopRow>服务器：{node.serverIp || '—'}</PopRow>
      <PopRow>流量倍率：{groupMeta?.ratio ?? '—'}</PopRow>
      <PopRow>状态：{isOnline ? '在线' : '离线'}</PopRow>
    </>
  );
};
const buildCpuContent = (node: Node) => (
  <>
    <PopRow><b>CPU</b></PopRow>
    <PopRow>型号：{node.systemInfo?.cpuModel || '暂无型号信息'}</PopRow>
    <PopRow>使用率：{node.systemInfo?.cpuUsage !== undefined ? `${node.systemInfo.cpuUsage.toFixed(1)}%` : '—'}</PopRow>
  </>
);
const buildRamContent = (node: Node) => (
  <>
    <PopRow><b>RAM</b></PopRow>
    <PopRow>已用：{formatBytes(node.systemInfo?.memoryUsed)}</PopRow>
    <PopRow>剩余：{formatBytes(node.systemInfo?.memoryAvailable)}</PopRow>
    <PopRow>总量：{formatBytes(node.systemInfo?.memoryTotal)}</PopRow>
  </>
);
const buildStorageContent = (node: Node) => (
  <>
    <PopRow>已用：{formatBytes(node.systemInfo?.storageUsed)}</PopRow>
    <PopRow>剩余：{formatBytes(node.systemInfo?.storageFree)}</PopRow>
    <PopRow>总量：{formatBytes(node.systemInfo?.storageTotal)}</PopRow>
  </>
);
const buildReceiveConnContent = (node: Node) => (
  <>
    <PopRow><b>接收当前连接数</b></PopRow>
    <PopRow>TCP：{node.systemInfo?.inboundTcpConnections ?? '—'}</PopRow>
    <PopRow>UDP：{node.systemInfo?.inboundUdpConnections ?? '—'}</PopRow>
  </>
);
const buildSendConnContent = (node: Node) => (
  <>
    <PopRow><b>发送当前连接数</b></PopRow>
    <PopRow>TCP：{node.systemInfo?.outboundTcpConnections ?? '—'}</PopRow>
    <PopRow>UDP：{node.systemInfo?.outboundUdpConnections ?? '—'}</PopRow>
  </>
);

type DetailHandlers = {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
};

interface NodeRowProps {
  node: Node;
  regionCode?: string;
  detailHandlers: (key: string) => DetailHandlers;
}

// 每个节点每 2 秒推送一次系统信息，之前整张表都在一个大 .map() 里内联渲染，
// 任何一个节点的数据更新都会导致所有行重新渲染，节点一多就会看起来卡顿。
// 拆成独立的 memo 组件后，某个节点更新时只有它自己这一行会重渲染。
const NodeRow = memo(function NodeRow({ node, regionCode, detailHandlers }: NodeRowProps) {
  const isOnline = node.connectionStatus === 'online';
  // 节点离线时没有实时数据，连接数/CPU/RAM/存储的详情卡片没有意义，
  // 只在在线时才可点击查看，离线时不挂载点击/悬停处理器
  const onlineOnlyHandlers = (key: string) => isOnline ? detailHandlers(key) : {};

  return (
    <tr>
      <td>
        <span className={`probe-status probe-clickable ${isOnline ? 'online' : ''}`} {...detailHandlers(`status-${node.id}`)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={isOnline ? '在线' : '离线'}>
            <circle cx="12" cy="12" r="10" />
            {isOnline ? <path d="M7.8 12.3l2.9 2.9 5.5-5.7" /> : <path d="M9 9l6 6M15 9l-6 6" />}
          </svg>
        </span>
      </td>
      <td><RegionCell code={regionCode} /></td>
      <td><RegionCell /></td>
      <td className={isOnline ? 'probe-clickable' : ''} {...onlineOnlyHandlers(`conn-recv-${node.id}`)}>{formatSpeed(node.systemInfo?.uploadSpeed)}</td>
      <td className={isOnline ? 'probe-clickable' : ''} {...onlineOnlyHandlers(`conn-send-${node.id}`)}>{formatSpeed(node.systemInfo?.downloadSpeed)}</td>
      <td className="probe-uptime">{node.systemInfo ? formatUptime(node.systemInfo.uptime) : ''}</td>
      <td className="probe-pair"><span>{formatBytes(node.systemInfo?.uploadTraffic)} <UploadIcon className="w-3 h-3 inline-block align-middle" /></span><span>{formatBytes(node.systemInfo?.downloadTraffic)} <DownloadIcon className="w-3 h-3 inline-block align-middle" /></span></td>
      <td>
        <div className={`probe-meter probe-meter-${meterTone(node.systemInfo?.cpuUsage)} ${isOnline ? 'probe-clickable' : ''}`} {...onlineOnlyHandlers(`cpu-${node.id}`)}>
          <span style={{ width: `${Math.min(node.systemInfo?.cpuUsage || 0, 100)}%` }} /> <b>{node.systemInfo?.cpuUsage === undefined ? '' : `${node.systemInfo.cpuUsage.toFixed(1)}%`}</b>
        </div>
      </td>
      <td>
        <div className={`probe-meter probe-meter-${meterTone(node.systemInfo?.memoryUsage)} ${isOnline ? 'probe-clickable' : ''}`} {...onlineOnlyHandlers(`ram-${node.id}`)}>
          <span style={{ width: `${Math.min(node.systemInfo?.memoryUsage || 0, 100)}%` }} /> <b>{node.systemInfo?.memoryUsage === undefined ? '' : `${node.systemInfo.memoryUsage.toFixed(1)}%`}</b>
        </div>
      </td>
      <td>
        <div className={`probe-meter probe-meter-${meterTone(node.systemInfo?.storageUsage)} ${isOnline ? 'probe-clickable' : ''}`} {...onlineOnlyHandlers(`storage-${node.id}`)}>
          <span style={{ width: `${Math.min(node.systemInfo?.storageUsage || 0, 100)}%` }} /> <b>{node.systemInfo?.storageUsage === undefined ? '' : `${node.systemInfo.storageUsage.toFixed(1)}%`}</b>
        </div>
      </td>
    </tr>
  );
});

export default function NodeProbePage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  // 管理员专用：临时切换成普通用户视角预览节点状态页，不影响实际权限
  const [viewAsUser, setViewAsUser] = useState(false);
  const effectiveAdmin = admin && !viewAsUser;
  const [nodes, setNodes] = useState<Node[]>([]); const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [regionCodes, setRegionCodes] = useState<Record<string, string>>({});

  // 状态图标点击/悬停的详情 popover：只记 key（标识是哪个节点）和定位信息，内容在渲染时用
  // buildStatusContent 现算，而不是在打开那一刻把内容存成快照——这样弹窗开着的时候如果节点状态
  // 更新了（比如离线/上线），能跟着刷新，不用关掉重开才看得到新数据
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detailRect, setDetailRect] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const [detailPinned, setDetailPinned] = useState(false);

  const resolvedIpsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nodeResponse, groupResponse, userGroupResponse, nodeGroupResponse] = await Promise.all([getNodeList(), getDeviceGroupList(), getUserGroupNames(), getNodeGroupNames()]);
      const deviceGroups: DeviceGroup[] = groupResponse.code === 0 ? (groupResponse.data || []) : [];
      const nodesById = new Map<number, Node>();
      if (nodeResponse.code === 0) (nodeResponse.data || []).forEach((node: Node) => nodesById.set(node.id, node));
      deviceGroups.forEach(group => { if (group.node) nodesById.set(group.node.id, { ...group.node, ...nodesById.get(group.node.id) }); });
      setNodes(Array.from(nodesById.values()).map(node => ({ ...node, connectionStatus: node.status === 1 ? 'online' : 'offline', systemInfo: null })));
      if (groupResponse.code === 0) setGroups(deviceGroups);
      if (userGroupResponse.code === 0) setUserGroups(userGroupResponse.data || []);
      if (nodeGroupResponse.code === 0) setNodeGroups(nodeGroupResponse.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => { setDetailKey(null); setDetailRect(null); setDetailPinned(false); }, []);

  // 移动端窄屏下，弹出的详情卡片若直接贴着触发元素的左边缘定位，很容易超出屏幕右边界被切掉一半，
  // 这里在卡片实际渲染出尺寸后，按视口边界纠正一次位置（水平不超出左右边界，垂直放不下时改往上弹）
  useLayoutEffect(() => {
    if (!detailKey || !detailRect || !popoverRef.current) return;
    const el = popoverRef.current;
    const margin = 8;
    const rect = el.getBoundingClientRect();

    let left = detailRect.left;
    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (left < margin) left = margin;

    let top = detailRect.bottom + margin;
    if (top + rect.height > window.innerHeight - margin) {
      const above = detailRect.top - rect.height - margin;
      top = above > margin ? above : margin;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [detailKey, detailRect]);

  useEffect(() => {
    if (!detailPinned) return;
    document.addEventListener('click', closeDetail);
    window.addEventListener('scroll', closeDetail, true);
    return () => { document.removeEventListener('click', closeDetail); window.removeEventListener('scroll', closeDetail, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailPinned]);

  const userGroupNames = useCallback((ids?: number[]) => !ids || ids.length === 0 ? '所有用户可见' : ids.map(id => userGroups.find(g => g.id === id)?.name || `#${id}`).join('、'), [userGroups]);

  // 生成某个可点击/悬停单元格的事件处理器：桌面端悬停显示，桌面/移动端点击可"钉住"（再点一次关闭）。
  // 包一层 useCallback，只在 detailPinned/detailKey 真正变化（用户实际交互）时才换新引用，
  // 避免每个节点每 2 秒推送系统信息时，这个函数引用跟着变化，连带把所有 NodeRow 的 memo 都打破。
  const detailHandlers = useCallback((key: string): DetailHandlers => ({
    onMouseEnter: (e) => {
      if (detailPinned) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setDetailRect({ top: rect.top, left: rect.left, bottom: rect.bottom });
      setDetailKey(key);
    },
    onMouseLeave: () => { if (!detailPinned) closeDetail(); },
    onClick: (e) => {
      e.stopPropagation();
      if (detailPinned && detailKey === key) { closeDetail(); return; }
      const rect = e.currentTarget.getBoundingClientRect();
      setDetailRect({ top: rect.top, left: rect.left, bottom: rect.bottom });
      setDetailKey(key); setDetailPinned(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [detailPinned, detailKey, closeDetail]);

  // 管理端 WebSocket：之前断线后不会自动重连，导致页面停留在断线前的旧数据（例如节点重启后开机时长看起来没变，
  // 实际上只是没再收到新的推送）。这里加上断线自动重连，并在重连前重新拉取一次最新状态。
  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const baseUrl = axios.defaults.baseURL || (import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/');
      const url = baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/$/, '') + `/system-info?type=0&secret=${localStorage.getItem('token')}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setNodes(current => current.map(node => {
            if (node.id !== Number(message.id)) return node;
            if (message.type === 'status') return { ...node, connectionStatus: message.data === 1 ? 'online' : 'offline' };
            if (message.type !== 'info') return node;
            const info = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
            const uptime = Number(info.uptime) || 0, upload = Number(info.bytes_transmitted) || 0, download = Number(info.bytes_received) || 0;
            const elapsed = uptime - (node.systemInfo?.uptime || uptime);
            return {
              ...node, connectionStatus: 'online', systemInfo: {
                cpuUsage: Number(info.cpu_usage) || 0, cpuModel: info.cpu_model || undefined,
                memoryUsage: Number(info.memory_usage) || 0, memoryTotal: Number(info.memory_total) || undefined, memoryUsed: Number(info.memory_used) || undefined, memoryAvailable: Number(info.memory_available) || undefined,
                storageUsage: Number(info.storage_usage) || 0, storageTotal: Number(info.storage_total) || undefined, storageUsed: Number(info.storage_used) || undefined, storageFree: Number(info.storage_free) || undefined,
                uploadTraffic: upload, downloadTraffic: download,
                uploadSpeed: elapsed > 0 ? Math.max(0, (upload - (node.systemInfo?.uploadTraffic || upload)) / elapsed) : 0,
                downloadSpeed: elapsed > 0 ? Math.max(0, (download - (node.systemInfo?.downloadTraffic || download)) / elapsed) : 0,
                inboundTcpConnections: info.inbound_tcp_connections !== undefined ? Number(info.inbound_tcp_connections) : undefined,
                outboundTcpConnections: info.outbound_tcp_connections !== undefined ? Number(info.outbound_tcp_connections) : undefined,
                inboundUdpConnections: info.inbound_udp_connections !== undefined ? Number(info.inbound_udp_connections) : undefined,
                outboundUdpConnections: info.outbound_udp_connections !== undefined ? Number(info.outbound_udp_connections) : undefined,
                uptime
              }
            };
          }));
        } catch {}
      };

      socket.onclose = () => {
        if (!active) return;
        // 非主动关闭（组件卸载）时才重连：3 秒后重新拉取一次节点状态并重建连接
        reconnectTimer = setTimeout(() => { load(); connect(); }, 3000);
      };
    };

    load();
    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [load]);

  useEffect(() => {
    // 入口 IP/域名 现在支持填多个（逗号拼接存储），地区查询只取第一个地址即可
    const ips = Array.from(new Set(nodes.map(node => node.ip?.split(',')[0]?.trim()).filter((ip): ip is string => !!ip))).filter(ip => !resolvedIpsRef.current.has(ip));
    ips.forEach(ip => {
      resolvedIpsRef.current.add(ip);
      fetch(`https://ipwho.is/${ip}`).then(res => res.json()).then(data => { if (data?.success && data.country_code) setRegionCodes(prev => ({ ...prev, [ip]: String(data.country_code).toLowerCase() })); }).catch(() => {});
    });
  }, [nodes]);

  // 节点组表格里每一行仍要能展示"可见用户组/流量倍率/备注"等详情，这些信息挂在 DeviceGroup 上，
  // 所以按 nodeId 建一份反查表，供节点组分组的 NodeRow 使用（节点没有对应设备组时为 undefined，
  // NodeRow 里对应字段会退化显示为 "—"）；同时用于沿用设备组原有的"在探针中隐藏"设置
  const groupMetaByNodeId = useMemo(() => {
    const map = new Map<number, DeviceGroup>();
    groups.forEach(group => { if (group.nodeId) map.set(group.nodeId, group); });
    return map;
  }, [groups]);

  // 按节点组分类：一个节点可同时属于多个节点组，所以这里是按 nodeGroupIds 展开，而不是每个节点只出现一次；
  // 只展示至少绑了一个节点的节点组，避免空组占位；沿用设备组的"在探针中隐藏"设置过滤非管理员不可见的节点
  const visibleNodeGroups = useMemo(() => nodeGroups
    .map(nodeGroup => ({
      id: nodeGroup.id,
      name: nodeGroup.name || `#${nodeGroup.id}`,
      nodes: nodes.filter(node => {
        if (!(node.nodeGroupIds || []).includes(nodeGroup.id)) return false;
        const meta = groupMetaByNodeId.get(node.id);
        return effectiveAdmin || (meta?.hideInProbe ?? 0) === 0;
      })
    }))
    .filter(nodeGroup => nodeGroup.nodes.length > 0), [nodeGroups, nodes, groupMetaByNodeId, effectiveAdmin]);

  // 状态详情 popover 的实际内容：每次渲染都从当前最新的 nodes/groupMetaByNodeId 现算，
  // 而不是打开时存一份快照，这样弹窗开着的时候节点数据更新了也能跟着刷新
  const detailKind = detailKey ? detailKey.slice(0, detailKey.lastIndexOf('-')) : null;
  const detailNode = detailKey ? nodes.find(n => n.id === Number(detailKey.slice(detailKey.lastIndexOf('-') + 1))) : undefined;
  const detailContent = detailNode && detailKind ? ({
    status: buildStatusContent(detailNode, groupMetaByNodeId.get(detailNode.id), effectiveAdmin, userGroupNames),
    cpu: buildCpuContent(detailNode),
    ram: buildRamContent(detailNode),
    storage: buildStorageContent(detailNode),
    'conn-recv': buildReceiveConnContent(detailNode),
    'conn-send': buildSendConnContent(detailNode)
  } as Record<string, React.ReactNode>)[detailKind] ?? null : null;

  return (
    <main className="probe-page min-h-screen">
      <header className="probe-topbar">
        <div className="probe-brand">
          <Button size="sm" variant="flat" color="default" onPress={() => navigate(admin ? '/admin/dashboard' : '/dashboard')} startContent={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V10" /></svg>}>
            返回主页
          </Button>
          {admin && (
            <Button
              size="sm"
              variant={viewAsUser ? 'solid' : 'flat'}
              color="default"
              onPress={() => setViewAsUser(v => !v)}
              startContent={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h13M17 7l-3-3M17 7l-3 3M20 17H7M7 17l3-3M7 17l3 3" /></svg>}
            >
              {viewAsUser ? '返回管理员视角' : '切换视角'}
            </Button>
          )}
        </div>
        <div className="flex gap-2 items-center"><ThemeSwitch /></div>
      </header>

      <div className="probe-content">
        {loading ? (
          <div className="probe-loading"><div className="probe-loading-ring" /><p>加载节点状态…</p></div>
        ) : visibleNodeGroups.length === 0 ? (
          <div className="probe-empty">
            <h2>暂无数据</h2>
            <p>{effectiveAdmin ? '暂无节点组数据，请前往"设备管理"将节点归入节点组后再查看' : '暂无可显示的节点'}</p>
          </div>
        ) : (
          <div className="probe-groups">
            {visibleNodeGroups.map(nodeGroup => {
              const up = nodeGroup.nodes.reduce((sum, node) => sum + (node.systemInfo?.uploadSpeed || 0), 0);
              const down = nodeGroup.nodes.reduce((sum, node) => sum + (node.systemInfo?.downloadSpeed || 0), 0);
              return (
                <section className="probe-group" key={`nodegroup-${nodeGroup.id}`}>
                  <div className="probe-group-head">
                    <span className="probe-title">{nodeGroup.name}<em> | ID: {nodeGroup.id}</em></span>
                    <div className="probe-totals"><span className="probe-total"><UploadIcon />{formatSpeed(up)}</span><span className="probe-total"><DownloadIcon />{formatSpeed(down)}</span></div>
                  </div>
                  <div className="probe-scroll">
                    <table className="probe-table">
                      <thead>
                        <tr><th>状态</th><th>IPv4 地区</th><th>IPv6 地区</th><th>上行</th><th>下行</th><th>开机时长</th><th>流量</th><th>CPU</th><th>RAM</th><th>存储</th></tr>
                      </thead>
                      <tbody>
                        {nodeGroup.nodes.map(node => (
                          <NodeRow
                            key={node.id}
                            node={node}
                            regionCode={node.ip ? regionCodes[node.ip.split(',')[0].trim()] : undefined}
                            detailHandlers={detailHandlers}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {detailKey && detailRect && createPortal(
        <div ref={popoverRef} className="probe-node-popover open" style={{ position: 'fixed', top: detailRect.bottom + 8, left: detailRect.left, maxWidth: 'calc(100vw - 16px)' }} onClick={(e) => e.stopPropagation()}>
          {detailContent}
        </div>,
        document.body
      )}
    </main>
  );
}
