import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input } from "@heroui/input";
import { toast } from 'react-hot-toast';

import { updatePassword } from '@/api';
import { safeLogout } from '@/utils/logout';

interface PasswordForm {
  newUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const emptyForm: PasswordForm = {
  newUsername: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

// 修改密码弹窗：桌面端与移动端共用同一份实现与交互
export const ChangePasswordModal = ({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: () => void;
}) => {
  const navigate = useNavigate();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyForm);
  const [loading, setLoading] = useState(false);

  const resetForm = () => setPasswordForm(emptyForm);

  const validate = (): boolean => {
    if (!passwordForm.newUsername.trim()) {
      toast.error('请输入新用户名');
      return false;
    }
    if (passwordForm.newUsername.length < 3) {
      toast.error('用户名长度至少3位');
      return false;
    }
    if (!passwordForm.currentPassword) {
      toast.error('请输入当前密码');
      return false;
    }
    if (!passwordForm.newPassword) {
      toast.error('请输入新密码');
      return false;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码长度不能少于6位');
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入密码不一致');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await updatePassword(passwordForm);
      if (response.code === 0) {
        toast.success('密码修改成功，请重新登录');
        onOpenChange();
        safeLogout();
        navigate('/', { replace: true });
      } else {
        toast.error(response.msg || '密码修改失败');
      }
    } catch (error) {
      toast.error('修改密码时发生错误');
      console.error('修改密码错误:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={() => {
        onOpenChange();
        resetForm();
      }}
      size="2xl"
      scrollBehavior="outside"
      backdrop="blur"
      placement="center"
    >
      <ModalContent>
        {(onClose: () => void) => (
          <>
            <ModalHeader className="flex flex-col gap-1">修改密码</ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Input
                  size="sm" autoComplete="off"
                  label="新用户名"
                  placeholder="请输入新用户名（至少3位）"
                  value={passwordForm.newUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, newUsername: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  size="sm" autoComplete="off"
                  label="当前密码"
                  type="password"
                  placeholder="请输入当前密码"
                  value={passwordForm.currentPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  size="sm" autoComplete="off"
                  label="新密码"
                  type="password"
                  placeholder="请输入新密码（至少6位）"
                  value={passwordForm.newPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  size="sm" autoComplete="off"
                  label="确认密码"
                  type="password"
                  placeholder="请再次输入新密码"
                  value={passwordForm.confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  variant="bordered"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="default"
                onPress={handleSubmit}
                isLoading={loading}
              >
                确定
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
