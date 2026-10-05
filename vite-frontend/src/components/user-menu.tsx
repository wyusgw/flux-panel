import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";

export const LogoutIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M18.4 7.5A8 8 0 1020 12h-7" />
  </svg>
);

// 右上角用户菜单：用户名 + 用户图标，下拉仅保留退出（修改密码已移至账户设置页内联表单）
export const UserMenu = ({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) => (
  <Dropdown placement="bottom-end" classNames={{ content: 'user-menu-popover' }}>
    <DropdownTrigger>
      <button type="button" className="user-chip" aria-label="用户菜单">
        <span className="user-chip-name">{username}</span>
        <span className="user-chip-icon">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" />
            <path strokeLinecap="round" d="M4.5 20a7.5 7.5 0 0115 0" />
          </svg>
        </span>
      </button>
    </DropdownTrigger>
    <DropdownMenu aria-label="用户菜单" itemClasses={{ base: 'user-menu-item' }}>
      <DropdownItem key="logout" startContent={<LogoutIcon />} onPress={onLogout}>
        退出
      </DropdownItem>
    </DropdownMenu>
  </Dropdown>
);
