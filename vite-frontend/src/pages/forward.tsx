import { useState, useEffect, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Alert } from "@heroui/alert";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { Tooltip } from "@heroui/tooltip";
import toast from 'react-hot-toast';
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ToastWarningIcon } from "@/components/toast-icons";

import {
  createForward,
  getForwardList,
  updateForward,
  deleteForward,
  forceDeleteForward,
  userTunnel,
  pauseForwardService,
  resumeForwardService,
  diagnoseForward,
  getForwardGroupList,
  createForwardGroup,
  updateForwardGroup,
  deleteForwardGroup,
  getDeviceGroupList,
  getUserPackageInfo,
  getForwardDailyFlow
} from "@/api";
import { JwtUtil } from "@/utils/jwt";

// ========== 图标（转发规则页专用的一批简单线性小图标） ==========
const IconSearch = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" /></svg>;
const IconRefresh = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" d="M4.6 15a8 8 0 0014.4 2.6M19.4 9A8 8 0 005 6.4" /></svg>;
const IconStats = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M12 20V4M20 20v-7" /></svg>;
const IconGroup = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>;
const IconAddSingle = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const IconImport = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h10l6 6v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 12v6m0-6l-3 3m3-3l3 3" /></svg>;
const IconExport = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h10l6 6v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-6m0 0l-3 3m3-3l3 3" /></svg>;
const IconToggle = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="4" /><circle cx="8" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>;
const IconFlow = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" /></svg>;
const IconPause = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
const IconPlay = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 4l14 8-14 8V4z" /></svg>;
const IconDelete = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" /></svg>;
const IconEdit = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IconHelp = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9a2.5 2.5 0 114.1 1.9c-.6.5-1.1 1-1.1 1.8V13" /><circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" /></svg>;
const IconCopy = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" /></svg>;
const IconDragHandle = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="7" cy="5" r="1.3" /><circle cx="13" cy="5" r="1.3" /><circle cx="7" cy="10" r="1.3" /><circle cx="13" cy="10" r="1.3" /><circle cx="7" cy="15" r="1.3" /><circle cx="13" cy="15" r="1.3" /></svg>;

// 右侧浮动工具列上的一个图示按钮：图示 + 文字标签
const RailButton = ({ icon, label, onPress, disabled, danger, loading }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean; danger?: boolean; loading?: boolean }) => (
  <button
    type="button"
    disabled={disabled || loading}
    onClick={onPress}
    className={`rail-btn ${danger ? 'rail-btn-danger' : ''}`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface Forward {
  id: number;
  name: string;
  tunnelId: number;
  tunnelName: string;
  inIp: string;
  inPort: number;
  remoteAddr: string;
  interfaceName?: string;
  strategy: string;
  status: number;
  inFlow: number;
  outFlow: number;
  serviceRunning: boolean;
  createdTime: string;
  userName?: string;
  userId?: number;
  inx?: number;
  groupId?: number | null;
  acceptProxyProtocol?: number;
  sendProxyProtocol?: number;
  ipLimit?: number;
  connLimit?: number;
  speedLimit?: number;
  inDeviceGroupId?: number | null;
  outDeviceGroupId?: number | null;
}

interface Tunnel {
  id: number;
  name: string;
  inNodePortSta?: number;
  inNodePortEnd?: number;
}

interface ForwardForm {
  id?: number;
  userId?: number;
  name: string;
  tunnelId: number | null;
  inPort: number | null;
  remoteAddr: string;
  interfaceName?: string;
  strategy: string;
  groupId?: number | null;
  acceptProxyProtocol: number;
  sendProxyProtocol: number;
  ipLimit: number;
  connLimit: number;
  speedLimit: number;
  inDeviceGroupId?: number | null;
  outDeviceGroupId?: number | null;
}

interface ForwardGroup {
  id: number;
  name: string;
  ruleCount: number;
}

interface DeviceGroupOption {
  id: number;
  name: string;
  nodeName: string;
  ratio?: number;
  direction?: 'inbound' | 'outbound' | 'monitor' | 'both';
  node?: { status?: number };
}

const isDeviceGroupOnline = (group?: DeviceGroupOption) => !!group?.nodeName && group.node?.status === 1;

interface AddressItem {
  id: number;
  address: string;
  copying: boolean;
}

interface DiagnosisResult {
  forwardName: string;
  timestamp: number;
  results: Array<{
    success: boolean;
    description: string;
    nodeName: string;
    nodeId: string;
    targetIp: string;
    targetPort?: number;
    message?: string;
    averageTime?: number;
    packetLoss?: number;
  }>;
}

export default function ForwardPage() {
  const [loading, setLoading] = useState(true);
  const [forwards, setForwards] = useState<Forward[]>([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  
  // 检测是否为移动端
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 表格多选（用于右侧工具列的批量操作）
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));
  const [batchLoading, setBatchLoading] = useState(false);

  // 右侧浮动工具列：可拖动到任意位置，位置记住在本地，下次打开还在原地
  const railRef = useRef<HTMLDivElement | null>(null);
  const railDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [railPos, setRailPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('forward-rail-pos');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const clampRailPos = (x: number, y: number) => {
    const el = railRef.current;
    const w = el?.offsetWidth || 56;
    const h = el?.offsetHeight || 320;
    const maxX = Math.max(4, window.innerWidth - w - 4);
    const maxY = Math.max(4, window.innerHeight - h - 4);
    return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
  };

  const handleRailDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = railRef.current?.getBoundingClientRect();
    const originX = railPos?.x ?? (rect?.left ?? window.innerWidth - 70);
    const originY = railPos?.y ?? (rect?.top ?? window.innerHeight / 2 - 150);
    railDragRef.current = { startX: e.clientX, startY: e.clientY, originX, originY };

    const handleMove = (ev: PointerEvent) => {
      if (!railDragRef.current) return;
      const dx = ev.clientX - railDragRef.current.startX;
      const dy = ev.clientY - railDragRef.current.startY;
      setRailPos(clampRailPos(railDragRef.current.originX + dx, railDragRef.current.originY + dy));
    };
    const handleUp = () => {
      railDragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setRailPos(prev => {
        if (prev) {
          try { localStorage.setItem('forward-rail-pos', JSON.stringify(prev)); } catch {}
        }
        return prev;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // 搜索规则
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 统计数据
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [dailyFlowLoading, setDailyFlowLoading] = useState(false);
  const [dailyFlow, setDailyFlow] = useState<{ today: number; yesterday: number } | null>(null);

  const openStats = async () => {
    setStatsModalOpen(true);
    setDailyFlowLoading(true);
    try {
      const res = await getForwardDailyFlow();
      if (res.code === 0) {
        setDailyFlow({ today: Number(res.data?.todayFlow) || 0, yesterday: Number(res.data?.yesterdayFlow) || 0 });
      } else {
        toast.error(res.msg || '获取统计数据失败');
      }
    } catch (error) {
      toast.error('获取统计数据失败');
    } finally {
      setDailyFlowLoading(false);
    }
  };

  // 套餐流量/到期/规则数上限（用于顶部信息条）
  const [packageInfo, setPackageInfo] = useState<{ flow: number; inFlow: number; outFlow: number; expTime: number | null; num: number } | null>(null);

  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [diagnosisModalOpen, setDiagnosisModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [forwardToDelete, setForwardToDelete] = useState<Forward | null>(null);
  const [currentDiagnosisForward, setCurrentDiagnosisForward] = useState<Forward | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [addressModalTitle, setAddressModalTitle] = useState('');
  const [addressList, setAddressList] = useState<AddressItem[]>([]);
  
  // 导出相关状态
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportData, setExportData] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedTunnelForExport, setSelectedTunnelForExport] = useState<number | null>(null);
  
  // 导入相关状态
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [selectedTunnelForImport, setSelectedTunnelForImport] = useState<number | null>(null);
  const [importResults, setImportResults] = useState<Array<{
    line: string;
    success: boolean;
    message: string;
    forwardName?: string;
  }>>([]);
  
  // 表单状态
  const [form, setForm] = useState<ForwardForm>({
    name: '',
    tunnelId: null,
    inPort: null,
    remoteAddr: '',
    interfaceName: '',
    strategy: 'fifo',
    groupId: null,
    acceptProxyProtocol: 0,
    sendProxyProtocol: 0,
    ipLimit: 0,
    connLimit: 0,
    speedLimit: 0
  });

  // 表单验证错误
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [selectedTunnel, setSelectedTunnel] = useState<Tunnel | null>(null);

  // 入口/出口设备组模式（对齐 demo：转发规则直接选设备组，不需要预先建隧道）
  const [entryMode, setEntryMode] = useState<'device' | 'tunnel'>('device');
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroupOption[]>([]);

  const loadDeviceGroups = async () => {
    try {
      const res = await getDeviceGroupList();
      if (res.code === 0) {
        setDeviceGroups(res.data || []);
      }
    } catch (error) {
      console.error('获取设备组列表失败:', error);
    }
  };

  // 加载套餐流量/到期/规则数上限，用于顶部信息条
  const loadPackageInfo = async () => {
    try {
      const res = await getUserPackageInfo();
      if (res.code === 0 && res.data?.userInfo) {
        const info = res.data.userInfo;
        setPackageInfo({
          flow: info.flow ?? 0,
          inFlow: info.inFlow ?? 0,
          outFlow: info.outFlow ?? 0,
          expTime: info.expTime ?? null,
          num: info.num ?? 0
        });
      }
    } catch (error) {
      console.error('获取套餐信息失败:', error);
    }
  };

  // 分组相关状态
  const [forwardGroups, setForwardGroups] = useState<ForwardGroup[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<number | null>(null); // null=全部, -1=未分组
  const [groupManageModalOpen, setGroupManageModalOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupEditingId, setGroupEditingId] = useState<number | null>(null);
  const [groupSubmitLoading, setGroupSubmitLoading] = useState(false);

  useEffect(() => {
    loadData();
    loadForwardGroups();
    loadDeviceGroups();
    loadPackageInfo();
  }, []);

  const loadForwardGroups = async () => {
    try {
      const res = await getForwardGroupList();
      if (res.code === 0) {
        setForwardGroups(res.data || []);
      }
    } catch (error) {
      console.error('获取分组列表失败:', error);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      toast.error('请输入分组名称');
      return;
    }
    setGroupSubmitLoading(true);
    try {
      const res = groupEditingId
        ? await updateForwardGroup({ id: groupEditingId, name: groupNameInput })
        : await createForwardGroup({ name: groupNameInput });
      if (res.code === 0) {
        toast.success(groupEditingId ? '修改成功' : '创建成功');
        setGroupNameInput('');
        setGroupEditingId(null);
        loadForwardGroups();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setGroupSubmitLoading(false);
    }
  };

  const handleEditGroupStart = (group: ForwardGroup) => {
    setGroupEditingId(group.id);
    setGroupNameInput(group.name);
  };

  const handleDeleteGroup = async (group: ForwardGroup) => {
    try {
      const res = await deleteForwardGroup(group.id);
      if (res.code === 0) {
        toast.success('删除成功');
        if (activeGroupFilter === group.id) {
          setActiveGroupFilter(null);
        }
        loadForwardGroups();
        loadData(false);
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 加载所有数据
  const loadData = async (lod = true) => {
    setLoading(lod);
    try {
      const [forwardsRes, tunnelsRes] = await Promise.all([
        getForwardList(),
        userTunnel()
      ]);
      
      if (forwardsRes.code === 0) {
        const forwardsData = forwardsRes.data?.map((forward: any) => ({
          ...forward,
          serviceRunning: forward.status === 1
        })) || [];
        setForwards(forwardsData);
      } else {
        toast.error(forwardsRes.msg || '获取转发列表失败');
      }
      
      if (tunnelsRes.code === 0) {
        setTunnels(tunnelsRes.data || []);
      } else {
        console.warn('获取隧道列表失败:', tunnelsRes.msg);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!form.name.trim()) {
      newErrors.name = '请输入转发名称';
    } else if (form.name.length < 2 || form.name.length > 50) {
      newErrors.name = '转发名称长度应在2-50个字符之间';
    }
    
    if (entryMode === 'tunnel') {
      if (!form.tunnelId) {
        newErrors.tunnelId = '请选择关联隧道';
      }
    } else {
      if (!form.inDeviceGroupId) {
        newErrors.inDeviceGroupId = '请选择入口设备组';
      }
    }

    if (!form.remoteAddr.trim()) {
      newErrors.remoteAddr = '请输入远程地址';
    } else {
      // 验证地址格式
      const addresses = form.remoteAddr.split('\n').map(addr => addr.trim()).filter(addr => addr);
      const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):\d+$/;
      const ipv6FullPattern = /^\[((([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))|(([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))\]:\d+$/;
      const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*:\d+$/;
      
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        if (!ipv4Pattern.test(addr) && !ipv6FullPattern.test(addr) && !domainPattern.test(addr)) {
          newErrors.remoteAddr = `第${i + 1}行地址格式错误`;
          break;
        }
      }
    }
    
    if (form.inPort !== null && (form.inPort < 1 || form.inPort > 65535)) {
      newErrors.inPort = '端口号必须在1-65535之间';
    }
    
    if (selectedTunnel && selectedTunnel.inNodePortSta && selectedTunnel.inNodePortEnd && form.inPort) {
      if (form.inPort < selectedTunnel.inNodePortSta || form.inPort > selectedTunnel.inNodePortEnd) {
        newErrors.inPort = `端口号必须在${selectedTunnel.inNodePortSta}-${selectedTunnel.inNodePortEnd}范围内`;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 新增转发
  const handleAdd = () => {
    setIsEdit(false);
    setForm({
      name: '',
      tunnelId: null,
      inPort: null,
      remoteAddr: '',
      interfaceName: '',
      strategy: 'fifo',
      groupId: activeGroupFilter && activeGroupFilter > 0 ? activeGroupFilter : null,
      acceptProxyProtocol: 0,
      sendProxyProtocol: 0,
      ipLimit: 0,
      connLimit: 0,
      speedLimit: 0,
      inDeviceGroupId: null,
      outDeviceGroupId: null
    });
    setSelectedTunnel(null);
    setEntryMode('device');
    setErrors({});
    setModalOpen(true);
  };

  // 编辑转发
  const handleEdit = (forward: Forward) => {
    setIsEdit(true);
    setForm({
      id: forward.id,
      userId: forward.userId,
      name: forward.name,
      tunnelId: forward.tunnelId,
      inPort: forward.inPort,
      remoteAddr: forward.remoteAddr.split(',').join('\n'),
      interfaceName: forward.interfaceName || '',
      strategy: forward.strategy || 'fifo',
      groupId: forward.groupId ?? null,
      // 接受端只区分关闭与开启；兼容历史上保存的 v1/v2 值。
      acceptProxyProtocol: forward.acceptProxyProtocol ? 1 : 0,
      sendProxyProtocol: forward.sendProxyProtocol ?? 0,
      ipLimit: forward.ipLimit ?? 0,
      connLimit: forward.connLimit ?? 0,
      speedLimit: forward.speedLimit ?? 0,
      inDeviceGroupId: forward.inDeviceGroupId ?? null,
      outDeviceGroupId: forward.outDeviceGroupId ?? null
    });
    const tunnel = tunnels.find(t => t.id === forward.tunnelId);
    setSelectedTunnel(tunnel || null);
    // 该规则最初通过设备组创建时沿用设备组模式，否则沿用旧版隧道模式
    setEntryMode(forward.inDeviceGroupId ? 'device' : 'tunnel');
    setErrors({});
    setModalOpen(true);
  };

  // 显示删除确认
  const handleDelete = (forward: Forward) => {
    setForwardToDelete(forward);
    setDeleteModalOpen(true);
  };

  // 确认删除转发
  const confirmDelete = async () => {
    if (!forwardToDelete) return;
    
    setDeleteLoading(true);
    try {
      const res = await deleteForward(forwardToDelete.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteModalOpen(false);
        loadData();
      } else {
        // 删除失败，询问是否强制删除
        const confirmed = window.confirm(`常规删除失败：${res.msg || '删除失败'}\n\n是否需要强制删除？\n\n注意：强制删除不会去验证节点端是否已经删除对应的转发服务。`);
        if (confirmed) {
          const forceRes = await forceDeleteForward(forwardToDelete.id);
          if (forceRes.code === 0) {
            toast.success('强制删除成功');
            setDeleteModalOpen(false);
            loadData();
          } else {
            toast.error(forceRes.msg || '强制删除失败');
          }
        }
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  // 处理隧道选择变化
  const handleTunnelChange = (tunnelId: string) => {
    const tunnel = tunnels.find(t => t.id === parseInt(tunnelId));
    setSelectedTunnel(tunnel || null);
    setForm(prev => ({ ...prev, tunnelId: parseInt(tunnelId) }));
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitLoading(true);
    try {
      const processedRemoteAddr = form.remoteAddr
        .split('\n')
        .map(addr => addr.trim())
        .filter(addr => addr)
        .join(',');

      const addressCount = processedRemoteAddr.split(',').length;
      
      // 根据入口模式，二选一填入 tunnelId 或 入口/出口设备组ID
      const entryFields = entryMode === 'tunnel'
        ? { tunnelId: form.tunnelId, inDeviceGroupId: null, outDeviceGroupId: null }
        : { tunnelId: null, inDeviceGroupId: form.inDeviceGroupId, outDeviceGroupId: form.outDeviceGroupId };

      let res;
      if (isEdit) {
        // 更新时确保包含必要字段
        const updateData = {
          id: form.id,
          userId: form.userId,
          name: form.name,
          ...entryFields,
          inPort: form.inPort,
          remoteAddr: processedRemoteAddr,
          interfaceName: form.interfaceName,
          strategy: addressCount > 1 ? form.strategy : 'fifo',
          groupId: form.groupId,
          acceptProxyProtocol: form.acceptProxyProtocol,
          sendProxyProtocol: form.sendProxyProtocol,
          ipLimit: form.ipLimit,
          connLimit: form.connLimit,
          speedLimit: form.speedLimit
        };
        res = await updateForward(updateData);
      } else {
        // 创建时不需要id和userId（后端会自动设置）
        const createData = {
          name: form.name,
          ...entryFields,
          inPort: form.inPort,
          remoteAddr: processedRemoteAddr,
          interfaceName: form.interfaceName,
          strategy: addressCount > 1 ? form.strategy : 'fifo',
          groupId: form.groupId,
          acceptProxyProtocol: form.acceptProxyProtocol,
          sendProxyProtocol: form.sendProxyProtocol,
          ipLimit: form.ipLimit,
          connLimit: form.connLimit,
          speedLimit: form.speedLimit
        };
        res = await createForward(createData);
      }
      
      if (res.code === 0) {
        // 节点离线时后端仍会保存规则，但会带一句提醒（含"离线"字样）——这种情况用更醒目、停留更久的提示，
        // 让用户知道规则还没真的同步到节点，而不是被"创建成功"这种一闪而过的提示盖掉
        if (res.msg && res.msg.includes('离线')) {
          toast(res.msg, { icon: <ToastWarningIcon />, duration: 6000 });
        } else {
          toast.success(isEdit ? '修改成功' : '创建成功');
        }
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      toast.error('操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  // 处理服务开关
  const handleServiceToggle = async (forward: Forward) => {
    if (forward.status !== 1 && forward.status !== 0) {
      toast.error('转发状态异常，无法操作');
      return;
    }

    const targetState = !forward.serviceRunning;
    
    try {
      // 乐观更新UI
      setForwards(prev => prev.map(f => 
        f.id === forward.id 
          ? { ...f, serviceRunning: targetState }
          : f
      ));

      let res;
      if (targetState) {
        res = await resumeForwardService(forward.id);
      } else {
        res = await pauseForwardService(forward.id);
      }
      
      if (res.code === 0) {
        toast.success(targetState ? '服务已启动' : '服务已暂停');
        // 更新转发状态
        setForwards(prev => prev.map(f => 
          f.id === forward.id 
            ? { ...f, status: targetState ? 1 : 0 }
            : f
        ));
      } else {
        // 操作失败，恢复UI状态
        setForwards(prev => prev.map(f => 
          f.id === forward.id 
            ? { ...f, serviceRunning: !targetState }
            : f
        ));
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      // 操作失败，恢复UI状态
      setForwards(prev => prev.map(f => 
        f.id === forward.id 
          ? { ...f, serviceRunning: !targetState }
          : f
      ));
      console.error('服务开关操作失败:', error);
      toast.error('网络错误，操作失败');
    }
  };

  // 诊断转发
  const handleDiagnose = async (forward: Forward) => {
    setCurrentDiagnosisForward(forward);
    setDiagnosisModalOpen(true);
    setDiagnosisLoading(true);
    setDiagnosisResult(null);

    try {
      const response = await diagnoseForward(forward.id);
      if (response.code === 0) {
        setDiagnosisResult(response.data);
      } else {
        toast.error(response.msg || '诊断失败');
        setDiagnosisResult({
          forwardName: forward.name,
          timestamp: Date.now(),
          results: [{
            success: false,
            description: '诊断失败',
            nodeName: '-',
            nodeId: '-',
            targetIp: forward.remoteAddr.split(',')[0] || '-',
            message: response.msg || '诊断过程中发生错误'
          }]
        });
      }
    } catch (error) {
      console.error('诊断失败:', error);
      toast.error('网络错误，请重试');
      setDiagnosisResult({
        forwardName: forward.name,
        timestamp: Date.now(),
        results: [{
          success: false,
          description: '网络错误',
          nodeName: '-',
          nodeId: '-',
          targetIp: forward.remoteAddr.split(',')[0] || '-',
          message: '无法连接到服务器'
        }]
      });
    } finally {
      setDiagnosisLoading(false);
    }
  };

  // 获取连接质量
  const getQualityDisplay = (averageTime?: number, packetLoss?: number) => {
    if (averageTime === undefined || packetLoss === undefined) return null;
    
    if (averageTime < 30 && packetLoss === 0) return { text: '优秀', color: 'success' };
    if (averageTime < 50 && packetLoss === 0) return { text: '很好', color: 'success' };
    if (averageTime < 100 && packetLoss < 1) return { text: '良好', color: 'primary' };
    if (averageTime < 150 && packetLoss < 2) return { text: '一般', color: 'warning' };
    if (averageTime < 200 && packetLoss < 5) return { text: '较差', color: 'warning' };
    return { text: '很差', color: 'danger' };
  };

  // 格式化流量
  const formatFlow = (value: number): string => {
    if (value === 0) return '0 B';
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(2) + ' KB';
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
    return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 格式化入口地址
  const formatInAddress = (ipString: string, port: number): string => {
    if (!ipString || !port) return '';
    
    const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
    if (ips.length === 0) return '';
    
    if (ips.length === 1) {
      const ip = ips[0];
      if (ip.includes(':') && !ip.startsWith('[')) {
        return `[${ip}]:${port}`;
      } else {
        return `${ip}:${port}`;
      }
    }
    
    const firstIp = ips[0];
    let formattedFirstIp;
    if (firstIp.includes(':') && !firstIp.startsWith('[')) {
      formattedFirstIp = `[${firstIp}]`;
    } else {
      formattedFirstIp = firstIp;
    }
    
    return `${formattedFirstIp}:${port} (+${ips.length - 1})`;
  };

  // 格式化远程地址
  const formatRemoteAddress = (addressString: string): string => {
    if (!addressString) return '';
    
    const addresses = addressString.split(',').map(addr => addr.trim()).filter(addr => addr);
    if (addresses.length === 0) return '';
    if (addresses.length === 1) return addresses[0];
    
    return `${addresses[0]} (+${addresses.length - 1})`;
  };

  // 检查是否有多个地址
  const hasMultipleAddresses = (addressString: string): boolean => {
    if (!addressString) return false;
    const addresses = addressString.split(',').map(addr => addr.trim()).filter(addr => addr);
    return addresses.length > 1;
  };

  // 显示地址列表弹窗
  const showAddressModal = (addressString: string, port: number | null, title: string) => {
    if (!addressString) return;
    
    let addresses: string[];
    if (port !== null) {
      // 入口地址处理
      const ips = addressString.split(',').map(ip => ip.trim()).filter(ip => ip);
      if (ips.length <= 1) {
        copyToClipboard(formatInAddress(addressString, port), title);
        return;
      }
      addresses = ips.map(ip => {
        if (ip.includes(':') && !ip.startsWith('[')) {
          return `[${ip}]:${port}`;
        } else {
          return `${ip}:${port}`;
        }
      });
    } else {
      // 远程地址处理
      addresses = addressString.split(',').map(addr => addr.trim()).filter(addr => addr);
      if (addresses.length <= 1) {
        copyToClipboard(addressString, title);
        return;
      }
    }
    
    setAddressList(addresses.map((address, index) => ({
      id: index,
      address,
      copying: false
    })));
    setAddressModalTitle(`${title} (${addresses.length}个)`);
    setAddressModalOpen(true);
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string, label: string = '内容') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制${label}`);
    } catch (error) {
      toast.error('复制失败');
    }
  };

  // 复制地址
  const copyAddress = async (addressItem: AddressItem) => {
    try {
      setAddressList(prev => prev.map(item => 
        item.id === addressItem.id ? { ...item, copying: true } : item
      ));
      await copyToClipboard(addressItem.address, '地址');
    } catch (error) {
      toast.error('复制失败');
    } finally {
      setAddressList(prev => prev.map(item => 
        item.id === addressItem.id ? { ...item, copying: false } : item
      ));
    }
  };

  // 复制所有地址
  const copyAllAddresses = async () => {
    if (addressList.length === 0) return;
    const allAddresses = addressList.map(item => item.address).join('\n');
    await copyToClipboard(allAddresses, '所有地址');
  };

    // 导出转发数据
  const handleExport = () => {
    setSelectedTunnelForExport(null);
    setExportData('');
    setExportModalOpen(true);
  };

  // 执行导出
  const executeExport = () => {
    if (!selectedTunnelForExport) {
      toast.error('请选择要导出的隧道');
      return;
    }

    setExportLoading(true);
    
    try {
      // 导出当前用户名下、指定隧道的转发
      const forwardsToExport: Forward[] = getSortedForwards().filter(forward => forward.tunnelId === selectedTunnelForExport);
      
      if (forwardsToExport.length === 0) {
        toast.error('所选隧道没有转发数据');
        setExportLoading(false);
        return;
      }
      
      // 格式化导出数据：remoteAddr|name|inPort
      const exportLines = forwardsToExport.map(forward => {
        return `${forward.remoteAddr}|${forward.name}|${forward.inPort}`;
      });
      
      const exportText = exportLines.join('\n');
      setExportData(exportText);
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  // 复制导出数据
  const copyExportData = async () => {
    await copyToClipboard(exportData, '转发数据');
  };

  // 导入转发数据
  const handleImport = () => {
    setImportData('');
    setImportResults([]);
    setSelectedTunnelForImport(null);
    setImportModalOpen(true);
  };

  // 执行导入
  const executeImport = async () => {
    if (!importData.trim()) {
      toast.error('请输入要导入的数据');
      return;
    }

    if (!selectedTunnelForImport) {
      toast.error('请选择要导入的隧道');
      return;
    }

    setImportLoading(true);
    setImportResults([]); // 清空之前的结果

    try {
      const lines = importData.trim().split('\n').filter(line => line.trim());
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const parts = line.split('|');
        
        if (parts.length < 2) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '格式错误：需要至少包含目标地址和转发名称'
          }, ...prev]);
          continue;
        }

        const [remoteAddr, name, inPort] = parts;
        
        if (!remoteAddr.trim() || !name.trim()) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '目标地址和转发名称不能为空'
          }, ...prev]);
          continue;
        }

        // 验证远程地址格式 - 支持单个地址或多个地址用逗号分隔
        const addresses = remoteAddr.trim().split(',');
        const addressPattern = /^[^:]+:\d+$/;
        const isValidFormat = addresses.every(addr => addressPattern.test(addr.trim()));
        
        if (!isValidFormat) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '目标地址格式错误，应为 地址:端口 格式，多个地址用逗号分隔'
          }, ...prev]);
          continue;
        }

        try {
          // 处理入口端口
          let portNumber: number | null = null;
          if (inPort && inPort.trim()) {
            const port = parseInt(inPort.trim());
            if (isNaN(port) || port < 1 || port > 65535) {
              setImportResults(prev => [{
                line,
                success: false,
                message: '入口端口格式错误，应为1-65535之间的数字'
              }, ...prev]);
              continue;
            }
            portNumber = port;
          }

          // 调用创建转发接口
          const response = await createForward({
            name: name.trim(),
            tunnelId: selectedTunnelForImport, // 使用用户选择的隧道
            inPort: portNumber, // 使用指定端口或自动分配
            remoteAddr: remoteAddr.trim(),
            strategy: 'fifo'
          });

          if (response.code === 0) {
            setImportResults(prev => [{
              line,
              success: true,
              message: '创建成功',
              forwardName: name.trim()
            }, ...prev]);
          } else {
            setImportResults(prev => [{
              line,
              success: false,
              message: response.msg || '创建失败'
            }, ...prev]);
          }
        } catch (error) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '网络错误，创建失败'
          }, ...prev]);
        }
      }
      
      
      toast.success(`导入执行完成`);
      
      // 导入完成后刷新转发列表
      await loadData(false);
    } catch (error) {
      console.error('导入失败:', error);
      toast.error('导入过程中发生错误');
    } finally {
      setImportLoading(false);
    }
  };

  // 获取状态显示
  const getStatusDisplay = (status: number) => {
    switch (status) {
      case 1:
        return { color: 'success', text: '正常' };
      case 0:
        return { color: 'warning', text: '暂停' };
      case -1:
        return { color: 'danger', text: '异常' };
      default:
        return { color: 'default', text: '未知' };
    }
  };

  // 获取策略显示
  const getStrategyDisplay = (strategy: string) => {
    switch (strategy) {
      case 'fifo':
        return { color: 'primary', text: '主备' };
      case 'round':
        return { color: 'success', text: '轮询' };
      case 'rand':
        return { color: 'warning', text: '随机' };
      default:
        return { color: 'default', text: '未知' };
    }
  };

  // 获取地址数量
  const getAddressCount = (addressString: string): number => {
    if (!addressString) return 0;
    const addresses = addressString.split('\n').map(addr => addr.trim()).filter(addr => addr);
    return addresses.length;
  };

  // 获取当前用户名下、经分组筛选与搜索关键字过滤后的转发列表
  const getSortedForwards = (): Forward[] => {
    if (!forwards || forwards.length === 0) return [];

    // 只显示当前登录用户自己的转发（管理员查看其他用户的转发走用户管理，不在本页）
    let filteredForwards = forwards;
    const currentUserId = JwtUtil.getUserIdFromToken();
    if (currentUserId !== null) {
      filteredForwards = forwards.filter(forward => forward.userId === currentUserId);
    }

    // 按分组过滤：null=全部，-1=未分组，否则按分组ID过滤
    if (activeGroupFilter === -1) {
      filteredForwards = filteredForwards.filter(forward => !forward.groupId);
    } else if (activeGroupFilter !== null) {
      filteredForwards = filteredForwards.filter(forward => forward.groupId === activeGroupFilter);
    }

    // 搜索规则：按名称或 #id 过滤
    const keyword = searchKeyword.trim().toLowerCase();
    if (keyword) {
      filteredForwards = filteredForwards.filter(forward =>
        forward.name.toLowerCase().includes(keyword) ||
        String(forward.id).includes(keyword)
      );
    }

    return [...filteredForwards].sort((a, b) => (a.inx ?? 0) - (b.inx ?? 0) || a.id - b.id);
  };

  // 根据设备组 ID 查找设备组（用于表格里入口/出口的名称、是否已配置设备、流量倍率标签）
  const findDeviceGroup = (id?: number | null) => (id ? deviceGroups.find(g => g.id === id) : undefined);

  // 已选中的规则 ID（供右侧工具列的批量操作使用）
  const getSelectedIds = (): number[] => {
    const list = getSortedForwards();
    if (selectedKeys === 'all') return list.map(f => f.id);
    return Array.from(selectedKeys as Set<any>).map(k => Number(k)).filter(id => list.some(f => f.id === id));
  };

  // 复制规则：以现有规则为模板打开"新增"弹窗，端口留空以便重新分配
  const handleCopyRule = (forward: Forward) => {
    setIsEdit(false);
    setForm({
      name: `${forward.name} - 副本`,
      tunnelId: forward.tunnelId,
      inPort: null,
      remoteAddr: forward.remoteAddr.split(',').join('\n'),
      interfaceName: forward.interfaceName || '',
      strategy: forward.strategy || 'fifo',
      groupId: forward.groupId ?? null,
      acceptProxyProtocol: forward.acceptProxyProtocol ? 1 : 0,
      sendProxyProtocol: forward.sendProxyProtocol ?? 0,
      ipLimit: forward.ipLimit ?? 0,
      connLimit: forward.connLimit ?? 0,
      speedLimit: forward.speedLimit ?? 0,
      inDeviceGroupId: forward.inDeviceGroupId ?? null,
      outDeviceGroupId: forward.outDeviceGroupId ?? null
    });
    setSelectedTunnel(tunnels.find(t => t.id === forward.tunnelId) || null);
    setEntryMode(forward.inDeviceGroupId ? 'device' : 'tunnel');
    setErrors({});
    setModalOpen(true);
  };

  // 批量切换（每条规则各自在运行/暂停之间切换）
  const handleBatchToggle = async () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    setBatchLoading(true);
    try {
      const results = await Promise.all(ids.map(id => {
        const f = forwards.find(x => x.id === id);
        return f?.serviceRunning ? pauseForwardService(id) : resumeForwardService(id);
      }));
      const failed = results.filter(r => r.code !== 0).length;
      toast[failed > 0 ? 'error' : 'success'](failed > 0 ? `${failed} 条操作失败` : '批量切换成功');
      loadData();
    } finally {
      setBatchLoading(false);
    }
  };

  // 批量启动/暂停（统一设为同一状态）
  const handleBatchSetRunning = async (running: boolean) => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    setBatchLoading(true);
    try {
      const results = await Promise.all(ids.map(id => running ? resumeForwardService(id) : pauseForwardService(id)));
      const failed = results.filter(r => r.code !== 0).length;
      toast[failed > 0 ? 'error' : 'success'](failed > 0 ? `${failed} 条操作失败` : (running ? '已批量启动' : '已批量暂停'));
      loadData();
    } finally {
      setBatchLoading(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    if (!window.confirm(`确定要删除选中的 ${ids.length} 条规则吗？此操作无法撤销。`)) return;
    setBatchLoading(true);
    try {
      const results = await Promise.all(ids.map(id => deleteForward(id)));
      const failed = results.filter(r => r.code !== 0).length;
      toast[failed > 0 ? 'error' : 'success'](failed > 0 ? `${failed} 条删除失败，可能仍在运行中` : '删除成功');
      setSelectedKeys(new Set([]));
      loadData();
    } finally {
      setBatchLoading(false);
    }
  };

  // 清空流量：面板暂未提供对应接口，先给出明确提示，避免误以为已生效
  const handleBatchClearFlow = () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    toast('清空流量功能需要后端支持，暂未实现', { icon: '' });
  };

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

  const myForwards = getSortedForwards();
  const myForwardsAll = forwards.filter(f => f.userId === JwtUtil.getUserIdFromToken());
  const selectedIds = getSelectedIds();
  const GB = 1024 * 1024 * 1024;
  const usedGiB = ((packageInfo?.inFlow || 0) + (packageInfo?.outFlow || 0)) / GB;

  return (

      <div className="px-3 lg:px-6 py-8 forward-page">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h1 className="text-xl font-bold text-foreground">我的转发规则</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="flat" startContent={<IconSearch />} onPress={() => setSearchModalOpen(true)}>搜索规则</Button>
            <Button size="sm" variant="flat" startContent={<IconRefresh />} isLoading={loading} onPress={() => loadData()}>刷新</Button>
            <Button size="sm" variant="flat" startContent={<IconStats />} onPress={openStats}>统计数据</Button>
          </div>
        </div>

        {/* 信息 / 分组筛选条 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Chip variant="flat" size="sm">流量: {usedGiB.toFixed(2)} GiB / {(packageInfo?.flow ?? 0).toFixed(2)} GiB</Chip>
          {packageInfo?.expTime && (
            <Chip variant="flat" size="sm">到期: {new Date(packageInfo.expTime).toLocaleString('zh-CN')}</Chip>
          )}
          <Chip variant="flat" size="sm">规则数: {myForwardsAll.length} / {packageInfo?.num ?? '-'}</Chip>
          <Button size="sm" variant="flat" startContent={<IconGroup />} onPress={() => setGroupManageModalOpen(true)}>管理分组</Button>
          <Chip
            size="sm"
            variant={activeGroupFilter === null ? 'solid' : 'flat'}
            color={activeGroupFilter === null ? 'primary' : 'default'}
            className="cursor-pointer"
            onClick={() => setActiveGroupFilter(null)}
          >
            全部
          </Chip>
          <Chip
            size="sm"
            variant={activeGroupFilter === -1 ? 'solid' : 'flat'}
            color={activeGroupFilter === -1 ? 'primary' : 'default'}
            className="cursor-pointer"
            onClick={() => setActiveGroupFilter(-1)}
          >
            未分组 ({myForwardsAll.filter(f => !f.groupId).length})
          </Chip>
          {forwardGroups.map(group => (
            <Chip
              key={group.id}
              size="sm"
              variant={activeGroupFilter === group.id ? 'solid' : 'flat'}
              color={activeGroupFilter === group.id ? 'primary' : 'default'}
              className="cursor-pointer"
              onClick={() => setActiveGroupFilter(group.id)}
            >
              {group.name} ({group.ruleCount})
            </Chip>
          ))}
        </div>

        {/* 工具列 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button size="sm" variant="flat" color="default" startContent={<IconAddSingle />} onPress={handleAdd}>添加规则</Button>
          <Button size="sm" variant="flat" startContent={<IconImport />} onPress={handleImport}>批量导入</Button>
          <Button size="sm" variant="flat" startContent={<IconExport />} isLoading={exportLoading} onPress={handleExport}>批量导出</Button>
          <Button size="sm" variant="flat" startContent={<IconToggle />} isDisabled={selectedIds.length === 0} isLoading={batchLoading} onPress={handleBatchToggle}>批量切换</Button>
          <Button size="sm" variant="flat" startContent={<IconFlow />} isDisabled={selectedIds.length === 0} onPress={handleBatchClearFlow}>清空流量</Button>
          <Button size="sm" variant="flat" color="danger" startContent={<IconDelete />} isDisabled={selectedIds.length === 0} isLoading={batchLoading} onPress={handleBatchDelete}>删除选中</Button>
        </div>

        {/* 规则列表 */}
        {myForwards.length > 0 ? (
          <Card className="shadow-sm border border-default-200">
            <CardBody className="p-0">
              <div className="settings-table-scroll">
                <Table
                  removeWrapper
                  aria-label="我的转发规则列表"
                  selectionMode="multiple"
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                  classNames={{ base: "w-full", table: "w-full management-table-selectable forward-table", th: "management-table-heading", td: "management-table-cell" }}
                >
                  <TableHeader>
                    <TableColumn>规则名</TableColumn>
                    <TableColumn>入口</TableColumn>
                    <TableColumn>出口</TableColumn>
                    <TableColumn>已用流量</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn align="end">操作</TableColumn>
                  </TableHeader>
                  <TableBody items={myForwards}>
                    {(forward) => {
                      const statusDisplay = getStatusDisplay(forward.status);
                      const strategyDisplay = getStrategyDisplay(forward.strategy);
                      const inGroup = findDeviceGroup(forward.inDeviceGroupId);
                      const outGroup = findDeviceGroup(forward.outDeviceGroupId);
                      return (
                        <TableRow key={forward.id}>
                          <TableCell>
                            <div className="font-medium text-foreground">{forward.name}</div>
                            <div className="text-xs text-default-400">#{forward.id}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{inGroup ? inGroup.name : (forward.tunnelName || '—')}</span>
                              {inGroup && (
                                <>
                                  <Chip size="sm" variant="flat" color={inGroup.nodeName ? 'success' : 'danger'}>{inGroup.nodeName ? '有设备' : '无设备'}</Chip>
                                  <Chip size="sm" variant="flat" color="success">倍率 {inGroup.ratio ?? 0}</Chip>
                                </>
                              )}
                            </div>
                            <div
                              className={`text-xs text-default-500 ${hasMultipleAddresses(forward.inIp) ? 'cursor-pointer hover:text-primary' : ''}`}
                              onClick={() => hasMultipleAddresses(forward.inIp) && showAddressModal(forward.inIp, forward.inPort, '入口地址')}
                            >
                              端口: {forward.inPort ?? '—'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{outGroup ? outGroup.name : (forward.remoteAddr ? '直连' : '—')}</span>
                              {outGroup && (
                                <>
                                  <Chip size="sm" variant="flat" color={outGroup.nodeName ? 'success' : 'danger'}>{outGroup.nodeName ? '有设备' : '无设备'}</Chip>
                                  <Chip size="sm" variant="flat" color="success">倍率 {outGroup.ratio ?? 0}</Chip>
                                </>
                              )}
                              {getAddressCount(forward.remoteAddr.split(',').join('\n')) > 1 && (
                                <Chip size="sm" variant="flat" color={strategyDisplay.color as any}>{strategyDisplay.text}</Chip>
                              )}
                            </div>
                            <div
                              className={`text-xs text-default-500 ${hasMultipleAddresses(forward.remoteAddr) ? 'cursor-pointer hover:text-primary' : ''}`}
                              onClick={() => hasMultipleAddresses(forward.remoteAddr) && showAddressModal(forward.remoteAddr, null, '目标地址')}
                            >
                              {formatRemoteAddress(forward.remoteAddr)}
                            </div>
                          </TableCell>
                          <TableCell>{formatFlow((forward.inFlow || 0) + (forward.outFlow || 0))}</TableCell>
                          <TableCell>
                            <Chip size="sm" variant="flat" color={statusDisplay.color as any}>{statusDisplay.text}</Chip>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end items-center gap-1">
                              <Button isIconOnly size="sm" variant="flat" title={forward.serviceRunning ? '暂停' : '启动'} isDisabled={forward.status !== 1 && forward.status !== 0} onPress={() => handleServiceToggle(forward)}>
                                {forward.serviceRunning ? <IconPause /> : <IconPlay />}
                              </Button>
                              <Button isIconOnly size="sm" variant="flat" title="诊断" onPress={() => handleDiagnose(forward)}><IconHelp /></Button>
                              <Button isIconOnly size="sm" variant="flat" title="复制" onPress={() => handleCopyRule(forward)}><IconCopy /></Button>
                              <Button isIconOnly size="sm" variant="flat" title="编辑" onPress={() => handleEdit(forward)}><IconEdit /></Button>
                              <Button isIconOnly size="sm" variant="flat" color="danger" title="删除" onPress={() => handleDelete(forward)}><IconDelete /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </TableBody>
                </Table>
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card className="shadow-sm border border-default-200">
            <CardBody>
              <EmptyState />
            </CardBody>
          </Card>
        )}

        {/* 右侧浮动工具列（桌面端）：可拖动到任意位置 */}
        {!isMobile && (
          <div
            ref={railRef}
            className="forward-rail"
            style={railPos ? { left: railPos.x, top: railPos.y, right: 'auto', transform: 'none' } : undefined}
          >
            <div className="rail-drag-handle" onPointerDown={handleRailDragStart} title="拖动调整位置">
              <IconDragHandle />
            </div>
            <RailButton icon={<IconGroup />} label="分组" onPress={() => setGroupManageModalOpen(true)} />
            <RailButton icon={<IconAddSingle />} label="单条" onPress={handleAdd} />
            <RailButton icon={<IconImport />} label="批量" onPress={handleImport} />
            <RailButton icon={<IconExport />} label="导出" onPress={handleExport} loading={exportLoading} />
            <RailButton icon={<IconToggle />} label="切换" onPress={handleBatchToggle} disabled={selectedIds.length === 0} loading={batchLoading} />
            <RailButton icon={<IconFlow />} label="流量" onPress={handleBatchClearFlow} disabled={selectedIds.length === 0} />
            <RailButton icon={<IconPause />} label="暂停" onPress={() => handleBatchSetRunning(false)} disabled={selectedIds.length === 0} loading={batchLoading} />
            <RailButton icon={<IconPlay />} label="启动" onPress={() => handleBatchSetRunning(true)} disabled={selectedIds.length === 0} loading={batchLoading} />
            <RailButton icon={<IconDelete />} label="删除" onPress={handleBatchDelete} disabled={selectedIds.length === 0} loading={batchLoading} danger />
          </div>
        )}

        {/* 新增/编辑模态框 */}
        <Modal
          isOpen={modalOpen}
          onOpenChange={setModalOpen}
          size="md"
          scrollBehavior="outside"
          backdrop="blur"
          placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>
                  <h2 className="text-lg font-bold">
                    {isEdit ? '编辑规则' : '添加规则'}
                  </h2>
                </ModalHeader>
                <ModalBody>
                  <div className="space-y-3 pb-4">
                    <Input autoComplete="off"
                      size="sm"
                      label="名称"
                      placeholder="请输入转发名称"
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      isInvalid={!!errors.name}
                      errorMessage={errors.name}
                      variant="bordered"
                    />
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={entryMode === 'device' ? 'solid' : 'flat'}
                        color="default"
                        onPress={() => setEntryMode('device')}
                        className="flex-1"
                      >
                        入口/出口设备组
                      </Button>
                      <Button
                        size="sm"
                        variant={entryMode === 'tunnel' ? 'solid' : 'flat'}
                        color="default"
                        onPress={() => setEntryMode('tunnel')}
                        className="flex-1"
                      >
                        选择隧道（旧版）
                      </Button>
                    </div>

                    {entryMode === 'device' ? (
                      <>
                        <Select
                          size="sm"
                          label="入口"
                          placeholder="请选择入口设备组"
                          selectedKeys={form.inDeviceGroupId ? [form.inDeviceGroupId.toString()] : []}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;
                            setForm(prev => ({ ...prev, inDeviceGroupId: selectedKey ? parseInt(selectedKey) : null }));
                          }}
                          isInvalid={!!errors.inDeviceGroupId}
                          errorMessage={errors.inDeviceGroupId}
                          variant="bordered"
                        >
                          {deviceGroups.filter((group) => {
                            const direction = group.direction || 'inbound';
                            return direction === 'inbound' || direction === 'both';
                          }).map((group) => (
                            <SelectItem key={group.id.toString()} textValue={group.name}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium">{group.name}</span>
                                <Chip size="sm" variant="flat" color={isDeviceGroupOnline(group) ? 'success' : 'danger'}>{isDeviceGroupOnline(group) ? '在线' : '离线'}</Chip>
                                <Chip size="sm" variant="flat" color="success">倍率 {group.ratio ?? 0}</Chip>
                              </div>
                            </SelectItem>
                          ))}
                        </Select>
                        {(() => {
                          const inGroup = findDeviceGroup(form.inDeviceGroupId);
                          return inGroup ? (
                            <div className="flex items-center gap-1.5 flex-wrap -mt-2">
                              <span className="text-sm font-medium">{inGroup.name}</span>
                              <Chip size="sm" variant="flat" color={isDeviceGroupOnline(inGroup) ? 'success' : 'danger'}>{isDeviceGroupOnline(inGroup) ? '在线' : '离线'}</Chip>
                              <Chip size="sm" variant="flat" color="success">倍率 {inGroup.ratio ?? 0}</Chip>
                            </div>
                          ) : null;
                        })()}

                        <Select
                          size="sm"
                          label="出口"
                          placeholder="留空则为直接端口转发"
                          selectedKeys={form.outDeviceGroupId ? [form.outDeviceGroupId.toString()] : []}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;
                            setForm(prev => ({ ...prev, outDeviceGroupId: selectedKey ? parseInt(selectedKey) : null }));
                          }}
                          variant="bordered"
                          description="不选择出口时，流量将直接从入口转发至目标地址"
                        >
                          {deviceGroups.filter((group) => {
                            const direction = group.direction || 'inbound';
                            return direction === 'outbound' || direction === 'both';
                          }).map((group) => (
                            <SelectItem key={group.id.toString()} textValue={group.name}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium">{group.name}</span>
                                <Chip size="sm" variant="flat" color={isDeviceGroupOnline(group) ? 'success' : 'danger'}>{isDeviceGroupOnline(group) ? '在线' : '离线'}</Chip>
                                <Chip size="sm" variant="flat" color="success">倍率 {group.ratio ?? 0}</Chip>
                              </div>
                            </SelectItem>
                          ))}
                        </Select>
                        {(() => {
                          const outGroup = findDeviceGroup(form.outDeviceGroupId);
                          return outGroup ? (
                            <div className="flex items-center gap-1.5 flex-wrap -mt-2">
                              <span className="text-sm font-medium">{outGroup.name}</span>
                              <Chip size="sm" variant="flat" color={isDeviceGroupOnline(outGroup) ? 'success' : 'danger'}>{isDeviceGroupOnline(outGroup) ? '在线' : '离线'}</Chip>
                              <Chip size="sm" variant="flat" color="success">倍率 {outGroup.ratio ?? 0}</Chip>
                            </div>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <Select
                        size="sm"
                        label="选择隧道"
                        placeholder="请选择关联的隧道"
                        selectedKeys={form.tunnelId ? [form.tunnelId.toString()] : []}
                        onSelectionChange={(keys) => {
                          const selectedKey = Array.from(keys)[0] as string;
                          if (selectedKey) {
                            handleTunnelChange(selectedKey);
                          }
                        }}
                        isInvalid={!!errors.tunnelId}
                        errorMessage={errors.tunnelId}
                        variant="bordered"
                      >
                        {tunnels.map((tunnel) => (
                          <SelectItem key={tunnel.id} >
                            {tunnel.name}
                          </SelectItem>
                        ))}
                      </Select>
                    )}

                    <Input autoComplete="off"
                      size="sm"
                      label="监听端口"
                      placeholder="留空则随机"
                      type="number"
                      value={form.inPort?.toString() || ''}
                      onChange={(e) => setForm(prev => ({
                        ...prev,
                        inPort: e.target.value ? parseInt(e.target.value) : null
                      }))}
                      isInvalid={!!errors.inPort}
                      errorMessage={errors.inPort}
                      variant="bordered"
                      description={
                        selectedTunnel && selectedTunnel.inNodePortSta && selectedTunnel.inNodePortEnd
                          ? `允许范围: ${selectedTunnel.inNodePortSta}-${selectedTunnel.inNodePortEnd}`
                          : undefined
                      }
                    />

                    <Textarea autoComplete="off"
                      size="sm"
                      label="目标地址"
                      placeholder={"一行一个，空行会被忽略，格式如下：\n\n1.2.3.4:5678\n[2001::]:80\nexample.com:443"}
                      value={form.remoteAddr}
                      onChange={(e) => setForm(prev => ({ ...prev, remoteAddr: e.target.value }))}
                      isInvalid={!!errors.remoteAddr}
                      errorMessage={errors.remoteAddr}
                      variant="bordered"
                      minRows={3}
                      maxRows={6}
                    />
                    
                    <Input autoComplete="off"
                      size="sm"
                      label="出口网卡名或IP"
                      placeholder="请输入出口网卡名或IP"
                      value={form.interfaceName}
                      onChange={(e) => setForm(prev => ({ ...prev, interfaceName: e.target.value }))}
                      isInvalid={!!errors.interfaceName}
                      errorMessage={errors.interfaceName}
                      variant="bordered"
                      description="用于多IP服务器指定使用那个IP请求远程地址，不懂的默认为空就行"
                    />
                    
                    <Select
                      size="sm"
                      label="所属分组"
                      placeholder="未分组"
                      selectedKeys={form.groupId ? [form.groupId.toString()] : []}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        setForm(prev => ({ ...prev, groupId: selectedKey ? parseInt(selectedKey) : null }));
                      }}
                      variant="bordered"
                    >
                      {forwardGroups.map(group => (
                        <SelectItem key={group.id.toString()}>{group.name}</SelectItem>
                      ))}
                    </Select>

                    <Accordion variant="bordered">
                      <AccordionItem key="advanced" title="高级选项">
                        <div className="space-y-3 pb-2">
                          {getAddressCount(form.remoteAddr) > 1 && (
                            <Select
                              size="sm"
                              label="负载均衡策略"
                              placeholder="请选择负载均衡策略"
                              selectedKeys={[form.strategy]}
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;
                                setForm(prev => ({ ...prev, strategy: selectedKey }));
                              }}
                              variant="bordered"
                            >
                              <SelectItem key="fifo" >主备模式 - 自上而下</SelectItem>
                              <SelectItem key="round" >轮询模式 - 依次轮换</SelectItem>
                              <SelectItem key="rand" >随机模式 - 随机选择</SelectItem>
                              <SelectItem key="hash" >哈希模式 - IP哈希</SelectItem>
                            </Select>
                          )}

                          <Select
                            size="sm"
                            label={<span className="inline-flex items-center gap-1 leading-none">接受 Proxy Protocol<Tooltip content="如果打开，用户在连接时必须发送 Proxy 头，否则连接将失败。"><span className="inline-flex items-center"><IconHelp /></span></Tooltip></span>}
                            selectedKeys={[String(form.acceptProxyProtocol)]}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;
                              setForm(prev => ({ ...prev, acceptProxyProtocol: parseInt(selectedKey) }));
                            }}
                            variant="bordered"
                          >
                            <SelectItem key="0">关闭</SelectItem>
                            <SelectItem key="1">开启 (TCP)</SelectItem>
                          </Select>

                          <Select
                            size="sm"
                            label={<span className="inline-flex items-center gap-1 leading-none">发送 Proxy Protocol<Tooltip content="如果打开，转发目标必须支持读取 Proxy 头，否则连接将失败。"><span className="inline-flex items-center"><IconHelp /></span></Tooltip></span>}
                            selectedKeys={[String(form.sendProxyProtocol)]}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;
                              setForm(prev => ({ ...prev, sendProxyProtocol: parseInt(selectedKey) }));
                            }}
                            variant="bordered"
                          >
                            <SelectItem key="0">关闭</SelectItem>
                            <SelectItem key="1">v1 (TCP)</SelectItem>
                            <SelectItem key="3">v2 (TCP+UDP)</SelectItem>
                            <SelectItem key="2">v2 (TCP)</SelectItem>
                          </Select>

                          <Input autoComplete="off"
                            size="sm"
                            label={<span className="inline-flex items-center gap-1 leading-none">规则限速<Tooltip content="该规则的最大速率，0 为不限速（与套餐/用户限速取较严格值，不同规则的限速可叠加）"><span className="inline-flex items-center"><IconHelp /></span></Tooltip></span>}
                            type="number"
                            value={form.speedLimit.toString()}
                            onChange={(e) => setForm(prev => ({ ...prev, speedLimit: parseInt(e.target.value) || 0 }))}
                            variant="bordered"
                            endContent={<span className="px-2 py-0.5 -mr-1 rounded-md bg-default-100 dark:bg-default-50/10 text-default-500 text-xs font-medium">Mbps</span>}
                          />

                          <Input autoComplete="off"
                            size="sm"
                            label={<span className="inline-flex items-center gap-1 leading-none">IP 限制<Tooltip content="单个 IP 的最大并发连接数，0 为不限制"><span className="inline-flex items-center"><IconHelp /></span></Tooltip></span>}
                            type="number"
                            value={form.ipLimit.toString()}
                            onChange={(e) => setForm(prev => ({ ...prev, ipLimit: parseInt(e.target.value) || 0 }))}
                            variant="bordered"
                          />

                          <Input autoComplete="off"
                            size="sm"
                            label={<span className="inline-flex items-center gap-1 leading-none">连接数限制<Tooltip content="该规则的总并发连接数，0 为不限制"><span className="inline-flex items-center"><IconHelp /></span></Tooltip></span>}
                            type="number"
                            value={form.connLimit.toString()}
                            onChange={(e) => setForm(prev => ({ ...prev, connLimit: parseInt(e.target.value) || 0 }))}
                            variant="bordered"
                          />
                        </div>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>
                    取消
                  </Button>
                  <Button
                    color="default"
                    onPress={handleSubmit}
                    isLoading={submitLoading}
                  >
                    {isEdit ? '保存修改' : '创建转发'}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 删除确认模态框 */}
        <ConfirmDialog
          isOpen={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          title="确认删除"
          message={<>你确定要删除转发 {forwardToDelete?.name} 吗？此操作无法撤销，删除后该转发将永久消失。</>}
          confirmText="确定"
          confirmColor="danger"
          onConfirm={confirmDelete}
          loading={deleteLoading}
        />

        {/* 地址列表弹窗 */}
        <Modal isOpen={addressModalOpen} onClose={() => setAddressModalOpen(false)} size="lg" scrollBehavior="outside">
          <ModalContent>
            <ModalHeader className="text-base">{addressModalTitle}</ModalHeader>
            <ModalBody className="pb-6">
              <div className="mb-4 text-right">
                <Button size="sm" onClick={copyAllAddresses}>
                  复制
                </Button>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {addressList.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-3 border border-default-200 dark:border-default-100 rounded-lg">
                    <code className="text-sm flex-1 mr-3 text-foreground">{item.address}</code>
                    <Button
                      size="sm"
                      variant="light"
                      isLoading={item.copying}
                      onClick={() => copyAddress(item)}
                    >
                      复制
                    </Button>
                  </div>
                ))}
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* 导出数据模态框 */}
        <Modal 
          isOpen={exportModalOpen} 
          onClose={() => {
            setExportModalOpen(false);
            setSelectedTunnelForExport(null);
            setExportData('');
          }} 
          
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">导出转发数据</h2>
              <p className="text-small text-default-500">
                格式：目标地址|转发名称|入口端口
              </p>
            </ModalHeader>
            <ModalBody className="pb-6">
              <div className="space-y-4">
                {/* 隧道选择 */}
                <div>
                  <Select
                    size="sm"
                    label="选择导出隧道"
                    placeholder="请选择要导出的隧道"
                    selectedKeys={selectedTunnelForExport ? [selectedTunnelForExport.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setSelectedTunnelForExport(selectedKey ? parseInt(selectedKey) : null);
                    }}
                    variant="bordered"
                    isRequired
                  >
                    {tunnels.map((tunnel) => (
                      <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                        {tunnel.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                {/* 导出按钮和数据 */}
                {exportData && (
                  <div className="flex justify-between items-center">
                    <Button
                      color="default"
                      size="sm"
                      onPress={executeExport}
                      isLoading={exportLoading}
                      isDisabled={!selectedTunnelForExport}
                      startContent={
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      }
                    >
                      重新生成
                    </Button>
                    <Button
                      color="default"
                      size="sm"
                      onPress={copyExportData}
                      startContent={
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                        </svg>
                      }
                    >
                      复制
                    </Button>
                  </div>
                )}

                {/* 初始导出按钮 */}
                {!exportData && (
                  <div className="text-right">
                    <Button
                      color="default"
                      size="sm"
                      onPress={executeExport}
                      isLoading={exportLoading}
                      isDisabled={!selectedTunnelForExport}
                      startContent={
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      }
                    >
                      生成导出数据
                    </Button>
                  </div>
                )}

                {/* 导出数据显示 */}
                {exportData && (
                  <div className="relative">
                    <Textarea
                      size="sm" autoComplete="off"
                      value={exportData}
                      readOnly
                      variant="bordered"
                      minRows={10}
                      maxRows={20}
                      className="font-mono text-sm"
                      classNames={{
                        input: "font-mono text-sm"
                      }}
                      placeholder="暂无数据"
                    />
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button 
                variant="light" 
                onPress={() => setExportModalOpen(false)}
              >
                关闭
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* 导入数据模态框 */}
        <Modal 
          isOpen={importModalOpen} 
          onClose={() => setImportModalOpen(false)} 
          
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">导入转发数据</h2>
              <p className="text-small text-default-500">
                格式：目标地址|转发名称|入口端口，每行一个，入口端口留空将自动分配可用端口
              </p>
              <p className="text-small text-default-400">
                目标地址支持单个地址(如：example.com:8080)或多个地址用逗号分隔(如：3.3.3.3:3,4.4.4.4:4)
              </p>
            </ModalHeader>
            <ModalBody className="pb-6">
              <div className="space-y-4">
                {/* 隧道选择 */}
                <div>
                  <Select
                    size="sm"
                    label="选择导入隧道"
                    placeholder="请选择要导入的隧道"
                    selectedKeys={selectedTunnelForImport ? [selectedTunnelForImport.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setSelectedTunnelForImport(selectedKey ? parseInt(selectedKey) : null);
                    }}
                    variant="bordered"
                    isRequired
                  >
                    {tunnels.map((tunnel) => (
                      <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                        {tunnel.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                {/* 输入区域 */}
                <div>
                  <Textarea
                    size="sm" autoComplete="off"
                    label="导入数据"
                    placeholder="请输入要导入的转发数据，格式：目标地址|转发名称|入口端口"
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    variant="flat"
                    minRows={8}
                    maxRows={12}
                    classNames={{
                      input: "font-mono text-sm"
                    }}
                  />

                
                </div>

                {/* 导入结果 */}
                {importResults.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-base font-semibold">导入结果</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-default-500">
                          成功：{importResults.filter(r => r.success).length} / 
                          总计：{importResults.length}
                        </span>
                      </div>
                    </div>
                    
                    <div className="max-h-40 overflow-y-auto space-y-1" style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgb(156 163 175) transparent'
                    }}>
                      {importResults.map((result, index) => (
                        <div 
                          key={index} 
                          className={`p-2 rounded border ${
                            result.success 
                              ? 'bg-success-50 dark:bg-success-100/10 border-success-200 dark:border-success-300/20' 
                              : 'bg-danger-50 dark:bg-danger-100/10 border-danger-200 dark:border-danger-300/20'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              <svg className="w-3 h-3 text-success-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 text-danger-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-xs font-medium ${
                                  result.success ? 'text-success-700 dark:text-success-300' : 'text-danger-700 dark:text-danger-300'
                                }`}>
                                  {result.success ? '成功' : '失败'}
                                </span>
                                <span className="text-xs text-default-500">|</span>
                                <code className="text-xs font-mono text-default-600 truncate">{result.line}</code>
                              </div>
                              <div className={`text-xs ${
                                result.success ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                              }`}>
                                {result.message}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button 
                variant="light" 
                onPress={() => setImportModalOpen(false)}
              >
                关闭
              </Button>
              <Button
                color="default"
                onPress={executeImport}
                isLoading={importLoading}
                isDisabled={!importData.trim() || !selectedTunnelForImport}
              >
                开始导入
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* 诊断结果模态框 */}
        <Modal 
          isOpen={diagnosisModalOpen}
          onOpenChange={setDiagnosisModalOpen}
          
          size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-xl font-bold">转发诊断结果</h2>
                  {currentDiagnosisForward && (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-small text-default-500 truncate flex-1 min-w-0">{currentDiagnosisForward.name}</span>
                      <Chip 
                        color="primary"
                        variant="flat" 
                        size="sm"
                        className="flex-shrink-0"
                      >
                        转发服务
                      </Chip>
                    </div>
                  )}
                </ModalHeader>
                <ModalBody>
                  {diagnosisLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="flex items-center gap-3">
                        <Spinner size="sm" />
                        <span className="text-default-600">正在诊断转发连接...</span>
                      </div>
                    </div>
                  ) : diagnosisResult ? (
                    <div className="space-y-4">
                      {diagnosisResult.results.map((result, index) => {
                        const quality = getQualityDisplay(result.averageTime, result.packetLoss);
                        
                        return (
                          <Card key={index} className={`shadow-sm border ${result.success ? 'border-success' : 'border-danger'}`}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between w-full">
                                <div>
                                  <h3 className="text-lg font-semibold text-foreground">{result.description}</h3>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-small text-default-500">节点: {result.nodeName}</span>
                                    <Chip 
                                      color={result.success ? 'success' : 'danger'} 
                                      variant="flat" 
                                      size="sm"
                                    >
                                      {result.success ? '连接成功' : '连接失败'}
                                    </Chip>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            
                            <CardBody className="pt-0">
                              {result.success ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-primary">{result.averageTime?.toFixed(0)}</div>
                                      <div className="text-small text-default-500">平均延迟(ms)</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-warning">{result.packetLoss?.toFixed(1)}</div>
                                      <div className="text-small text-default-500">丢包率(%)</div>
                                    </div>
                                    <div className="text-center">
                                      {quality && (
                                        <>
                                          <Chip color={quality.color as any} variant="flat" size="lg">
                                            {quality.text}
                                          </Chip>
                                          <div className="text-small text-default-500 mt-1">连接质量</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-small text-default-500 flex items-center gap-1">
                                    <span className="flex-shrink-0">目标地址:</span>
                                    <code className="font-mono truncate min-w-0" title={`${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`}>
                                      {result.targetIp}{result.targetPort ? ':' + result.targetPort : ''}
                                    </code>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-small text-default-500 flex items-center gap-1">
                                    <span className="flex-shrink-0">目标地址:</span>
                                    <code className="font-mono truncate min-w-0" title={`${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`}>
                                      {result.targetIp}{result.targetPort ? ':' + result.targetPort : ''}
                                    </code>
                                  </div>
                                  <Alert
                                    color="danger"
                                    variant="flat"
                                    title="错误详情"
                                    description={result.message}
                                  />
                                </div>
                              )}
                            </CardBody>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState />
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>
                    关闭
                  </Button>
                  {currentDiagnosisForward && (
                    <Button
                      color="default"
                      onPress={() => handleDiagnose(currentDiagnosisForward)}
                      isLoading={diagnosisLoading}
                    >
                      重新诊断
                    </Button>
                  )}
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 搜索规则模态框 */}
        <Modal isOpen={searchModalOpen} onOpenChange={setSearchModalOpen} size="sm" placement="center" backdrop="blur">
          <ModalContent>
            <ModalHeader>搜索规则</ModalHeader>
            <ModalBody className="pb-6">
              <Input
                size="sm"
                autoComplete="off"
                autoFocus
                placeholder="按规则名称或 #ID 搜索"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                variant="bordered"
                startContent={<IconSearch />}
                isClearable
                onClear={() => setSearchKeyword('')}
              />
              <p className="text-xs text-default-400 mt-2">共匹配 {myForwards.length} 条规则</p>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* 统计数据模态框 */}
        <Modal isOpen={statsModalOpen} onOpenChange={setStatsModalOpen} size="sm" placement="center" backdrop="blur">
          <ModalContent>
            {(onClose) => (
              <>
                <ModalBody className="pt-6 pb-2">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="11" fill="#6f9bff" />
                      <circle cx="12" cy="7.4" r="1.5" fill="#15161a" />
                      <rect x="10.7" y="10.2" width="2.6" height="7.6" rx="1.3" fill="#15161a" />
                    </svg>
                    <p className="text-sm font-medium text-foreground pt-0.5">统计数据，流量不计倍率。</p>
                  </div>
                  {dailyFlowLoading ? (
                    <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
                  ) : (
                    <div className="pl-9 py-2 space-y-2 text-sm text-foreground">
                      <p>今日流量：{formatFlow(dailyFlow?.today || 0)}</p>
                      <p>昨日流量：{formatFlow(dailyFlow?.yesterday || 0)}</p>
                    </div>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button color="default" className="w-full" onPress={onClose}>知道了</Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 管理分组模态框 */}
        <Modal
          isOpen={groupManageModalOpen}
          onOpenChange={(open) => {
            setGroupManageModalOpen(open);
            if (!open) {
              setGroupNameInput('');
              setGroupEditingId(null);
            }
          }}
          size="lg"
          scrollBehavior="outside"
          backdrop="blur"
          placement="center"
        >
          <ModalContent>
            {() => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-xl font-bold">管理分组</h2>
                </ModalHeader>
                <ModalBody>
                  <div className="flex gap-2">
                    <Input
                      size="sm" autoComplete="off"
                      placeholder="分组名称"
                      value={groupNameInput}
                      onChange={(e) => setGroupNameInput(e.target.value)}
                      variant="bordered"
                      className="flex-1"
                    />
                    <Button color="default" onPress={handleCreateGroup} isLoading={groupSubmitLoading}>
                      {groupEditingId ? '保存' : '添加'}
                    </Button>
                    {groupEditingId && (
                      <Button variant="light" onPress={() => { setGroupEditingId(null); setGroupNameInput(''); }}>
                        取消
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                    {forwardGroups.length === 0 && (
                      <p className="text-small text-default-500">暂无分组</p>
                    )}
                    {forwardGroups.map(group => (
                      <div key={group.id} className="flex items-center justify-between p-2 rounded-lg bg-default-100">
                        <span className="text-small text-foreground">{group.name}（{group.ruleCount} 条规则）</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="light" onPress={() => handleEditGroupStart(group)}>编辑</Button>
                          <Button size="sm" variant="light" color="danger" onPress={() => handleDeleteGroup(group)}>删除</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={() => setGroupManageModalOpen(false)}>
                    关闭
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </div>

  );
} 
