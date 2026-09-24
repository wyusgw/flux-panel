import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from 'react-hot-toast';
import DefaultLayout from "@/layouts/default";
import { register } from "@/api";
import { UserIcon, LockIcon, EyeIcon, EyeOffIcon } from "@/components/icons";

interface RegisterForm {
  username: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterForm>({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<RegisterForm>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const newErrors: Partial<RegisterForm> = {};

    if (!form.username.trim()) {
      newErrors.username = '请输入用户名';
    } else if (form.username.trim().length < 3) {
      newErrors.username = '用户名长度至少3位';
    }

    if (!form.password) {
      newErrors.password = '请输入密码';
    } else if (form.password.length < 6) {
      newErrors.password = '密码长度至少6位';
    }

    if (!form.confirmPassword) {
      newErrors.confirmPassword = '请再次输入密码';
    } else if (form.confirmPassword !== form.password) {
      newErrors.confirmPassword = '两次输入的密码不一致';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof RegisterForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await register({
        username: form.username.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      if (response.code !== 0) {
        toast.error(response.msg || "注册失败");
        return;
      }

      toast.success('注册成功，请登录');
      navigate("/");
    } catch (error) {
      console.error('注册错误:', error);
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleRegister();
    }
  };

  return (
    <DefaultLayout>
      <section className="flex flex-col items-center justify-center gap-4 py-4 sm:py-8 md:py-10 pb-20 min-h-[calc(100dvh-120px)] sm:min-h-[calc(100dvh-200px)]">
        <div className="w-full max-w-[400px] px-4 sm:px-0">
          <Card className="w-full">
            <CardHeader className="px-6 pt-5 pb-4">
              <h1 className="text-lg font-bold text-foreground">注册</h1>
            </CardHeader>
            <Divider />
            <CardBody className="px-6 py-6">
              <div className="flex flex-col gap-4">
                <Input autoComplete="off"
                  size="sm"
                  placeholder="用户名"
                  value={form.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.username}
                  errorMessage={errors.username}
                  startContent={<UserIcon className="w-4 h-4 text-gray-400 dark:text-gray-300 flex-shrink-0" />}
                />

                <Input autoComplete="off"
                  size="sm"
                  placeholder="密码"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.password}
                  errorMessage={errors.password}
                  startContent={<LockIcon className="w-4 h-4 text-gray-400 dark:text-gray-300 flex-shrink-0" />}
                  endContent={
                    <button
                      type="button"
                      className="text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-white focus:outline-none"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  }
                />

                <Input autoComplete="off"
                  size="sm"
                  placeholder="确认密码"
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  onKeyDown={handleKeyPress}
                  variant="bordered"
                  isDisabled={loading}
                  isInvalid={!!errors.confirmPassword}
                  errorMessage={errors.confirmPassword}
                  startContent={<LockIcon className="w-4 h-4 text-gray-400 dark:text-gray-300 flex-shrink-0" />}
                  endContent={
                    <button
                      type="button"
                      className="text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-white focus:outline-none"
                      onClick={() => setShowConfirmPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  }
                />

                <div className="flex items-center gap-4 mt-1">
                  <Button
                    size="sm"
                    color="default"
                    onClick={handleRegister}
                    isLoading={loading}
                    disabled={loading}
                  >
                    {loading ? "注册中..." : "注册"}
                  </Button>

                  <Link to="/" className="text-primary text-small">
                    前往登录
                  </Link>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>
    </DefaultLayout>
  );
}
