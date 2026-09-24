import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";

export const LogoutIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M18.4 7.5A8 8 0 1020 12h-7" />
  </svg>
);

export const LockIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

// 右上角用户菜单：用户名 + 用户图标，下拉包含修改密码与退出
export const UserMenu = ({
  username,
  onChangePassword,
  onLogout,
}: {
  username: string;
  onChangePassword: () => void;
  onLogout: () => void;
}) => (
  <Dropdown placement="bottom-end" classNames={{ content: 'user-menu-popover' }}>
    <DropdownTrigger>
      <button type="button" className="user-chip" aria-label="用户菜单">
        <span className="user-chip-name">{username}</span>
        <span className="user-chip-icon">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" />
            <path strokeLinecap="round" d="M4.5 20a7.5 7.5 0 0115 0" />
          </svg>
        </span>
      </button>
    </DropdownTrigger>
    <DropdownMenu aria-label="用户菜单" itemClasses={{ base: 'user-menu-item' }}>
      <DropdownItem key="change-password" startContent={<LockIcon />} onPress={onChangePassword}>
        修改密码
      </DropdownItem>
      <DropdownItem key="logout" startContent={<LogoutIcon />} onPress={onLogout}>
        退出
      </DropdownItem>
    </DropdownMenu>
  </Dropdown>
);
