import { useSyncExternalStore } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Button } from '@heroui/button';
import { ToastErrorIcon, ToastInfoIcon } from '@/components/toast-icons';

/**
 * 操作失败提示框：红色圆形图标 + 加粗标题（如「规则更新失败(400)」）+ 服务端返回的具体原因 + 右下角「知道了」。
 * 与一闪而过的 toast 不同，它会停留到用户确认，适合需要看清失败原因的场景（如保存规则时名称为空）。
 *
 * 用法：任意位置调用 showErrorDialog({ title, message })，对话框由 Provider 里挂载的 ErrorDialogHost 统一渲染；
 * 同时触发多个时按顺序逐个显示。
 */
export interface ErrorDialogOptions {
  title: string;
  message?: string;
  /** 提示信息用蓝色图标，默认是红色的失败图标 */
  type?: 'error' | 'info';
}

let queue: ErrorDialogOptions[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => queue;

export const showErrorDialog = (options: ErrorDialogOptions) => {
  queue = [...queue, options];
  emit();
};

/** 和失败提示框同样的样式，但图标是蓝色的，用于不算错误的提示（如本站未启用某功能） */
export const showInfoDialog = (options: Omit<ErrorDialogOptions, 'type'>) => {
  showErrorDialog({ ...options, type: 'info' });
};

/**
 * 详细说明里去掉冒号：服务端返回的原因常带「xxx失败：具体原因」「无法解析目标地址: x」这样的冒号分隔，
 * 这里把全角冒号、以及后面跟空格（或位于末尾）的半角冒号换成一个空格；
 * 地址里的 IP:端口（冒号后面紧跟字符）不属于分隔冒号，保持原样
 */
const stripColons = (text?: string) => (text || '')
  .replace(/\s*：\s*/g, ' ')
  .replace(/\s*:(\s+|$)/g, ' ')
  .trim();

/**
 * 接口返回失败时的统一提示：标题为「<操作>失败(<状态码>)」，状态码取接口返回的 code
 * （如参数校验失败 400、未授权 401；业务失败与本地网络错误为 -1），副标题显示服务端给出的原因
 */
export const showApiFailure = (action: string, res?: { code?: number; msg?: string } | null) => {
  const code = typeof res?.code === 'number' ? `(${res.code})` : '';
  showErrorDialog({ title: `${action}失败${code}`, message: stripColons(res?.msg) || '未知错误，请稍后重试' });
};

export function ErrorDialogHost() {
  const items = useSyncExternalStore(subscribe, getSnapshot);
  const current = items[0];
  const close = () => { queue = queue.slice(1); emit(); };

  return (
    <Modal
      isOpen={!!current}
      onOpenChange={(open) => { if (!open) close(); }}
      size="sm"
      backdrop="opaque"
      placement="center"
      hideCloseButton
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2.5 pb-2">
              {/* 全局样式 .toast-icon 把图标固定为 16px（且不在样式层内），这里用 ! 强制设为 24px（对照参考截图：图标约比标题文字略大） */}
              <span className="inline-flex w-6 h-6 flex-shrink-0 [&_svg]:!w-6 [&_svg]:!h-6">{current?.type === 'info' ? <ToastInfoIcon /> : <ToastErrorIcon />}</span>
              <h2 className="text-lg font-semibold break-words min-w-0">{current?.title}</h2>
            </ModalHeader>
            <ModalBody className="pt-0">
              {current?.message && <p className="text-sm text-default-600 break-words whitespace-pre-wrap pl-[34px]">{current.message}</p>}
            </ModalBody>
            <ModalFooter>
              <Button size="sm" color="primary" onPress={close}>知道了</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
