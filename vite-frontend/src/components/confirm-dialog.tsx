import { ReactNode } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  confirmColor?: "primary" | "danger" | "warning";
  onConfirm: () => void;
  loading?: boolean;
}

export const ConfirmDialog = ({
  isOpen,
  onOpenChange,
  title,
  message,
  confirmText = "确定",
  confirmColor = "primary",
  onConfirm,
  loading
}: ConfirmDialogProps) => (
  <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm" placement="center" backdrop="opaque" hideCloseButton classNames={{ base: "max-w-[416px]" }}>
    <ModalContent>
      {(onClose) => (
        <>
          <ModalHeader>{title}</ModalHeader>
          <ModalBody className="py-0">
            <div className="text-sm text-foreground space-y-3">{message}</div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="bordered" className="dialog-btn" onPress={onClose}>取消</Button>
            <Button size="sm" color={confirmColor} className="dialog-btn" onPress={onConfirm} isLoading={loading}>{confirmText}</Button>
          </ModalFooter>
        </>
      )}
    </ModalContent>
  </Modal>
);
