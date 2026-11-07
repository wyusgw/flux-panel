import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/modal";

import { CloseOutlined } from "@/components/ant-icons";
import { EmptyState } from "@/components/empty-state";
import { FieldLabel } from "@/components/form-field";
import { DeleteIcon, EditIcon } from "@/components/icons";
import { PopConfirm } from "@/components/pop-confirm";

interface GroupManageDrawerProps<T extends { id: number; name: string }> {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groups: T[];
  /** 分组里的项目数量 */
  count: (group: T) => number;
  nameInput: string;
  onNameInputChange: (value: string) => void;
  editing: boolean;
  onCancelEdit: () => void;
  onSubmit: () => void;
  submitting: boolean;
  onEdit: (group: T) => void;
  onDelete: (group: T) => void;
}

/** 分组管理侧栏：从右侧滑出，整列高度，点击未遮挡的空白处关闭。转发规则和单端隧道共用 */
export function GroupManageDrawer<T extends { id: number; name: string }>({
  isOpen,
  onOpenChange,
  groups,
  count,
  nameInput,
  onNameInputChange,
  editing,
  onCancelEdit,
  onSubmit,
  submitting,
  onEdit,
  onDelete,
}: GroupManageDrawerProps<T>) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      hideCloseButton
      scrollBehavior="inside"
      backdrop="opaque"
      radius="none"
      classNames={{
        wrapper: 'justify-end items-stretch',
        // HeroUI 在宽屏下给弹窗加了 sm:mx-6 和圆角，要用 ! 覆盖才能贴住右边
        base: '!m-0 h-full max-h-full w-[300px] max-w-full !rounded-none',
      }}
      motionProps={{
        variants: {
          enter: { x: 0, opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
          exit: { x: 80, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } },
        },
        initial: { x: 80, opacity: 0 },
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-3 px-5 py-4 border-b border-default-100">
              <button type="button" aria-label="关闭" onClick={onClose} className="inline-flex items-center justify-center text-default-500 hover:text-foreground transition-colors">
                <CloseOutlined className="w-4 h-4" />
              </button>
              <h2 className="text-base font-semibold">分组管理</h2>
            </ModalHeader>
            <ModalBody className="px-5 py-5 gap-5">
              <div className="rounded-medium border border-default-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-default-200 text-sm font-semibold">现有分组列表</div>
                {groups.length === 0 ? (
                  <div className="py-6"><EmptyState compact /></div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-default-100">
                    {groups.map(group => (
                      <div key={group.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                          <p className="mt-1 text-sm text-default-500">项目数量: {count(group)}</p>
                        </div>
                        <div className="flex items-center flex-shrink-0">
                          <Button isIconOnly size="sm" variant="light" color="primary" aria-label={`编辑分组 ${group.name}`} onPress={() => onEdit(group)}>
                            <EditIcon className="w-4 h-4" />
                          </Button>
                          <span className="h-3.5 w-px bg-default-200" />
                          <PopConfirm title="删除后项目会变回未分组。确定删除?" onConfirm={() => onDelete(group)}>
                            <Button isIconOnly size="sm" variant="light" color="danger" aria-label={`删除分组 ${group.name}`}>
                              <DeleteIcon className="w-4 h-4" />
                            </Button>
                          </PopConfirm>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <FieldLabel>{editing ? '更新分组' : '新增分组'}</FieldLabel>
                <Input
                  aria-label="分组名称" size="sm" autoComplete="off" variant="bordered"
                  placeholder="请输入分组名称"
                  value={nameInput}
                  onChange={(e) => onNameInputChange(e.target.value)}
                />
                <div className="mt-3 flex items-center gap-2">
                  <PopConfirm title={editing ? '确定更新?' : '确定添加?'} onConfirm={onSubmit}>
                    <Button size="sm" color="primary" isLoading={submitting}>
                      {editing ? '更 新' : '添 加'}
                    </Button>
                  </PopConfirm>
                  {editing && (
                    <Button size="sm" variant="light" onPress={onCancelEdit}>
                      取消
                    </Button>
                  )}
                </div>
              </div>

              <p className="border-l-2 border-default-300 bg-default-50 dark:bg-default-100/30 px-3 py-2 text-xs leading-relaxed text-default-600">
                若您对项目进行了添加/删除操作，分组的项目数量可能不会及时更新。可以点击“刷新”按钮更新。
              </p>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
