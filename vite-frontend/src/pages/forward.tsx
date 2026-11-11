import { TipButton } from "@/components/tip-button";
import { RuleSearchModal, EMPTY_RULE_SEARCH, countRuleSearch, matchRuleSearch } from "@/components/rule-search-modal";
import { AimOutlined, BarChartOutlined, CheckSquareOutlined, CopyOutlined, DeleteOutlined, EditOutlined, FileAddOutlined, FilterFilled, FireOutlined, FolderAddOutlined, InfoCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, SearchOutlined, SettingOutlined, SwapOutlined, RightOutlined, EditFilled } from "@/components/ant-icons";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import type { SortDescriptor } from "@heroui/table";
import { TablePagination } from "@/components/table-pagination";
import { FieldLabel, UnitField } from "@/components/form-field";
import { Chip } from "@heroui/chip";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Checkbox, CheckboxGroup } from "@heroui/checkbox";
import { Spinner } from "@heroui/spinner";
import { Accordion, AccordionItem } from "@heroui/accordion";
import toast from 'react-hot-toast';
import { copyText } from '@/utils/clipboard';
import { EmptyState } from "@/components/empty-state";
import { JsonEditor } from "@/components/json-editor";
import { TerminalBox, TERM_TEXT, TERM_ERR } from "@/components/terminal-box";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { showApiFailure } from "@/components/error-dialog";
import { nextSort, SortableHeader } from "@/components/table-sort";
import { ToastWarningIcon } from "@/components/toast-icons";
import { HelpTooltip } from "@/components/help-tooltip";
import { GroupManageDrawer } from "@/components/group-manage-drawer";
import { DiagnosisResultItem, DispatchStats, DiagnosisLeg, DiagnosisPanelFeedback } from "@/components/tcp-ping-diagnosis";

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
  diagnoseForwardDetail,
  getForwardGroupList,
  createForwardGroup,
  updateForwardGroup,
  deleteForwardGroup,
  getDeviceGroupList,
  getUserPackageInfo,
  getAllUsers,
  getForwardDailyFlow
} from "@/api";
import { JwtUtil } from "@/utils/jwt";
import { isAdmin } from "@/utils/auth";
import { isTimeConfigured, formatExpiryTime } from "@/utils/time";
import RefreshButton from "@/components/refresh-button";

// ========== 图标（转发规则页专用的一批简单线性小图标） ==========
const IconSearch = () => <SearchOutlined />;
const IconStats = () => <BarChartOutlined />;
const IconFilter = () => <FilterFilled />;
const IconGroup = () => <FolderAddOutlined />;
const IconAddSingle = () => <FileAddOutlined />;
const IconImport = () => <FileAddOutlined />;
const IconExport = () => <CopyOutlined />;
const IconToggle = () => <CheckSquareOutlined />;
const IconFlow = () => <FireOutlined />;
const IconPause = () => <PauseCircleOutlined />;
const IconPlay = () => <PlayCircleOutlined />;
const IconDelete = () => <DeleteOutlined />;
const IconEdit = () => <EditOutlined />;
const IconHelp = () => <AimOutlined />;
const IconCopy = () => <CopyOutlined />;
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
  weights?: string;
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
  // 各目标地址的权重（逗号分隔，与地址按顺序对应），仅轮询、随机策略使用；空表示不加权
  weights: string;
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
  userId: number;
}

interface DeviceGroupOption {
  id: number;
  name: string;
  nodeName: string;
  ratio?: number;
  direction?: 'inbound' | 'outbound' | 'monitor' | 'both';
  node?: { status?: number };
  ownerUserId?: number | null;
  allowedOutGroupIds?: string | null;
  allowedInGroupIds?: string | null;
  directForwardMode?: number;
}

// 入口设备组设置了「限制出口」（英文逗号分隔的出口设备组 ID）时，只能选择列表内的出口；为空表示不限制
const isOutAllowedForEntry = (entry: DeviceGroupOption | undefined, outId: number): boolean => {
  const allowed = (entry?.allowedOutGroupIds || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(String(outId));
};

// 出口设备组设置了「限制入口」时，只有列表内的入口才能选到它；为空表示不限制
const isInAllowedForExit = (exit: DeviceGroupOption | undefined, inId: number): boolean => {
  const allowed = (exit?.allowedInGroupIds || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(String(inId));
};

// 入口的直接转发策略：0-禁止（必须选出口），1-可选（默认），2-强制（不能选出口）
const getDirectMode = (entry?: DeviceGroupOption): number => entry?.directForwardMode ?? 1;

// 入口与出口的搭配是否同时满足两边的限制
const isPairAllowed = (entry: DeviceGroupOption | undefined, exit: DeviceGroupOption | undefined): boolean =>
  !!entry && !!exit && isOutAllowedForEntry(entry, exit.id) && isInAllowedForExit(exit, entry.id);

const isDeviceGroupOnline = (group?: DeviceGroupOption) => !!group?.nodeName && group.node?.status === 1;

// 表格里入口/出口设备的状态标签：没有绑定设备显示「无设备」，绑定了则按设备当前是否在线显示「在线」或「离线」
const deviceStatusTag = (group: DeviceGroupOption) => {
  if (!group.nodeName) return { text: '无设备', color: 'danger' as const };
  return isDeviceGroupOnline(group) ? { text: '在线', color: 'success' as const } : { text: '离线', color: 'danger' as const };
};

// 规则列表里的小标签：细边框 + 浅色底（如「无设备」「倍率 0」）
const TAG_STYLES: Record<string, string> = {
  success: 'text-success border-success/40 bg-success/10',
  danger: 'text-danger border-danger/40 bg-danger/10',
  warning: 'text-warning border-warning/40 bg-warning/10',
  primary: 'text-primary border-primary/40 bg-primary/10',
  secondary: 'text-secondary border-secondary/40 bg-secondary/10',
  default: 'text-default-500 border-default-300 bg-default-100',
};
const RuleTag = ({ color = 'default', children }: { color?: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center h-5 px-1.5 rounded border text-xs leading-none whitespace-nowrap ${TAG_STYLES[color] || TAG_STYLES.default}`}>{children}</span>
);

// 状态列直接显示彩色文字
const STATUS_TEXT_STYLES: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  default: 'text-foreground',
};

interface AddressItem {
  id: number;
  address: string;
  copying: boolean;
}

interface DiagnosisResult {
  forwardId?: number;
  forwardName: string;
  timestamp: number;
  dispatchStats?: DispatchStats;
  results: DiagnosisResultItem[];
}

export default function ForwardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // 本组件同时挂载在两个独立路由下：/forward 是每个用户自己的"我的转发规则"，
  // /user-forward 是管理员从"用户管理"页点击"管理转发规则"进入的专属页面，带 ?userId=&userName=，
  // 用来代该用户查看/新增/编辑/删除转发规则。只有落在 /user-forward 这个专属页面时才会进入代管模式，
  // 避免 /forward 这个所有人都能访问的自助页面因为 URL 上恰好带了同名参数就被误切换
  const isManagePage = location.pathname === '/user-forward';
  const impersonateUserId = isManagePage && isAdmin() && searchParams.get('userId') ? Number(searchParams.get('userId')) : null;
  const impersonateUserName = searchParams.get('userName') || '';
  const isImpersonating = impersonateUserId !== null;
  // 当前页面实际归属哪个用户：代管模式下是目标用户，否则是自己；转发规则和分组的过滤、
  // 归属统一用这一个值，避免代管模式下有的地方过滤对了、有的地方漏改还是按自己过滤
  const scopeUserId = isImpersonating ? impersonateUserId : JwtUtil.getUserIdFromToken();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  // 规则列表变化（删除、刷新）后，把勾选里已经不存在的规则去掉；列表空了时清掉「全选」，
  // 否则删光规则后表头的全选框仍显示为勾选
  useEffect(() => {
    setSelectedKeys((prev: any) => {
      if (prev === 'all') return forwards.length === 0 ? new Set([]) : prev;
      const existing = new Set(forwards.map(f => String(f.id)));
      const next = new Set(Array.from(prev as Set<any>).filter(key => existing.has(String(key))));
      return next.size === (prev as Set<any>).size ? prev : next;
    });
  }, [forwards]);
  // 表格列排序（未点击表头时保持规则原有的自定义顺序）与分页
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor | undefined>(undefined);
  const [page, setPage] = useState(1);
  // 状态列筛选：空数组表示不过滤（显示全部状态），否则只显示选中状态的规则
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [batchLoading, setBatchLoading] = useState(false);

  // 右侧浮动工具列：可拖动到任意位置，位置记住在本地，下次打开还在原地；
  // 平时收起为一个小圆点，点击（非拖动）展开为完整工具条，再点击一次收起
  const railRef = useRef<HTMLDivElement | null>(null);
  const railDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);
  const [railPos, setRailPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('forward-rail-pos');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 桌面端侧边导航栏宽度（对应 admin.tsx 的 w-72），拖动条不能被拖到这块区域里，
  // 否则会被侧边栏挡住/盖住导致完全看不见、也点不到（这是之前的 bug）
  const SIDEBAR_WIDTH = 288;

  const clampRailPos = (x: number, y: number) => {
    const el = railRef.current;
    const w = el?.offsetWidth || 56;
    const h = el?.offsetHeight || 320;
    const minX = SIDEBAR_WIDTH + 4;
    const maxX = Math.max(minX, window.innerWidth - w - 4);
    const maxY = Math.max(4, window.innerHeight - h - 4);
    return { x: Math.min(Math.max(minX, x), maxX), y: Math.min(Math.max(4, y), maxY) };
  };

  const handleRailDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = railRef.current?.getBoundingClientRect();
    const originX = railPos?.x ?? (rect?.left ?? window.innerWidth - 70);
    const originY = railPos?.y ?? (rect?.top ?? window.innerHeight / 2 - 150);
    railDragRef.current = { startX: e.clientX, startY: e.clientY, originX, originY, moved: false };

    const handleMove = (ev: PointerEvent) => {
      if (!railDragRef.current) return;
      const dx = ev.clientX - railDragRef.current.startX;
      const dy = ev.clientY - railDragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        railDragRef.current.moved = true;
      }
      setRailPos(clampRailPos(railDragRef.current.originX + dx, railDragRef.current.originY + dy));
    };
    const handleUp = () => {
      const wasMoved = railDragRef.current?.moved ?? false;
      railDragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!wasMoved) {
        // 没有实际拖动位移，视为一次点击：切换展开/收起
        setRailExpanded(prev => !prev);
        return;
      }
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

  // 修复历史遗留问题：之前保存到 localStorage 的位置可能落在侧边栏区域（旧版本没有限制拖动范围），
  // 页面加载后如果发现记住的位置越界，重新收回可见区域并覆盖保存
  useEffect(() => {
    if (!railPos) return;
    const fixed = clampRailPos(railPos.x, railPos.y);
    if (fixed.x !== railPos.x || fixed.y !== railPos.y) {
      setRailPos(fixed);
      try { localStorage.setItem('forward-rail-pos', JSON.stringify(fixed)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜索规则
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState(EMPTY_RULE_SEARCH);
  const activeSearchCount = countRuleSearch(searchFilters);

  // 统计数据
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [dailyFlowLoading, setDailyFlowLoading] = useState(false);
  const [dailyFlow, setDailyFlow] = useState<{ today: number; yesterday: number } | null>(null);

  const openStats = async () => {
    setStatsModalOpen(true);
    setDailyFlowLoading(true);
    try {
      const res = await getForwardDailyFlow(isImpersonating && impersonateUserId ? impersonateUserId : undefined);
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
  
  // 导入相关状态
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [selectedTunnelForImport, setSelectedTunnelForImport] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<'device' | 'tunnel'>('device');
  const [importInGroupId, setImportInGroupId] = useState<number | null>(null);
  const [importOutGroupId, setImportOutGroupId] = useState<number | null>(null);
  // JSON 设置：合并到每条规则的创建参数里，覆盖除目标地址以外的配置
  const [importJson, setImportJson] = useState('');
  const [importJsonOpen, setImportJsonOpen] = useState(false); // 默认收起
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
    weights: '',
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

  // 加载套餐流量/到期/规则数上限，用于顶部信息条
  const loadPackageInfo = async () => {
    try {
      // 管理员代管用户时，/user/package 返回的是管理员自己的套餐；改从用户列表里取目标用户本人的数据
      // （字段和单位与套餐信息一致：流量上限 GiB、已用上下行字节、到期时间戳、最大规则数）
      let info: any = null;
      if (isImpersonating) {
        const res = await getAllUsers();
        if (res.code === 0) {
          info = (res.data || []).find((u: any) => u.id === impersonateUserId) ?? null;
        }
      } else {
        const res = await getUserPackageInfo();
        if (res.code === 0) {
          info = res.data?.userInfo ?? null;
        }
      }
      if (info) {
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
        : await createForwardGroup({ name: groupNameInput, ...(isImpersonating ? { userId: impersonateUserId } : {}) });
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

  // 手动刷新：不切换到整页加载状态，按钮上的图标转圈直到数据返回；至少转满一圈，避免请求太快看不到反馈
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const minSpin = new Promise(resolve => setTimeout(resolve, 700));
    try {
      await Promise.all([loadData(false), minSpin]);
    } finally {
      setRefreshing(false);
    }
  };

  // 加载所有数据
  const loadData = async (lod = true) => {
    setLoading(lod);
    try {
      // 入口/出口的名称、在线状态来自设备组列表，必须和规则列表一起取回再显示，
      // 否则规则先出来、设备组还没到时入口/出口那两列是空的，要点刷新才补上
      const [forwardsRes, tunnelsRes, deviceGroupsRes] = await Promise.all([
        getForwardList(),
        userTunnel(),
        getDeviceGroupList()
      ]);

      if (deviceGroupsRes.code === 0) {
        setDeviceGroups(deviceGroupsRes.data || []);
      } else {
        console.warn('获取设备组列表失败:', deviceGroupsRes.msg);
      }
      
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

  // 自动刷新：页面重新回到前台（切换标签页、从其他窗口切回）时立即刷新一次，停留在页面上时每 30 秒静默刷新一次，
  // 规则状态、入口/出口设备是否在线就不会停在旧数据上，不用再手动点刷新；刷新过程不切换到整页加载状态
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') loadDataRef.current(false);
    };
    const timer = window.setInterval(refreshIfVisible, 30000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!form.name.trim()) {
      newErrors.name = '名称不能为空';
    } else if (form.name.length < 2 || form.name.length > 50) {
      newErrors.name = '转发名称长度应在2-50个字符之间';
    }
    
    if (entryMode === 'tunnel') {
      if (!form.tunnelId) {
        newErrors.tunnelId = '关联隧道不能为空';
      }
    } else {
      if (!form.inDeviceGroupId) {
        newErrors.inDeviceGroupId = '入口设备组不能为空';
      } else if (getDirectMode(deviceGroups.find(g => g.id === form.inDeviceGroupId)) === 0 && !form.outDeviceGroupId) {
        newErrors.outDeviceGroupId = '该入口不允许直接转发，请选择出口';
      }
    }

    if (!form.remoteAddr.trim()) {
      newErrors.remoteAddr = '远程地址不能为空';
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

    if (form.speedLimit < 0) newErrors.speedLimit = '规则限速不能小于0';
    if (form.ipLimit < 0) newErrors.ipLimit = 'IP 限制不能小于0';
    if (form.connLimit < 0) newErrors.connLimit = '连接数限制不能小于0';

    // 校验不通过时不再把输入框标红，而是弹出失败提示框（与服务端返回失败时的样式一致），
    // 标题带 400；一次只提示表单里排在最前面的那一项，改好再提交时依次提示下一项，不把所有问题堆在同一个框里
    const messages = Object.values(newErrors);
    if (messages.length > 0) {
      setErrors({});
      showApiFailure(isEdit ? '规则更新' : '规则创建', { code: 400, msg: messages[0] });
      return false;
    }
    setErrors({});
    return true;
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
      weights: '',
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
      weights: forward.weights || '',
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

  // 高级编辑：以 JSON 编辑单条规则。dest 总是显示，其它设置只显示与默认值不同的，所以保存时
  // 没写的设置按默认值（策略 fifo、不限速等）；name / listen_port 不显示，没写时沿用规则当前的值。
  // 键名与批量导出一致（dest / listen_port / name）
  const ADVANCED_KEYS = ['dest', 'listen_port', 'name', 'strategy', 'weights', 'interface', 'accept_proxy_protocol', 'send_proxy_protocol', 'ip_limit', 'conn_limit', 'speed_limit'];
  const ADVANCED_STRATEGIES = ['fifo', 'round', 'rand', 'hash', 'leastconn'];
  const [jsonTarget, setJsonTarget] = useState<Forward | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonLoading, setJsonLoading] = useState(false);

  const forwardToAdvancedJson = (forward: Forward): Record<string, unknown> => {
    const json: Record<string, unknown> = {
      dest: (forward.remoteAddr || '').split(',').map(addr => addr.trim()).filter(Boolean),
    };
    if (forward.strategy && forward.strategy !== 'fifo') json.strategy = forward.strategy;
    if (forward.weights) json.weights = forward.weights.split(',').map(w => parseInt(w, 10) || 1);
    if (forward.interfaceName) json.interface = forward.interfaceName;
    if (forward.acceptProxyProtocol) json.accept_proxy_protocol = forward.acceptProxyProtocol;
    if (forward.sendProxyProtocol) json.send_proxy_protocol = forward.sendProxyProtocol;
    if (forward.ipLimit) json.ip_limit = forward.ipLimit;
    if (forward.connLimit) json.conn_limit = forward.connLimit;
    if (forward.speedLimit) json.speed_limit = forward.speedLimit;
    return json;
  };

  const handleOpenJsonEdit = (forward: Forward) => {
    setJsonTarget(forward);
    setJsonText(JSON.stringify(forwardToAdvancedJson(forward)));
  };

  // 校验 JSON 并换成更新接口的参数；失败返回错误原因
  const parseAdvancedJson = (forward: Forward, text: string): { data?: Record<string, unknown>; error?: string } => {
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { error: 'JSON 格式错误' };
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: '应为 JSON 对象' };
    const unknown = Object.keys(json).filter(key => !ADVANCED_KEYS.includes(key));
    if (unknown.length > 0) return { error: `不支持的字段：${unknown.join('、')}，可用字段：${ADVANCED_KEYS.join('、')}` };

    const dest = Array.isArray(json.dest) ? json.dest : (json.dest != null ? [json.dest] : []);
    const addresses = dest.map((addr: unknown) => String(addr).trim()).filter(Boolean);
    if (addresses.length === 0) return { error: 'dest 至少需要一个目标地址' };
    const nonNegativeInt = (key: string, value: unknown) => (Number.isInteger(value) && (value as number) >= 0) ? null : `${key} 应为非负整数`;
    for (const key of ['listen_port', 'accept_proxy_protocol', 'send_proxy_protocol', 'ip_limit', 'conn_limit', 'speed_limit']) {
      if (json[key] !== undefined && json[key] !== null) {
        const err = nonNegativeInt(key, json[key]);
        if (err) return { error: err };
      }
    }
    if (json.listen_port != null && (json.listen_port < 1 || json.listen_port > 65535)) return { error: 'listen_port 应在 1-65535 之间' };
    const strategy = json.strategy ?? 'fifo';
    if (!ADVANCED_STRATEGIES.includes(strategy)) return { error: `strategy 只能是 ${ADVANCED_STRATEGIES.join(' / ')}` };
    let weights = '';
    if (json.weights != null) {
      if (!Array.isArray(json.weights) || json.weights.some((w: unknown) => !Number.isInteger(w) || (w as number) < 1)) {
        return { error: 'weights 应为正整数数组' };
      }
      weights = json.weights.join(',');
    }
    // 只有多个目标、轮询 / 随机策略时权重才有意义
    if (addresses.length <= 1 || !strategySupportsWeights(strategy)) weights = '';
    const name = json.name !== undefined ? String(json.name).trim() : forward.name;
    if (!name) return { error: 'name 不能为空' };

    const num = (key: string) => (json[key] != null ? json[key] : 0);
    return {
      data: {
        id: forward.id,
        userId: forward.userId,
        name,
        ...(forward.inDeviceGroupId
          ? { tunnelId: null, inDeviceGroupId: forward.inDeviceGroupId, outDeviceGroupId: forward.outDeviceGroupId ?? null }
          : { tunnelId: forward.tunnelId, inDeviceGroupId: null, outDeviceGroupId: null }),
        inPort: json.listen_port ?? forward.inPort,
        remoteAddr: addresses.join(','),
        interfaceName: json.interface != null ? String(json.interface) : '',
        strategy: addresses.length > 1 ? strategy : 'fifo',
        weights,
        groupId: forward.groupId ?? null,
        acceptProxyProtocol: num('accept_proxy_protocol'),
        sendProxyProtocol: num('send_proxy_protocol'),
        ipLimit: num('ip_limit'),
        connLimit: num('conn_limit'),
        speedLimit: num('speed_limit'),
      },
    };
  };

  const submitJsonEdit = async () => {
    if (!jsonTarget) return;
    const { data, error } = parseAdvancedJson(jsonTarget, jsonText);
    if (error || !data) {
      showApiFailure('规则更新', { code: 400, msg: error });
      return;
    }
    setJsonLoading(true);
    try {
      const res = await updateForward(data);
      if (res.code === 0) {
        if (res.msg && res.msg.includes('离线')) {
          toast(res.msg, { icon: <ToastWarningIcon />, duration: 6000 });
        } else {
          toast.success('修改成功');
        }
        setJsonTarget(null);
        loadData();
      } else {
        showApiFailure('规则更新', res);
      }
    } catch {
      showApiFailure('规则更新', null);
    } finally {
      setJsonLoading(false);
    }
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
        // 常规删除失败（如节点离线、节点端删除失败）：不再询问，直接强制删除（不验证节点端是否已删除对应的转发服务）
        const forceRes = await forceDeleteForward(forwardToDelete.id);
        if (forceRes.code === 0) {
          toast.success('删除成功');
          setDeleteModalOpen(false);
          loadData();
        } else {
          showApiFailure('规则删除', forceRes);
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
          weights: buildWeightsForSubmit(addressCount),
          groupId: form.groupId,
          acceptProxyProtocol: form.acceptProxyProtocol,
          sendProxyProtocol: form.sendProxyProtocol,
          ipLimit: form.ipLimit,
          connLimit: form.connLimit,
          speedLimit: form.speedLimit
        };
        res = await updateForward(updateData);
      } else {
        // 创建时不需要id和userId（后端会自动设置为当前登录用户）；
        // 管理员代用户创建时（isImpersonating）需显式带上目标用户ID
        const createData = {
          name: form.name,
          ...(isImpersonating ? { userId: impersonateUserId } : {}),
          ...entryFields,
          inPort: form.inPort,
          remoteAddr: processedRemoteAddr,
          interfaceName: form.interfaceName,
          strategy: addressCount > 1 ? form.strategy : 'fifo',
          weights: buildWeightsForSubmit(addressCount),
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
        showApiFailure(isEdit ? '规则更新' : '规则创建', res);
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
        // 暂停 / 恢复时节点暂未同步（没有设备、离线等），后端仍记为目标状态并返回说明，提示用户节点就绪后会自动补推
        toast.success(res.msg && res.msg.includes('暂未同步') ? res.msg : (targetState ? '服务已启动' : '服务已暂停'));
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
        showApiFailure(targetState ? '规则启动' : '规则暂停', res);
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

  // 诊断转发：规则被暂停/异常时，转发本身没在运行，诊断没有意义，不允许发起
  // 点开某一段的诊断详情时，只对这一段按「诊断详情连接次数」重新测试
  const loadForwardDiagnosisDetail = async (result: DiagnosisResultItem): Promise<DiagnosisResultItem | null> => {
    if (!currentDiagnosisForward || !result.targetPort) return null;
    try {
      const response = await diagnoseForwardDetail({
        forwardId: currentDiagnosisForward.id,
        leg: result.leg,
        targetIp: result.targetIp,
        targetPort: result.targetPort
      });
      if (response.code === 0) return response.data as DiagnosisResultItem;
      toast.error(response.msg || '重新测试失败，显示首次诊断结果');
    } catch (error) {
      toast.error('重新测试失败，显示首次诊断结果');
    }
    return null;
  };

  const handleDiagnose = async (forward: Forward) => {
    if (forward.status !== 1) {
      toast.error('转发规则未处于正常状态，暂不能诊断');
      return;
    }
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
      const success = await copyText(text);
      if (success) {
        toast.success(`已复制${label}`);
      } else {
        toast.error('复制失败');
      }
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

  // 批量导出：不弹窗，把表格里勾选的规则直接复制为 JSON，一行一条，如
  // {"dest":["test.com:20000"],"listen_port":46267,"name":"test"}；多个目标地址（英文逗号分隔）拆成 dest 数组，按列表顺序
  const handleExport = async () => {
    const ids = new Set(getSelectedIds());
    const rules = getSortedForwards().filter(f => ids.has(f.id));
    if (rules.length === 0) {
      toast.error('请先勾选要导出的规则');
      return;
    }
    const text = rules
      .map(f => JSON.stringify({
        dest: (f.remoteAddr || '').split(',').map(addr => addr.trim()).filter(Boolean),
        listen_port: f.inPort,
        name: f.name,
      }))
      .join('\n');
    const success = await copyText(text).catch(() => false);
    if (success) {
      toast.success(`已复制 ${rules.length} 条规则`);
    } else {
      toast.error('复制失败');
    }
  };

  // 导入转发数据
  const handleImport = () => {
    setImportData('');
    setImportResults([]);
    setSelectedTunnelForImport(null);
    setImportInGroupId(null);
    setImportOutGroupId(null);
    setImportJson('');
    setImportJsonOpen(false);
    setImportModalOpen(true);
  };

  // 执行导入
  const executeImport = async () => {
    if (!importData.trim()) {
      toast.error('请输入要导入的数据');
      return;
    }

    const importEntry = deviceGroups.find(g => g.id === importInGroupId);
    if (importMode === 'tunnel' && !selectedTunnelForImport) {
      toast.error('请选择要导入的隧道');
      return;
    }
    if (importMode === 'device') {
      if (!importInGroupId) {
        toast.error('请选择入口');
        return;
      }
      if (getDirectMode(importEntry) === 0 && !importOutGroupId) {
        toast.error('该入口不允许直接转发，请选择出口');
        return;
      }
    }

    // JSON 设置：必须是对象；目标地址（remoteAddr）以每行的为准，不允许覆盖
    let jsonOverrides: Record<string, unknown> = {};
    if (importJson.trim()) {
      try {
        const parsed = JSON.parse(importJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
        const { remoteAddr: _ignored, ...rest } = parsed as Record<string, unknown>;
        jsonOverrides = rest;
      } catch {
        toast.error('JSON 设置格式错误，应为 JSON 对象');
        return;
      }
    }
    const entryFields = importMode === 'tunnel'
      ? { tunnelId: selectedTunnelForImport, inDeviceGroupId: null, outDeviceGroupId: null }
      : { tunnelId: null, inDeviceGroupId: importInGroupId, outDeviceGroupId: getDirectMode(importEntry) === 2 ? null : importOutGroupId };

    setImportLoading(true);
    setImportResults([]); // 清空之前的结果

    try {
      const lines = importData.trim().split('\n').filter(line => line.trim());
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 两种格式：批量导出的 JSON（{"dest":["a.com:80"],"listen_port":1000,"name":"x"}，dest 也可以是字符串），
        // 或旧格式 目标地址|规则名|入口端口
        let remoteAddr: string;
        let name: string;
        let inPort: string | undefined;
        if (line.startsWith('{')) {
          let parsed: any;
          try {
            parsed = JSON.parse(line);
          } catch {
            parsed = null;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setImportResults(prev => [{
              line,
              success: false,
              message: 'JSON 格式错误'
            }, ...prev]);
            continue;
          }
          const dest = Array.isArray(parsed.dest) ? parsed.dest : (parsed.dest != null ? [parsed.dest] : []);
          remoteAddr = dest.map((addr: unknown) => String(addr).trim()).filter(Boolean).join(',');
          name = parsed.name != null ? String(parsed.name) : '';
          inPort = parsed.listen_port != null && parsed.listen_port !== '' ? String(parsed.listen_port) : undefined;
        } else {
          const parts = line.split('|');
          if (parts.length < 2) {
            setImportResults(prev => [{
              line,
              success: false,
              message: '格式错误：需要至少包含目标地址和转发名称'
            }, ...prev]);
            continue;
          }
          [remoteAddr, name, inPort] = parts;
        }
        
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
          // 优先级：默认值 < JSON 设置 < 每行的规则名 / 入口端口 / 目标地址；入口出口以对话框里选的为准
          const response = await createForward({
            strategy: 'fifo',
            ...(isImpersonating ? { userId: impersonateUserId } : {}),
            ...jsonOverrides,
            name: name.trim(),
            ...entryFields,
            inPort: portNumber ?? jsonOverrides.inPort ?? null, // 每行和 JSON 都没填端口时自动分配
            remoteAddr: remoteAddr.trim(),
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
  const getStatusDisplay = (key: string) => {
    switch (key) {
      case '1':
        return { color: 'success', text: '正常' };
      case '0':
        return { color: 'warning', text: '已暂停' };
      case '-1':
        return { color: 'danger', text: '异常' };
      case 'unsynced':
        return { color: 'default', text: '未同步' };
      default:
        return { color: 'default', text: '未知' };
    }
  };

  // 只有轮询、随机策略按权重分配流量；主备、IP 哈希不使用权重
  const strategySupportsWeights = (strategy: string) => strategy === 'round' || strategy === 'rand';

  // 第 index 个目标地址当前的权重（没填或不是正整数按 1）
  const weightAt = (weights: string, index: number): number => {
    const value = parseInt((weights || '').split(',')[index] ?? '', 10);
    return value > 0 ? value : 1;
  };

  const updateWeight = (index: number, count: number, value: number) => {
    setForm(prev => {
      const next = Array.from({ length: count }, (_, i) => weightAt(prev.weights, i));
      next[index] = value > 0 ? value : 1;
      return { ...prev, weights: next.join(',') };
    });
  };

  // 提交时的权重字符串：只有多个目标地址且策略支持权重、并且确实有大于 1 的权重时才保存，否则存空（不加权）
  const buildWeightsForSubmit = (addressCount: number): string => {
    if (addressCount <= 1 || !strategySupportsWeights(form.strategy)) return '';
    const list = Array.from({ length: addressCount }, (_, i) => weightAt(form.weights, i));
    return list.some(w => w > 1) ? list.join(',') : '';
  };

  // 获取策略显示：设置了权重的轮询、随机显示为「加权轮询」「加权随机」
  const getStrategyDisplay = (strategy: string, weights?: string) => {
    const weighted = strategySupportsWeights(strategy) && (weights || '').split(',').some(w => parseInt(w, 10) > 1);
    switch (strategy) {
      case 'fifo':
        return { color: 'primary', text: '故障转移' };
      case 'round':
        return { color: 'success', text: weighted ? '加权轮询' : '轮询' };
      case 'rand':
        return { color: 'warning', text: weighted ? '加权随机' : '随机' };
      case 'hash':
        return { color: 'secondary', text: 'ip_hash' };
      case 'leastconn':
        return { color: 'secondary', text: '最小连接数' };
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

    // 默认只显示当前登录用户自己的转发；管理员带 ?userId= 进入时（用户管理页"管理转发规则"），
    // 改为只显示该目标用户的转发
    let filteredForwards = forwards;
    if (scopeUserId !== null) {
      filteredForwards = forwards.filter(forward => forward.userId === scopeUserId);
    }

    // 按分组过滤：null=全部，-1=未分组，否则按分组ID过滤
    if (activeGroupFilter === -1) {
      filteredForwards = filteredForwards.filter(forward => !forward.groupId);
    } else if (activeGroupFilter !== null) {
      filteredForwards = filteredForwards.filter(forward => forward.groupId === activeGroupFilter);
    }

    filteredForwards = filteredForwards.filter(forward => matchRuleSearch(forward, searchFilters));

    // 状态筛选：表头「状态」列的漏斗图标，可多选
    if (statusFilter.length > 0) {
      filteredForwards = filteredForwards.filter(forward => statusFilter.includes(getRuleStatusKey(forward)));
    }

    return [...filteredForwards].sort((a, b) => (a.inx ?? 0) - (b.inx ?? 0) || a.id - b.id);
  };

  // 根据设备组 ID 查找设备组（用于表格里入口/出口的名称、是否已配置设备、流量倍率标签）
  const findDeviceGroup = (id?: number | null) => (id ? deviceGroups.find(g => g.id === id) : undefined);

  // 规则状态：在后端状态（1 正常 / 0 暂停 / -1 异常）基础上，应当运行的规则若入口或出口设备组离线、没有设备，
  // 配置推送不到节点（等节点上线后由同步重试队列补推），显示为「未同步」
  const getRuleStatusKey = (forward: Forward): string => {
    if (forward.status === 1) {
      const groups = [findDeviceGroup(forward.inDeviceGroupId), findDeviceGroup(forward.outDeviceGroupId)].filter(Boolean) as DeviceGroupOption[];
      if (groups.some(group => !isDeviceGroupOnline(group))) return 'unsynced';
    }
    return String(forward.status);
  };

  // 当前页要显示的规则：先按表头排序（若点击过），再按分页截取
  const getDisplayForwards = (): Forward[] => {
    const list = getSortedForwards();
    let sorted = list;
    if (sortDescriptor?.column) {
      const dir = sortDescriptor.direction === 'descending' ? -1 : 1;
      const valueOf = (f: Forward): string | number => {
        switch (sortDescriptor.column) {
          case 'name': return f.name.toLowerCase();
          case 'in': return (findDeviceGroup(f.inDeviceGroupId)?.name || f.tunnelName || '').toLowerCase();
          case 'out': return (findDeviceGroup(f.outDeviceGroupId)?.name || f.remoteAddr || '').toLowerCase();
          case 'flow': return (f.inFlow || 0) + (f.outFlow || 0);
          case 'status': return f.status;
          default: return 0;
        }
      };
      sorted = [...list].sort((a, b) => {
        const va = valueOf(a), vb = valueOf(b);
        if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb, 'zh') * dir;
        return ((va as number) - (vb as number)) * dir;
      });
    }
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, totalPages);
    return sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  };

  // 已选中的规则 ID（供右侧工具列的批量操作使用）
  const getSelectedIds = (): number[] => {
    // 只对当前页可见的规则生效，避免「全选」误操作到翻页后看不到的规则
    const list = getDisplayForwards();
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
      weights: forward.weights || '',
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

  // 批量删除：先弹出确认框（与其它删除确认同样的样式），确定后再删除
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const handleBatchDelete = () => {
    if (getSelectedIds().length === 0) return;
    setBatchDeleteOpen(true);
  };
  const confirmBatchDelete = async () => {
    const ids = getSelectedIds();
    setBatchDeleteOpen(false);
    if (ids.length === 0) return;
    setBatchLoading(true);
    try {
      // 与单条删除一致：常规删除失败的直接强制删除（不验证节点端是否已删除对应的转发服务）
      const results = await Promise.all(ids.map(async id => {
        const res = await deleteForward(id);
        return res.code === 0 ? res : forceDeleteForward(id);
      }));
      const failed = results.filter(r => r.code !== 0).length;
      toast[failed > 0 ? 'error' : 'success'](failed > 0 ? `${failed} 条删除失败` : '删除成功');
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
  const displayForwards = getDisplayForwards();
  const myForwardsAll = forwards.filter(f => f.userId === scopeUserId);
  const scopedForwardGroups = forwardGroups.filter(g => g.userId === scopeUserId);
  const selectedIds = getSelectedIds();
  const GB = 1024 * 1024 * 1024;
  const usedGiB = ((packageInfo?.inFlow || 0) + (packageInfo?.outFlow || 0)) / GB;

  return (

      <div className="management-page px-4 lg:px-6 py-5 lg:py-6 forward-page">
        <Card className="management-table-card max-w-[1600px] mx-auto">
        {/* 页面头部：标题与搜索/刷新放在同一行，统计数据紧跟其后 */}
        <CardHeader className="flex-row items-center justify-between gap-4 p-4 border-b border-default-100">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-base font-semibold text-foreground">
              {isImpersonating ? `用户转发规则${impersonateUserName ? ` ${impersonateUserName}` : ''} (UID=${impersonateUserId})` : '我的转发规则'}
            </h1>
            <Button size="sm" variant="bordered" startContent={<IconSearch />} onPress={() => setSearchModalOpen(true)}>{activeSearchCount > 0 ? `搜索规则（${activeSearchCount}）` : '搜索规则'}</Button>
            <RefreshButton refreshing={refreshing} isDisabled={loading} onRefresh={handleRefresh} />
            <Button size="sm" variant="bordered" startContent={<IconStats />} onPress={openStats}>统计数据</Button>
          </div>
          <div className="flex items-center gap-2">
            {isImpersonating && window.opener && (
              <Button size="sm" variant="bordered" onPress={() => window.close()}>关闭窗口</Button>
            )}
            {isImpersonating && !window.opener && (
              <Button size="sm" variant="bordered" onPress={() => navigate('/user')}>← 返回用户管理</Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-4 space-y-3">

        {/* 信息 / 分组筛选条：流量、到期时间、规则数都是当前页面所属用户（scopeUserId）的数据，
            管理员代管其他用户时显示的是目标用户本人的套餐信息，不是管理员自己的；
            管理分组、按分组筛选、未分组数量在代管模式下同样可用 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-small border border-default-200 px-2 py-0.5 text-xs text-foreground">
            流量: <span className={(packageInfo?.flow ?? 0) <= 0 || usedGiB >= (packageInfo?.flow ?? 0) ? 'text-orange-500' : ''}>{usedGiB.toFixed(2)} GiB / {(packageInfo?.flow ?? 0).toFixed(2)} GiB</span>
          </span>
          {/* 没有到期时间表示永久，与用户管理、仪表盘的显示一致 */}
          {/* 套餐已过期或流量用完时，到期时间用橙色提醒（与个人中心的套餐失效一致）；
              没配置到期时间（为空或留空）时显示 1970/1/1 上午8:00:00，同样用橙色 */}
          <span className="rounded-small border border-default-200 px-2 py-0.5 text-xs text-foreground">
            到期: <span className={!isTimeConfigured(packageInfo?.expTime) || packageInfo.expTime < Date.now() || (packageInfo?.flow ?? 0) <= 0 || usedGiB >= (packageInfo?.flow ?? 0) ? 'text-orange-500' : ''}>{formatExpiryTime(packageInfo?.expTime)}</span>
          </span>
          <span className="rounded-small border border-default-200 px-2 py-0.5 text-xs text-foreground">规则数: {myForwardsAll.length} / {packageInfo?.num ?? '-'}</span>
          <Button size="sm" variant="bordered" className="border-dashed" startContent={<SettingOutlined />} onPress={() => setGroupManageModalOpen(true)}>管理分组</Button>
          <Chip
            size="sm"
            variant={activeGroupFilter === null ? 'solid' : 'light'}
            color={activeGroupFilter === null ? 'primary' : 'default'}
            className="cursor-pointer"
            onClick={() => setActiveGroupFilter(null)}
          >
            全部
          </Chip>
          {myForwardsAll.some(f => !f.groupId) && (
            <Chip
              size="sm"
              variant={activeGroupFilter === -1 ? 'solid' : 'light'}
              color={activeGroupFilter === -1 ? 'primary' : 'default'}
              className="cursor-pointer"
              onClick={() => setActiveGroupFilter(-1)}
            >
              未分组 ({myForwardsAll.filter(f => !f.groupId).length})
            </Chip>
          )}
          {scopedForwardGroups.map(group => (
            <Chip
              key={group.id}
              size="sm"
              variant={activeGroupFilter === group.id ? 'solid' : 'light'}
              color={activeGroupFilter === group.id ? 'primary' : 'default'}
              className="cursor-pointer"
              onClick={() => setActiveGroupFilter(group.id)}
            >
              {group.name} ({group.ruleCount})
            </Chip>
          ))}
        </div>

        {/* 工具列 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="bordered" startContent={<IconAddSingle />} onPress={handleAdd}>添加规则</Button>
          <Button size="sm" variant="bordered" startContent={<IconImport />} onPress={handleImport}>批量导入</Button>
          <Button size="sm" variant="bordered" startContent={<IconExport />} isDisabled={selectedIds.length === 0} onPress={handleExport}>批量导出</Button>
          <Button size="sm" variant="bordered" startContent={<IconToggle />} isDisabled={selectedIds.length === 0} isLoading={batchLoading} onPress={handleBatchToggle}>批量切换</Button>
          <Button size="sm" variant="bordered" startContent={<IconFlow />} isDisabled={selectedIds.length === 0} onPress={handleBatchClearFlow}>清空流量</Button>
          <Button size="sm" variant="bordered" startContent={<IconDelete />} isDisabled={selectedIds.length === 0} isLoading={batchLoading} onPress={handleBatchDelete}>删除选中</Button>
        </div>

        {/* 规则列表 */}
        {/* 没有规则或筛选后没有匹配时也保留表格：表头（含状态筛选图标）始终可见，表体显示「暂无数据」 */}
        <div>
              <div className="settings-table-scroll">
                <Table
                  removeWrapper
                  aria-label="我的转发规则列表"
                  selectionMode="multiple"
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                  sortDescriptor={sortDescriptor}
                  onSortChange={(d) => { setSortDescriptor(nextSort(sortDescriptor, d)); setPage(1); }}
                  classNames={{ base: "w-full", table: "w-full management-table-selectable forward-table", th: "management-table-heading", td: "management-table-cell", sortIcon: "hidden" }}
                >
                  <TableHeader>
                    <TableColumn key="name" allowsSorting><SortableHeader label="规则名" columnKey="name" sort={sortDescriptor} /></TableColumn>
                    <TableColumn key="in" allowsSorting><SortableHeader label="入口" columnKey="in" sort={sortDescriptor} /></TableColumn>
                    <TableColumn key="out" allowsSorting><SortableHeader label="出口" columnKey="out" sort={sortDescriptor} /></TableColumn>
                    <TableColumn key="flow" allowsSorting><SortableHeader label="已用流量" columnKey="flow" sort={sortDescriptor} /></TableColumn>
                    <TableColumn key="status">
                      <div className="flex items-center gap-1.5">
                        状态
                        <Popover placement="bottom-start">
                          <PopoverTrigger>
                            <button
                              type="button"
                              aria-label="筛选状态"
                              title="筛选状态"
                              className={`inline-flex items-center justify-center rounded p-0.5 transition-colors ${statusFilter.length > 0 ? 'text-primary' : 'text-default-400 hover:text-default-600'}`}
                            >
                              <IconFilter />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent>
                            <div className="p-2 min-w-[120px]">
                              <CheckboxGroup
                                aria-label="状态筛选"
                                size="sm"
                                value={statusFilter}
                                onValueChange={(values) => { setStatusFilter(values); setPage(1); }}
                              >
                                <Checkbox value="1">正常</Checkbox>
                                <Checkbox value="0">已暂停</Checkbox>
                                <Checkbox value="-1">异常</Checkbox>
                                <Checkbox value="unsynced">未同步</Checkbox>
                              </CheckboxGroup>
                              <Button size="sm" variant="light" className="mt-2 w-full" isDisabled={statusFilter.length === 0} onPress={() => { setStatusFilter([]); setPage(1); }}>清除筛选</Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableColumn>
                    <TableColumn key="actions">操作</TableColumn>
                  </TableHeader>
                  <TableBody items={displayForwards} emptyContent={<EmptyState />}>
                    {(forward) => {
                      const statusDisplay = getStatusDisplay(getRuleStatusKey(forward));
                      const strategyDisplay = getStrategyDisplay(forward.strategy, forward.weights);
                      const inGroup = findDeviceGroup(forward.inDeviceGroupId);
                      const outGroup = findDeviceGroup(forward.outDeviceGroupId);
                      return (
                        <TableRow key={forward.id}>
                          <TableCell>
                            <span className="text-sm text-foreground whitespace-nowrap">{forward.name} (#{forward.id})</span>
                          </TableCell>
                          <TableCell>
                            {/* 第一行：入口名称 + 设备状态、倍率标签；第二行：完整入口地址（地址:端口），多个地址时可点开列表 */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-foreground">
                                <span>{inGroup ? `入口: ${inGroup.name}` : `隧道: ${forward.tunnelName || '—'}`}</span>
                                {inGroup && (
                                  <>
                                    <RuleTag color={deviceStatusTag(inGroup).color}>{deviceStatusTag(inGroup).text}</RuleTag>
                                    <RuleTag color="success">倍率 {inGroup.ratio ?? 0}</RuleTag>
                                  </>
                                )}
                              </div>
                              <div
                                className={`text-sm text-foreground break-all ${hasMultipleAddresses(forward.inIp) ? 'cursor-pointer hover:text-primary' : ''}`}
                                onClick={() => hasMultipleAddresses(forward.inIp) && showAddressModal(forward.inIp, forward.inPort, '入口地址')}
                              >
                                {formatInAddress(forward.inIp, forward.inPort) || (forward.inPort ? `端口: ${forward.inPort}` : '—')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {/* 第一行：出口名称（没有出口为直连）+ 设备状态、倍率、负载策略标签；第二行：目标地址 */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-foreground">
                                <span>{outGroup ? `出口: ${outGroup.name}` : (forward.remoteAddr ? '出口: 直连' : '—')}</span>
                                {outGroup && (
                                  <>
                                    <RuleTag color={deviceStatusTag(outGroup).color}>{deviceStatusTag(outGroup).text}</RuleTag>
                                    <RuleTag color="success">倍率 {outGroup.ratio ?? 0}</RuleTag>
                                  </>
                                )}
                                {getAddressCount(forward.remoteAddr.split(',').join('\n')) > 1 && (
                                  <RuleTag color={strategyDisplay.color}>{strategyDisplay.text}</RuleTag>
                                )}
                              </div>
                              <div
                                className={`text-sm text-foreground break-all ${hasMultipleAddresses(forward.remoteAddr) ? 'cursor-pointer hover:text-primary' : ''}`}
                                onClick={() => hasMultipleAddresses(forward.remoteAddr) && showAddressModal(forward.remoteAddr, null, '目标地址')}
                              >
                                {formatRemoteAddress(forward.remoteAddr)}
                              </div>
                            </div>
                          </TableCell>
                          {/* 已用流量统一按 GiB 显示两位小数，与顶部流量信息一致 */}
                          <TableCell className="whitespace-nowrap">{(((forward.inFlow || 0) + (forward.outFlow || 0)) / (1024 * 1024 * 1024)).toFixed(2)} GiB</TableCell>
                          <TableCell>
                            <span className={`text-sm whitespace-nowrap ${STATUS_TEXT_STYLES[statusDisplay.color] || STATUS_TEXT_STYLES.default}`}>{statusDisplay.text}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <TipButton isIconOnly size="sm" variant="flat" title={forward.serviceRunning ? '暂停' : '启动'} isDisabled={forward.status !== 1 && forward.status !== 0} onPress={() => handleServiceToggle(forward)}>
                                {forward.serviceRunning ? <IconPause /> : <IconPlay />}
                              </TipButton>
                              <TipButton isIconOnly size="sm" variant="flat" title={forward.status === 1 ? '诊断' : '仅正常状态下可诊断'} isDisabled={forward.status !== 1} onPress={() => handleDiagnose(forward)}><IconHelp /></TipButton>
                              <TipButton isIconOnly size="sm" variant="flat" title="复制" onPress={() => handleCopyRule(forward)}><IconCopy /></TipButton>
                              <TipButton isIconOnly size="sm" variant="flat" title="编辑" onPress={() => handleEdit(forward)}><IconEdit /></TipButton>
                              <TipButton isIconOnly size="sm" variant="flat" title="高级编辑" aria-label="高级编辑" onPress={() => handleOpenJsonEdit(forward)}><EditFilled /></TipButton>
                              <TipButton isIconOnly size="sm" variant="flat" color="danger" title="删除" onPress={() => handleDelete(forward)}><IconDelete /></TipButton>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-default-100">
                {myForwards.length > 0 && (
                  <TablePagination
                    total={myForwards.length}
                    page={Math.min(page, Math.max(1, Math.ceil(myForwards.length / pageSize)))}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                  />
                )}
              </div>
            </div>
        </CardBody>
        </Card>

        {/* 右侧浮动工具列（桌面端）：平时收起为一个圆点，点击展开为可拖动的工具条 */}
        {!isMobile && (
          <div
            ref={railRef}
            className={`forward-rail ${railExpanded ? '' : 'forward-rail-collapsed'}`}
            style={railPos ? { left: railPos.x, top: railPos.y, right: 'auto', transform: 'none' } : undefined}
          >
            {railExpanded ? (
              <>
                <div className="rail-drag-handle" onPointerDown={handleRailDragStart} title="拖动调整位置 / 点击收起">
                  <IconDragHandle />
                </div>
                <RailButton icon={<IconGroup />} label="分组" onPress={() => setGroupManageModalOpen(true)} />
                <RailButton icon={<IconAddSingle />} label="单条" onPress={handleAdd} />
                <RailButton icon={<IconImport />} label="批量" onPress={handleImport} />
                <RailButton icon={<IconExport />} label="导出" onPress={handleExport} disabled={selectedIds.length === 0} />
                <RailButton icon={<IconToggle />} label="切换" onPress={handleBatchToggle} disabled={selectedIds.length === 0} loading={batchLoading} />
                <RailButton icon={<IconFlow />} label="流量" onPress={handleBatchClearFlow} disabled={selectedIds.length === 0} />
                <RailButton icon={<IconPause />} label="暂停" onPress={() => handleBatchSetRunning(false)} disabled={selectedIds.length === 0} loading={batchLoading} />
                <RailButton icon={<IconPlay />} label="启动" onPress={() => handleBatchSetRunning(true)} disabled={selectedIds.length === 0} loading={batchLoading} />
                <RailButton icon={<IconDelete />} label="删除" onPress={handleBatchDelete} disabled={selectedIds.length === 0} loading={batchLoading} danger />
              </>
            ) : (
              <div className="rail-collapsed-handle" onPointerDown={handleRailDragStart} title="拖动调整位置 / 点击展开工具栏">
                <IconDragHandle />
              </div>
            )}
          </div>
        )}

        {/* 新增/编辑模态框 */}
        <Modal
          isOpen={modalOpen}
          onOpenChange={setModalOpen}
          size="md"
          scrollBehavior="outside"
          backdrop="opaque"
          placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                {/* 标题旁 ⇋ 切换转发方式：「入口/出口」按入口、出口设备组转发；「隧道转发」走已分配的隧道
                    （隧道下拉里只列出分配了权限的隧道，没有可用隧道时下拉里会提示） */}
                <ModalHeader className="flex items-center gap-1.5">
                  <h2 className="text-base font-semibold">
                    {isEdit ? '编辑规则' : '添加规则'}
                  </h2>
                  {/* 切换按钮不要悬停 / 点击时的灰色底和聚焦外框，只变图标颜色 */}
                  <button type="button" title={entryMode === 'device' ? '切换为隧道转发' : '切换为入口 / 出口'} aria-label={entryMode === 'device' ? '切换为隧道转发' : '切换为入口 / 出口'}
                    className="inline-flex items-center justify-center w-6 h-6 text-default-500 hover:text-foreground transition-colors outline-none focus:outline-none focus-visible:outline-none active:bg-transparent [-webkit-tap-highlight-color:transparent]"
                    onClick={() => setEntryMode(m => m === 'device' ? 'tunnel' : 'device')}>
                    <SwapOutlined className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${entryMode === 'tunnel' ? 'rotate-180' : ''}`} />
                  </button>
                </ModalHeader>
                <ModalBody>
                  <div className="space-y-4 pb-4">
                    <Input autoComplete="off"
                      size="sm"
                      labelPlacement="outside-top"
                      label="名称"
                      placeholder="请输入转发名称"
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      isInvalid={!!errors.name}
                      errorMessage={errors.name}
                      variant="bordered"
                    />
                    
                    {/* 切换转发方式时，按 key 重新挂载，播放淡入 + 轻微上移的过渡 */}
                    <div key={entryMode} className="mode-swap-in space-y-4">
                      {entryMode === 'device' ? (
                        <>
                          <Select
                            size="sm"
                            labelPlacement="outside-top"
                            label="入口"
                            listboxProps={{ emptyContent: <EmptyState compact /> }}
                            placeholder="请选择入口设备组"
                            selectedKeys={form.inDeviceGroupId ? [form.inDeviceGroupId.toString()] : []}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;
                              // 入口被清空时，出口选择会被隐藏，同时清掉已选的出口，避免提交隐藏的值
                              const nextInId = selectedKey ? parseInt(selectedKey) : null;
                              const nextEntry = deviceGroups.find(g => g.id === nextInId);
                              // 换入口后，已选出口若不在新入口的限制出口内，同样清掉
                              setForm(prev => ({ ...prev, inDeviceGroupId: nextInId, ...(nextInId && (prev.outDeviceGroupId == null || (getDirectMode(nextEntry) !== 2 && isPairAllowed(nextEntry, deviceGroups.find(g => g.id === prev.outDeviceGroupId)))) ? {} : { outDeviceGroupId: null }) }));
                            }}
                            isInvalid={!!errors.inDeviceGroupId}
                            errorMessage={errors.inDeviceGroupId}
                            variant="bordered"
                            renderValue={(items) => items.map((item) => <div key={item.key}>{item.rendered}</div>)}
                          >
                            {deviceGroups.filter((group) => {
                              const direction = group.direction || 'inbound';
                              return direction === 'inbound' || direction === 'both';
                            }).map((group) => (
                              <SelectItem key={group.id.toString()} textValue={group.name}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium">{group.name}</span>
                                  <RuleTag color={deviceStatusTag(group).color}>{deviceStatusTag(group).text}</RuleTag>
                                  <RuleTag color="success">倍率 {group.ratio ?? 0}</RuleTag>
                                  {group.ownerUserId != null && <RuleTag color="secondary">用户自带设备</RuleTag>}
                                </div>
                              </SelectItem>
                            ))}
                          </Select>

                          {/* 先选择入口后才显示出口选择 */}
                          {form.inDeviceGroupId && getDirectMode(deviceGroups.find(g => g.id === form.inDeviceGroupId)) !== 2 && (
                          <Select
                            size="sm"
                            labelPlacement="outside-top"
                            label={<HelpTooltip content="不选择出口时，流量将直接从入口转发至目标地址">出口</HelpTooltip>}
                            listboxProps={{ emptyContent: <EmptyState compact /> }}
                            placeholder={getDirectMode(deviceGroups.find(g => g.id === form.inDeviceGroupId)) === 0 ? '请选择出口' : '留空则为直接端口转发'}
                            disallowEmptySelection={getDirectMode(deviceGroups.find(g => g.id === form.inDeviceGroupId)) === 0}
                            isInvalid={!!errors.outDeviceGroupId}
                            errorMessage={errors.outDeviceGroupId}
                            selectedKeys={form.outDeviceGroupId ? [form.outDeviceGroupId.toString()] : []}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;
                              setForm(prev => ({ ...prev, outDeviceGroupId: selectedKey ? parseInt(selectedKey) : null }));
                            }}
                            variant="bordered"
                            renderValue={(items) => items.map((item) => <div key={item.key}>{item.rendered}</div>)}
                          >
                            {deviceGroups.filter((group) => {
                              const direction = group.direction || 'inbound';
                              return (direction === 'outbound' || direction === 'both')
                                && isPairAllowed(deviceGroups.find(g => g.id === form.inDeviceGroupId), group);
                            }).map((group) => (
                              <SelectItem key={group.id.toString()} textValue={group.name}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium">{group.name}</span>
                                  <RuleTag color={deviceStatusTag(group).color}>{deviceStatusTag(group).text}</RuleTag>
                                  <RuleTag color="success">倍率 {group.ratio ?? 0}</RuleTag>
                                  {group.ownerUserId != null && <RuleTag color="secondary">用户自带设备</RuleTag>}
                                </div>
                              </SelectItem>
                            ))}
                          </Select>
                          )}
                        </>
                      ) : (
                        <Select
                          size="sm"
                          labelPlacement="outside-top"
                          label="选择隧道"
                          listboxProps={{ emptyContent: <EmptyState compact text="暂无可用隧道" /> }}
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
                    </div>

                    <Input autoComplete="off"
                      size="sm"
                      labelPlacement="outside-top"
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
                      labelPlacement="outside-top"
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
                    
                    
                    <Select
                      size="sm"
                      labelPlacement="outside-top"
                      label="所属分组"
                      placeholder="未分组"
                      listboxProps={{ emptyContent: <EmptyState compact text="暂无所属分组" /> }}
                      selectedKeys={form.groupId ? [form.groupId.toString()] : []}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        setForm(prev => ({ ...prev, groupId: selectedKey ? parseInt(selectedKey) : null }));
                      }}
                      variant="bordered"
                    >
                      {scopedForwardGroups.map(group => (
                        <SelectItem key={group.id.toString()}>{group.name}</SelectItem>
                      ))}
                    </Select>

                    <Accordion variant="bordered" itemClasses={{ trigger: "py-2.5", title: "text-sm" }}>
                      <AccordionItem key="advanced" title="高级选项">
                        <div className="space-y-4 pb-2">
                          <Select
                            size="sm"
                            labelPlacement="outside-top"
                            label={<HelpTooltip content={"多个目标地址时，决定新连接转发到哪一个\n随机/轮询：可设权重\nip_hash：同一来源 IP 固定落到同一目标\n最小连接数：选当前连接最少的\n故障转移：优先第一个，失败才切换"}>负载均衡策略</HelpTooltip>}
                            placeholder="请选择负载均衡策略"
                            selectedKeys={[form.strategy]}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;
                              setForm(prev => ({ ...prev, strategy: selectedKey }));
                            }}
                            variant="bordered"
                            isDisabled={getAddressCount(form.remoteAddr) <= 1}
                            description={getAddressCount(form.remoteAddr) <= 1 ? (
                              <span className="inline-flex items-center gap-1">
                                <InfoCircleOutlined />
                                目标地址填写两个或以上时才可选择
                              </span>
                            ) : undefined}
                          >
                            <SelectItem key="rand" textValue="随机">随机</SelectItem>
                            <SelectItem key="round" textValue="轮询">轮询</SelectItem>
                            <SelectItem key="hash" textValue="ip_hash">ip_hash</SelectItem>
                            <SelectItem key="leastconn" textValue="最小连接数">最小连接数</SelectItem>
                            <SelectItem key="fifo" textValue="故障转移">故障转移</SelectItem>
                          </Select>

                          {getAddressCount(form.remoteAddr) > 1 && strategySupportsWeights(form.strategy) && (
                            <div>
                              <FieldLabel tip="按权重比例分配流量：权重越大分到的流量越多，例如 3 和 1 表示 3:1。不填或为 1 表示平均分配">目标地址权重</FieldLabel>
                              <div className="space-y-2">
                                {form.remoteAddr.split('\n').map(addr => addr.trim()).filter(addr => addr).map((addr, index, list) => (
                                  <div key={`${addr}-${index}`} className="flex items-center gap-3">
                                    <span className="flex-1 min-w-0 truncate font-mono text-xs text-default-600" title={addr}>{addr}</span>
                                    <Input
                                      aria-label={`${addr} 的权重`} autoComplete="off" size="sm" variant="bordered" type="number" min={1}
                                      className="w-24 flex-shrink-0"
                                      value={String(weightAt(form.weights, index))}
                                      onChange={(e) => updateWeight(index, list.length, parseInt(e.target.value, 10))}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <Select
                            size="sm"
                            labelPlacement="outside-top"
                            label={<HelpTooltip content="如果打开，用户在连接时必须发送 Proxy 头，否则连接将失败。">接受 Proxy Protocol</HelpTooltip>}
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
                            labelPlacement="outside-top"
                            label={<HelpTooltip content="如果打开，转发目标必须支持读取 Proxy 头，否则连接将失败。">发送 Proxy Protocol</HelpTooltip>}
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
                            labelPlacement="outside-top"
                            label={<HelpTooltip content="用于多IP服务器指定使用那个IP请求远程地址，不懂的默认为空就行">出口网卡名或IP</HelpTooltip>}
                            placeholder="请输入出口网卡名或IP"
                            value={form.interfaceName}
                            onChange={(e) => setForm(prev => ({ ...prev, interfaceName: e.target.value }))}
                            isInvalid={!!errors.interfaceName}
                            errorMessage={errors.interfaceName}
                            variant="bordered"
                          />

                          <div>
                            <FieldLabel tip="该规则的最大速率，0 为不限速（与套餐/用户限速取较严格值，不同规则的限速可叠加）">规则限速</FieldLabel>
                            <UnitField unit="Mbps">
                              <Input autoComplete="off"
                                aria-label="规则限速"
                                size="sm"
                                type="number"
                                min={0}
                                value={form.speedLimit.toString()}
                                onChange={(e) => setForm(prev => ({ ...prev, speedLimit: Math.max(0, parseInt(e.target.value) || 0) }))}
                                variant="bordered"
                                classNames={{ inputWrapper: "rounded-r-none" }}
                              />
                            </UnitField>
                          </div>

                          <Input autoComplete="off"
                            size="sm"
                            labelPlacement="outside-top"
                            label={<HelpTooltip content="单个 IP 的最大并发连接数，0 为不限制">IP 限制</HelpTooltip>}
                            type="number"
                            min={0}
                            value={form.ipLimit.toString()}
                            onChange={(e) => setForm(prev => ({ ...prev, ipLimit: Math.max(0, parseInt(e.target.value) || 0) }))}
                            variant="bordered"
                          />

                          <Input autoComplete="off"
                            size="sm"
                            labelPlacement="outside-top"
                            label={<HelpTooltip content="该规则的总并发连接数，0 为不限制">连接数限制</HelpTooltip>}
                            type="number"
                            min={0}
                            value={form.connLimit.toString()}
                            onChange={(e) => setForm(prev => ({ ...prev, connLimit: Math.max(0, parseInt(e.target.value) || 0) }))}
                            variant="bordered"
                          />
                        </div>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button size="sm" variant="bordered" onPress={onClose}>
                    取消
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
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

        {/* 高级编辑：JSON 编辑单条规则 */}
        <Modal isOpen={jsonTarget !== null} onOpenChange={(open) => { if (!open) setJsonTarget(null); }} size="lg" scrollBehavior="outside" backdrop="opaque" placement="center" hideCloseButton classNames={{ base: "max-w-[520px]" }}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>{jsonTarget?.name} (#{jsonTarget?.id})</ModalHeader>
                <ModalBody className="py-0">
                  <JsonEditor ariaLabel="规则 JSON 配置" value={jsonText} onChange={setJsonText} />
                </ModalBody>
                <ModalFooter>
                  <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
                  <Button size="sm" color="primary" className="dialog-btn" isLoading={jsonLoading} onPress={submitJsonEdit}>确定</Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 删除确认模态框 */}
        <ConfirmDialog
          isOpen={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          title="删除规则"
          message={<>你确定要删除 {forwardToDelete?.name} (#{forwardToDelete?.id}) 吗？</>}
          confirmText="确定"
          onConfirm={confirmDelete}
          loading={deleteLoading}
        />

        <ConfirmDialog
          isOpen={batchDeleteOpen}
          onOpenChange={setBatchDeleteOpen}
          title="删除规则"
          message={<>你确定要删除选中的 {selectedIds.length} 条规则吗？</>}
          confirmText="确定"
          onConfirm={confirmBatchDelete}
        />

        {/* 地址列表弹窗 */}
        <Modal isOpen={addressModalOpen} onClose={() => setAddressModalOpen(false)} size="lg" scrollBehavior="outside" backdrop="opaque" placement="center">
          <ModalContent>
            <ModalHeader>{addressModalTitle}</ModalHeader>
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

        {/* 批量导入：标题旁 ⇋ 切换按入口 / 出口设备组或按隧道；批量规则和 JSON 设置输入框可拖动右下角调整高度 */}
        <Modal
          isOpen={importModalOpen}
          onOpenChange={(open) => { if (!open) setImportModalOpen(false); }}
          size="sm"
          scrollBehavior="outside"
          backdrop="opaque"
          placement="center"
          hideCloseButton
          classNames={{ base: "max-w-[416px]" }}
        >
          <ModalContent>
            {(onClose) => {
              const importEntry = deviceGroups.find(g => g.id === importInGroupId);
              const importDirectMode = getDirectMode(importEntry);
              return (
              <>
                <ModalHeader className="flex items-center gap-1.5">
                  批量导入
                  {/* 切换按钮不要悬停 / 点击时的灰色底和聚焦外框，只变图标颜色 */}
                  <button type="button" title={importMode === 'device' ? '切换为导入到隧道' : '切换为导入到入口 / 出口'} aria-label={importMode === 'device' ? '切换为导入到隧道' : '切换为导入到入口 / 出口'}
                    className="inline-flex items-center justify-center w-6 h-6 text-default-500 hover:text-foreground transition-colors outline-none focus:outline-none focus-visible:outline-none active:bg-transparent [-webkit-tap-highlight-color:transparent]"
                    onClick={() => setImportMode(m => m === 'device' ? 'tunnel' : 'device')}>
                    <SwapOutlined className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${importMode === 'tunnel' ? 'rotate-180' : ''}`} />
                  </button>
                </ModalHeader>
                <ModalBody className="py-0">
                  <div className="dialog-form space-y-3">
                    {/* 切换转发方式时，按 key 重新挂载，播放淡入 + 轻微上移的过渡 */}
                    <div key={importMode} className="mode-swap-in space-y-3">
                      {importMode === 'device' ? (
                        <>
                          <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                            size="sm"
                            label="入口"
                            selectedKeys={importInGroupId ? [importInGroupId.toString()] : []}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;
                              const id = selectedKey ? parseInt(selectedKey) : null;
                              const entry = deviceGroups.find(g => g.id === id);
                              setImportInGroupId(id);
                              // 换入口后，已选出口若不在新入口允许范围内则清掉
                              setImportOutGroupId(prev => (id && prev != null && getDirectMode(entry) !== 2 && isPairAllowed(entry, deviceGroups.find(g => g.id === prev))) ? prev : null);
                            }}
                            variant="bordered"
                          >
                            {deviceGroups.filter(g => (g.direction || 'inbound') === 'inbound' || g.direction === 'both').map((group) => (
                              <SelectItem key={group.id.toString()} textValue={group.name}>{group.name}</SelectItem>
                            ))}
                          </Select>
                          {importInGroupId && importDirectMode !== 2 && (
                            <Select listboxProps={{ emptyContent: <EmptyState compact /> }} labelPlacement="outside-top"
                              size="sm"
                              label="出口"
                              placeholder={importDirectMode === 0 ? '请选择出口' : '留空则为直接端口转发'}
                              selectedKeys={importOutGroupId ? [importOutGroupId.toString()] : []}
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;
                                setImportOutGroupId(selectedKey ? parseInt(selectedKey) : null);
                              }}
                              variant="bordered"
                            >
                              {deviceGroups.filter(g => (g.direction === 'outbound' || g.direction === 'both') && isPairAllowed(importEntry, g)).map((group) => (
                                <SelectItem key={group.id.toString()} textValue={group.name}>{group.name}</SelectItem>
                              ))}
                            </Select>
                          )}
                        </>
                      ) : (
                        <Select listboxProps={{ emptyContent: <EmptyState compact text="暂无可用隧道" /> }} labelPlacement="outside-top"
                          size="sm"
                          label="隧道"
                          selectedKeys={selectedTunnelForImport ? [selectedTunnelForImport.toString()] : []}
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;
                            setSelectedTunnelForImport(selectedKey ? parseInt(selectedKey) : null);
                          }}
                          variant="bordered"
                        >
                          {tunnels.map((tunnel) => (
                            <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>{tunnel.name}</SelectItem>
                          ))}
                        </Select>
                      )}
                    </div>

                    <Textarea labelPlacement="outside-top" size="sm" autoComplete="off" variant="bordered" disableAutosize rows={6}
                      label="批量规则"
                      placeholder={"一行一个，空行会被忽略。支持两种格式：\n{\"dest\":[\"test.com:20000\"],\"listen_port\":46267,\"name\":\"test\"}\n目标地址|规则名|入口端口\n入口端口留空自动分配，多个目标地址用逗号分隔"}
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      classNames={{ input: "font-mono text-xs placeholder:font-sans resize-y min-h-[120px]" }}
                    />

                    <div className="rounded-md border border-default-300 overflow-hidden">
                      <button type="button" onClick={() => setImportJsonOpen(o => !o)}
                        className="flex w-full items-center gap-2 bg-default-100 px-4 py-2.5 text-sm font-semibold text-foreground outline-none">
                        <RightOutlined className={`w-3 h-3 flex-shrink-0 transition-transform duration-300 ease-in-out ${importJsonOpen ? 'rotate-90' : ''}`} />
                        JSON 设置
                      </button>
                      {/* 展开 / 收起用 grid-template-rows 0fr↔1fr 过渡高度，内容一直挂载（输入的 JSON 不丢），同时淡入淡出 */}
                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none ${importJsonOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                        // 收起时整块不可聚焦、不可点击；React 18 不认识 inert 属性，按普通 HTML 属性传字符串
                        {...(!importJsonOpen ? { inert: '' } as Record<string, string> : {})}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="p-4 border-t border-default-300">
                            <Textarea size="sm" autoComplete="off" variant="bordered" disableAutosize rows={6}
                              aria-label="JSON 设置"
                              placeholder={'覆盖除目标地址以外的配置，请确保格式正确。\n例如：{"strategy": "round", "speedLimit": 1}'}
                              value={importJson}
                              onChange={(e) => setImportJson(e.target.value)}
                              classNames={{ input: "font-mono text-xs placeholder:font-sans resize-y min-h-[120px]" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {importResults.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-foreground">导入结果</span>
                          <span className="text-xs text-default-500">
                            成功 {importResults.filter(r => r.success).length} / 共 {importResults.length}
                          </span>
                        </div>
                        <TerminalBox className="max-h-40 overflow-y-auto">
                          {importResults.map((result, index) => (
                            <div key={index} className={result.success ? TERM_TEXT : TERM_ERR}>
                              {result.success ? 'ok    ' : 'failed'} {result.line}{result.success ? '' : `: ${result.message}`}
                            </div>
                          ))}
                        </TerminalBox>
                      </div>
                    )}
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
                  <Button size="sm" color="primary" className="dialog-btn" isLoading={importLoading}
                    isDisabled={!importData.trim() || (importMode === 'tunnel' ? !selectedTunnelForImport : !importInGroupId)}
                    onPress={executeImport}>确定</Button>
                </ModalFooter>
              </>
              );
            }}
          </ModalContent>
        </Modal>

        {/* 诊断结果模态框 */}
        <Modal 
          isOpen={diagnosisModalOpen}
          onOpenChange={setDiagnosisModalOpen}
          
          size="2xl"
        scrollBehavior="outside"
        backdrop="opaque"
        placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">
                    诊断结果{currentDiagnosisForward ? ` (#${currentDiagnosisForward.id})` : ''}
                  </h2>
                  {currentDiagnosisForward && (
                    <span className="text-small text-default-500 truncate">{currentDiagnosisForward.name}</span>
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
                    <div className="space-y-5">
                      <DiagnosisLeg title="入口诊断" subtitle="Inbound" results={diagnosisResult.results.filter(r => r.leg !== 'outbound')} emptyText="无数据" resolveGroupName={(id) => findDeviceGroup(id)?.name} loadDetail={loadForwardDiagnosisDetail} />
                      {diagnosisResult.results.filter(r => r.leg === 'outbound').length > 0 && (
                        <DiagnosisLeg title="出口诊断" subtitle="Outbounds" results={diagnosisResult.results.filter(r => r.leg === 'outbound')} resolveGroupName={(id) => findDeviceGroup(id)?.name} loadDetail={loadForwardDiagnosisDetail} />
                      )}
                      <DiagnosisPanelFeedback stats={diagnosisResult.dispatchStats} />
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
                      isDisabled={diagnosisLoading}
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
        <RuleSearchModal
          isOpen={searchModalOpen}
          onOpenChange={setSearchModalOpen}
          title="搜索规则"
          filters={searchFilters}
          deviceGroups={deviceGroups}
          onConfirm={(filters) => { setSearchFilters(filters); setPage(1); setSearchModalOpen(false); }}
        />

        {/* 统计数据模态框 */}
        <Modal isOpen={statsModalOpen} onOpenChange={setStatsModalOpen} size="sm" placement="center" backdrop="opaque">
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
                  <Button color="primary" className="w-full" onPress={onClose}>知道了</Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        <GroupManageDrawer
          isOpen={groupManageModalOpen}
          onOpenChange={(open) => {
            setGroupManageModalOpen(open);
            if (!open) {
              setGroupNameInput('');
              setGroupEditingId(null);
            }
          }}
          groups={scopedForwardGroups}
          count={(group) => group.ruleCount}
          nameInput={groupNameInput}
          onNameInputChange={setGroupNameInput}
          editing={!!groupEditingId}
          onCancelEdit={() => { setGroupEditingId(null); setGroupNameInput(''); }}
          onSubmit={handleCreateGroup}
          submitting={groupSubmitLoading}
          onEdit={handleEditGroupStart}
          onDelete={handleDeleteGroup}
        />
      </div>

  );
} 
