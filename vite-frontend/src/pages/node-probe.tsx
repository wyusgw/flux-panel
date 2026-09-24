import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@heroui/button';
import axios from 'axios';
import { getDeviceGroupList, getNodeList, getUserGroupNames } from '@/api';
import { ThemeSwitch } from '@/components/theme-switch';
import { isAdmin } from '@/utils/auth';
import 'flag-icons/css/flag-icons.min.css';

type Node = {
  id: number; name: string; ip?: string; serverIp?: string; status?: number; version?: string; portSta?: number; portEnd?: number;
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
type DeviceGroup = { id: number; name: string; nodeId: number; nodeName?: string; node?: Node; userGroupId?: number | null; ownerUserId?: number | null; singleTunnelGroupName?: string | null; ratio?: number; remark?: string; hideInProbe?: number };
type UserGroup = { id: number; name: string };

const formatBytes = (value = 0) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(2)} MB` : `${(value / 1024).toFixed(2)} KB`;
const formatSpeed = (value = 0) => `${formatBytes(value)}/s`;
const formatUptime = (value = 0) => value < 60 ? `${value}s` : value < 3600 ? `${Math.floor(value / 60)}分 ${value % 60}秒` : value < 86400 ? `${Math.floor(value / 3600)}时 ${Math.floor(value % 3600 / 60)}分` : `${Math.floor(value / 86400)} 天`;
const meterTone = (value?: number) => value === undefined ? 'idle' : value >= 80 ? 'danger' : value >= 50 ? 'warning' : 'safe';
const RegionCell = ({ code }: { code?: string }) => code ? <span className={`fi fi-${code} fis probe-flag`} /> : null;

// 可点击/悬停查看详情的一行 popover 内容
const PopRow = ({ children }: { children: React.ReactNode }) => <div className="probe-node-popover-row">{children}</div>;

type DetailHandlers = {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
};

export default function NodeProbePage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  // 管理员专用：临时切换成普通用户视角预览节点状态页，不影响实际权限
  const [viewAsUser, setViewAsUser] = useState(false);
  const effectiveAdmin = admin && !viewAsUser;
  const [nodes, setNodes] = useState<Node[]>([]); const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [regionCodes, setRegionCodes] = useState<Record<string, string>>({});

  // 统一的详情 popover：状态 / CPU / RAM / 存储 / 连接数点击或悬停共用同一套定位与显示逻辑，
  // 内容在打开时以 JSX 形式传入，这里只负责定位和是否显示
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detailContent, setDetailContent] = useState<React.ReactNode>(null);
  const [detailRect, setDetailRect] = useState<{ top: number; left: number; bottom: number } | null>(null);
  const [detailPinned, setDetailPinned] = useState(false);

  const resolvedIpsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nodeResponse, groupResponse, userGroupResponse] = await Promise.all([getNodeList(), getDeviceGroupList(), getUserGroupNames()]);
      const deviceGroups: DeviceGroup[] = groupResponse.code === 0 ? (groupResponse.data || []) : [];
      const nodesById = new Map<number, Node>();
      if (nodeResponse.code === 0) (nodeResponse.data || []).forEach((node: Node) => nodesById.set(node.id, node));
      deviceGroups.forEach(group => { if (group.node) nodesById.set(group.node.id, { ...group.node, ...nodesById.get(group.node.id) }); });
      setNodes(Array.from(nodesById.values()).map(node => ({ ...node, connectionStatus: node.status === 1 ? 'online' : 'offline', systemInfo: null })));
      if (groupResponse.code === 0) setGroups(deviceGroups);
      if (userGroupResponse.code === 0) setUserGroups(userGroupResponse.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeDetail = () => { setDetailKey(null); setDetailContent(null); setDetailRect(null); setDetailPinned(false); };

  useEffect(() => {
    if (!detailPinned) return;
    document.addEventListener('click', closeDetail);
    window.addEventListener('scroll', closeDetail, true);
    return () => { document.removeEventListener('click', closeDetail); window.removeEventListener('scroll', closeDetail, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailPinned]);

  const userGroupName = (id?: number | null) => id ? (userGroups.find(g => g.id === id)?.name || `#${id}`) : '所有用户可见';

  // 生成某个可点击/悬停单元格的事件处理器：桌面端悬停显示，桌面/移动端点击可"钉住"（再点一次关闭）
  const detailHandlers = (key: string, content: React.ReactNode): DetailHandlers => ({
    onMouseEnter: (e) => {
      if (detailPinned) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setDetailRect({ top: rect.top, left: rect.left, bottom: rect.bottom });
      setDetailKey(key); setDetailContent(content);
    },
    onMouseLeave: () => { if (!detailPinned) closeDetail(); },
    onClick: (e) => {
      e.stopPropagation();
      if (detailPinned && detailKey === key) { closeDetail(); return; }
      const rect = e.currentTarget.getBoundingClientRect();
      setDetailRect({ top: rect.top, left: rect.left, bottom: rect.bottom });
      setDetailKey(key); setDetailContent(content); setDetailPinned(true);
    }
  });

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
    const ips = Array.from(new Set(nodes.map(node => node.ip).filter((ip): ip is string => !!ip))).filter(ip => !resolvedIpsRef.current.has(ip));
    ips.forEach(ip => {
      resolvedIpsRef.current.add(ip);
      fetch(`https://ipwho.is/${ip}`).then(res => res.json()).then(data => { if (data?.success && data.country_code) setRegionCodes(prev => ({ ...prev, [ip]: String(data.country_code).toLowerCase() })); }).catch(() => {});
    });
  }, [nodes]);

  const visibleGroups = groups
    .filter(group => effectiveAdmin || (group.hideInProbe ?? 0) === 0)
    .map(group => ({
      label: group.ownerUserId != null ? (group.singleTunnelGroupName || '未分组') : userGroupName(group.userGroupId),
      id: group.id,
      meta: group,
      nodes: nodes.filter(node => node.id === group.nodeId)
    }));

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
        ) : (
          <div className="probe-groups">
            {visibleGroups.map(group => {
              const up = group.nodes.reduce((sum, node) => sum + (node.systemInfo?.uploadSpeed || 0), 0);
              const down = group.nodes.reduce((sum, node) => sum + (node.systemInfo?.downloadSpeed || 0), 0);
              return (
                <section className="probe-group" key={group.id}>
                  <div className="probe-group-head">
                    <span className="probe-title">{group.label}<em> | ID: {group.id || '—'}</em></span>
                    <div className="probe-totals"><span className="probe-total"><i>↑</i>{formatSpeed(up)}</span><span className="probe-total"><i>↓</i>{formatSpeed(down)}</span></div>
                  </div>
                  <div className="probe-scroll">
                    <table className="probe-table">
                      <thead>
                        <tr><th>状态</th><th>IPv4 地区</th><th>IPv6 地区</th><th>上行</th><th>下行</th><th>开机时长</th><th>流量</th><th>CPU</th><th>RAM</th><th>存储</th></tr>
                      </thead>
                      <tbody>
                        {group.nodes.map(node => {
                          const statusContent = effectiveAdmin ? (
                            <>
                              <PopRow><b>{node.name}</b></PopRow>
                              <PopRow>服务器：{node.serverIp || '—'}</PopRow>
                              <PopRow>入口：{node.ip || '—'}</PopRow>
                              <PopRow>端口：{node.portSta ?? '—'} - {node.portEnd ?? '—'}</PopRow>
                              <PopRow>可见用户组：{userGroupName(group.meta?.userGroupId)}</PopRow>
                              <PopRow>流量倍率：{group.meta?.ratio ?? '—'}</PopRow>
                              <PopRow>备注：{group.meta?.remark || '—'}</PopRow>
                            </>
                          ) : (
                            <>
                              <PopRow><b>{node.name}</b></PopRow>
                              <PopRow>服务器：{node.serverIp || '—'}</PopRow>
                              <PopRow>流量倍率：{group.meta?.ratio ?? '—'}</PopRow>
                              <PopRow>状态：{node.connectionStatus === 'online' ? '在线' : '离线'}</PopRow>
                            </>
                          );
                          const sendConnContent = (
                            <>
                              <PopRow><b>发送当前连接数</b></PopRow>
                              <PopRow>TCP：{node.systemInfo?.outboundTcpConnections ?? '—'}</PopRow>
                              <PopRow>UDP：{node.systemInfo?.outboundUdpConnections ?? '—'}</PopRow>
                            </>
                          );
                          const receiveConnContent = (
                            <>
                              <PopRow><b>接收当前连接数</b></PopRow>
                              <PopRow>TCP：{node.systemInfo?.inboundTcpConnections ?? '—'}</PopRow>
                              <PopRow>UDP：{node.systemInfo?.inboundUdpConnections ?? '—'}</PopRow>
                            </>
                          );
                          const cpuContent = (
                            <>
                              <PopRow><b>CPU</b></PopRow>
                              <PopRow>型号：{node.systemInfo?.cpuModel || '暂无型号信息'}</PopRow>
                              <PopRow>使用率：{node.systemInfo?.cpuUsage !== undefined ? `${node.systemInfo.cpuUsage.toFixed(1)}%` : '—'}</PopRow>
                            </>
                          );
                          const ramContent = (
                            <>
                              <PopRow><b>RAM</b></PopRow>
                              <PopRow>已用：{formatBytes(node.systemInfo?.memoryUsed)}</PopRow>
                              <PopRow>剩余：{formatBytes(node.systemInfo?.memoryAvailable)}</PopRow>
                              <PopRow>总量：{formatBytes(node.systemInfo?.memoryTotal)}</PopRow>
                            </>
                          );
                          const storageContent = (
                            <>
                              <PopRow>已用：{formatBytes(node.systemInfo?.storageUsed)}</PopRow>
                              <PopRow>剩余：{formatBytes(node.systemInfo?.storageFree)}</PopRow>
                              <PopRow>总量：{formatBytes(node.systemInfo?.storageTotal)}</PopRow>
                            </>
                          );

                          return (
                            <tr key={node.id}>
                              <td>
                                <span className={`probe-status probe-clickable ${node.connectionStatus === 'online' ? 'online' : ''}`} {...detailHandlers(`status-${node.id}`, statusContent)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={node.connectionStatus === 'online' ? '在线' : '离线'}>
                                    <circle cx="12" cy="12" r="10" />
                                    {node.connectionStatus === 'online' ? <path d="M7.8 12.3l2.9 2.9 5.5-5.7" /> : <path d="M9 9l6 6M15 9l-6 6" />}
                                  </svg>
                                </span>
                              </td>
                              <td><RegionCell code={node.ip ? regionCodes[node.ip] : undefined} /></td>
                              <td><RegionCell /></td>
                              <td className="probe-clickable" {...detailHandlers(`conn-recv-${node.id}`, receiveConnContent)}>{formatSpeed(node.systemInfo?.uploadSpeed)}</td>
                              <td className="probe-clickable" {...detailHandlers(`conn-send-${node.id}`, sendConnContent)}>{formatSpeed(node.systemInfo?.downloadSpeed)}</td>
                              <td className="probe-uptime">{node.systemInfo ? formatUptime(node.systemInfo.uptime) : ''}</td>
                              <td className="probe-pair"><span>{formatBytes(node.systemInfo?.uploadTraffic)}↑</span><span>{formatBytes(node.systemInfo?.downloadTraffic)}↓</span></td>
                              <td>
                                <div className={`probe-meter probe-clickable probe-meter-${meterTone(node.systemInfo?.cpuUsage)}`} {...detailHandlers(`cpu-${node.id}`, cpuContent)}>
                                  <span style={{ width: `${Math.min(node.systemInfo?.cpuUsage || 0, 100)}%` }} /> <b>{node.systemInfo?.cpuUsage === undefined ? '' : `${node.systemInfo.cpuUsage.toFixed(1)}%`}</b>
                                </div>
                              </td>
                              <td>
                                <div className={`probe-meter probe-clickable probe-meter-${meterTone(node.systemInfo?.memoryUsage)}`} {...detailHandlers(`ram-${node.id}`, ramContent)}>
                                  <span style={{ width: `${Math.min(node.systemInfo?.memoryUsage || 0, 100)}%` }} /> <b>{node.systemInfo?.memoryUsage === undefined ? '' : `${node.systemInfo.memoryUsage.toFixed(1)}%`}</b>
                                </div>
                              </td>
                              <td>
                                <div className={`probe-meter probe-clickable probe-meter-${meterTone(node.systemInfo?.storageUsage)}`} {...detailHandlers(`storage-${node.id}`, storageContent)}>
                                  <span style={{ width: `${Math.min(node.systemInfo?.storageUsage || 0, 100)}%` }} /> <b>{node.systemInfo?.storageUsage === undefined ? '' : `${node.systemInfo.storageUsage.toFixed(1)}%`}</b>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {group.nodes.length === 0 && <tr><td colSpan={10} className="text-center text-default-500 py-8">此设备组没有可用节点</td></tr>}
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
        <div className="probe-node-popover open" style={{ position: 'fixed', top: detailRect.bottom + 8, left: detailRect.left }} onClick={(e) => e.stopPropagation()}>
          {detailContent}
        </div>,
        document.body
      )}
    </main>
  );
}
