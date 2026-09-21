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
  <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm" placement="center" backdrop="blur">
    <ModalContent>
      {(onClose) => (
        <>
          <ModalHeader className="text-base font-semibold">{title}</ModalHeader>
          <ModalBody className="py-0">
            <div className="text-sm text-default-600 space-y-1">{message}</div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>取消</Button>
            <Button color={confirmColor} onPress={onConfirm} isLoading={loading}>{confirmText}</Button>
          </ModalFooter>
        </>
      )}
    </ModalContent>
  </Modal>
);
