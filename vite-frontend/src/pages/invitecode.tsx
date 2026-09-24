import { useState, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell
} from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  batchCreateInviteCodes,
  getInviteCodeList,
  deleteInviteCode
} from "@/api";

interface InviteCodeItem {
  id: number;
  code: string;
  usesRemaining: number;
}

interface BatchForm {
  usesRemaining: number;
  codesText: string;
}

const DEFAULT_FORM: BatchForm = {
  usesRemaining: 1,
  codesText: ''
};

export default function InviteCodePage() {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<InviteCodeItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<InviteCodeItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [form, setForm] = useState<BatchForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getInviteCodeList();
      if (res.code === 0) {
        setCodes(res.data || []);
      } else {
        toast.error(res.msg || '获取邀请码失败');
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (form.usesRemaining < 1) newErrors.usesRemaining = '可用次数至少为1';
    if (!form.codesText.trim()) newErrors.codesText = '请输入邀请代码';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const codesList = form.codesText
      .split('\n')
      .map(c => c.trim())
      .filter(c => c);

    setSubmitLoading(true);
    try {
      const res = await batchCreateInviteCodes({
        usesRemaining: form.usesRemaining,
        codes: codesList
      });
      if (res.code === 0) {
        toast.success('创建成功');
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '创建失败');
      }
    } catch (error) {
      toast.error('创建失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = (code: InviteCodeItem) => {
    setCodeToDelete(code);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!codeToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteInviteCode(codeToDelete.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setDeleteLoading(false);
    }
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

  return (
    <div className="px-3 lg:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-default-500">
          配合「站点设置 → 邀请码注册策略」使用：设为「可选填写」或「仅邀请码注册」后，这里生成的代码才会在注册页生效。
        </p>
        <Button size="sm" variant="flat" color="default" onPress={handleAdd}>
          批量添加邀请码
        </Button>
      </div>

      <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
        <CardBody className="p-0">
          <Table
            aria-label="邀请码列表"
            classNames={{
              wrapper: "shadow-none",
              th: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
            }}
          >
            <TableHeader>
              <TableColumn>代码</TableColumn>
              <TableColumn>剩余次数</TableColumn>
              <TableColumn>操作</TableColumn>
            </TableHeader>
            <TableBody items={codes} emptyContent={<EmptyState />}>
              {(code: InviteCodeItem) => (
                <TableRow key={code.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{code.code}</span>
                  </TableCell>
                  <TableCell>
                    <Chip color={code.usesRemaining > 0 ? 'success' : 'default'} size="sm" variant="flat">
                      {code.usesRemaining}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="flat" color="danger" onPress={() => handleDelete(code)}>
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="md" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <h2 className="text-lg font-bold">批量添加邀请码</h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-3 pb-4">
                  <Input autoComplete="off"
                    size="sm"
                    label="可用次数"
                    type="number"
                    value={form.usesRemaining.toString()}
                    onChange={(e) => setForm(prev => ({ ...prev, usesRemaining: parseInt(e.target.value) || 0 }))}
                    isInvalid={!!errors.usesRemaining}
                    errorMessage={errors.usesRemaining}
                    variant="bordered"
                    description="每个邀请代码可被使用的次数"
                  />

                  <Textarea autoComplete="off"
                    size="sm"
                    label="邀请代码"
                    placeholder="一行一个，空行会被忽略"
                    value={form.codesText}
                    onChange={(e) => setForm(prev => ({ ...prev, codesText: e.target.value }))}
                    isInvalid={!!errors.codesText}
                    errorMessage={errors.codesText}
                    variant="bordered"
                    minRows={4}
                    maxRows={10}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="default" onPress={handleSubmit} isLoading={submitLoading}>
                  创建
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="确认删除"
        message={<>你确定要删除邀请码 {codeToDelete?.code} 吗？</>}
        confirmText="确定"
        confirmColor="danger"
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
