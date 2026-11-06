import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { EmptyState } from "@/components/empty-state";

/** 搜索规则的条件：名称和目标地址模糊匹配，入口、出口、监听端口精确匹配，空值表示不限 */
export interface RuleSearchFilters {
  name: string;
  inId: string;
  outId: string;
  port: string;
  target: string;
}

export const EMPTY_RULE_SEARCH: RuleSearchFilters = { name: '', inId: '', outId: '', port: '', target: '' };

export const countRuleSearch = (filters: RuleSearchFilters) => Object.values(filters).filter(v => v.trim()).length;

interface SearchableRule {
  id: number;
  name: string;
  inPort?: number | null;
  remoteAddr?: string | null;
  inDeviceGroupId?: number | null;
  outDeviceGroupId?: number | null;
}

/** 各条件同时满足才算匹配；名称也可以输入 #ID */
export const matchRuleSearch = (rule: SearchableRule, filters: RuleSearchFilters) => {
  const name = filters.name.trim().toLowerCase();
  const port = filters.port.trim();
  const target = filters.target.trim().toLowerCase();
  return (!name || (rule.name || '').toLowerCase().includes(name) || String(rule.id).includes(name.replace(/^#/, '')))
    && (!filters.inId || String(rule.inDeviceGroupId ?? '') === filters.inId)
    && (!filters.outId || String(rule.outDeviceGroupId ?? '') === filters.outId)
    && (!port || String(rule.inPort ?? '') === port)
    && (!target || (rule.remoteAddr || '').toLowerCase().includes(target));
};

interface RuleSearchModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  filters: RuleSearchFilters;
  deviceGroups: Array<{ id: number; name: string; direction?: string }>;
  loading?: boolean;
  onConfirm: (filters: RuleSearchFilters) => void;
}

export const RuleSearchModal = ({ isOpen, onOpenChange, title, filters, deviceGroups, loading, onConfirm }: RuleSearchModalProps) => {
  const [draft, setDraft] = useState(filters);

  // 每次打开都从已生效的条件开始，取消后不保留没有确定的修改
  useEffect(() => {
    if (isOpen) setDraft(filters);
  }, [isOpen, filters]);

  const pickKey = (keys: unknown) => String(Array.from(keys as Set<string>)[0] ?? '');

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm" placement="center" backdrop="opaque" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{title}</ModalHeader>
            <ModalBody className="py-0">
              <div className="dialog-form space-y-3" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') onConfirm(draft); }}>
                <Input labelPlacement="outside-top" size="sm" autoComplete="off" autoFocus label="规则名称 (模糊)" variant="bordered" value={draft.name} onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))} />
                <Select labelPlacement="outside-top" size="sm" label="入口" variant="bordered" listboxProps={{ emptyContent: <EmptyState compact /> }} selectedKeys={draft.inId ? [draft.inId] : []} onSelectionChange={(keys) => setDraft(prev => ({ ...prev, inId: pickKey(keys) }))}>
                  {deviceGroups.filter(g => g.direction === 'inbound' || g.direction === 'both').map(g => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
                </Select>
                <Select labelPlacement="outside-top" size="sm" label="出口" variant="bordered" listboxProps={{ emptyContent: <EmptyState compact /> }} selectedKeys={draft.outId ? [draft.outId] : []} onSelectionChange={(keys) => setDraft(prev => ({ ...prev, outId: pickKey(keys) }))}>
                  {deviceGroups.filter(g => g.direction !== 'inbound' && g.direction !== 'monitor').map(g => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
                </Select>
                <Input labelPlacement="outside-top" size="sm" autoComplete="off" label="监听端口 (精确)" variant="bordered" value={draft.port} onChange={(e) => setDraft(prev => ({ ...prev, port: e.target.value }))} />
                <Input labelPlacement="outside-top" size="sm" autoComplete="off" label="目标地址或端口 (模糊)" variant="bordered" value={draft.target} onChange={(e) => setDraft(prev => ({ ...prev, target: e.target.value }))} />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
              <Button size="sm" color="primary" className="dialog-btn" isLoading={loading} onPress={() => onConfirm(draft)}>确定</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
