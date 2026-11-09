import { LoginOutlined, LogoutOutlined } from "@/components/ant-icons";
import { useEffect, useRef, useState } from "react";
import { UserIcon } from "@/components/icons";

export const LogoutIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <LoginOutlined className={className} />
);

const LoginIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <LogoutOutlined className={className} />
);

// 顶栏右上角的两块式标识（登录前后共用）：文字与用户图标分别高亮。
// 用户图标在鼠标悬停时展开菜单，触屏和键盘则点击展开、再点收起；
// 文字点击后不做任何事，只让文字这一块高亮（用 tabIndex 保证 Safari 点击也会获得焦点），传了 onLabelClick（未登录）时才是可点击的按钮
const ChipMenu = ({
  label,
  onLabelClick,
  itemIcon,
  itemLabel,
  onItemClick,
}: {
  label: string;
  onLabelClick?: () => void;
  itemIcon: React.ReactNode;
  itemLabel: string;
  onItemClick: () => void;
}) => {
  const [open, setOpen] = useState(false);
  // 用户名这一块是否高亮；与头像图标（菜单展开时高亮）互斥，同一时间只有一边显示聚焦
  const [nameActive, setNameActive] = useState(false);
  const hovering = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // 点击用户名以外的地方，用户名的高亮消失
  useEffect(() => {
    if (!nameActive) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('.user-chip-name')) setNameActive(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [nameActive]);

  const openMenu = (next: boolean) => {
    if (next) setNameActive(false);
    setOpen(next);
  };

  return (
    <div ref={rootRef} className={`user-chip${open ? ' menu-open' : ''}`}>
      {onLabelClick ? (
        <button type="button" className="user-chip-name" title={label} onClick={onLabelClick}>
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <div
          className={`user-chip-name is-static${nameActive ? ' is-active' : ''}`}
          title={label}
          tabIndex={0}
          onPointerDown={() => { setOpen(false); setNameActive(true); }}
          onFocus={() => { setOpen(false); setNameActive(true); }}
          onBlur={() => setNameActive(false)}
        >
          <span className="truncate">{label}</span>
        </div>
      )}
      <div
        className="user-chip-menu"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') { hovering.current = true; openMenu(true); } }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { hovering.current = false; setOpen(false); } }}
      >
        <button
          type="button"
          className={`user-chip-icon${open ? ' is-active' : ''}`}
          aria-label="用户菜单"
          aria-haspopup="menu"
          aria-expanded={open}
          onFocus={() => setNameActive(false)}
          onClick={() => openMenu(hovering.current || !open)}
        >
          <UserIcon className="w-4 h-4" />
        </button>
        {open && (
          <div className="user-menu-popover">
            <div className="user-menu-panel" role="menu">
              <button type="button" role="menuitem" className="user-menu-item" onClick={() => { setOpen(false); onItemClick(); }}>
                {itemIcon}{itemLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const UserMenu = ({ username, onLogout }: { username: string; onLogout: () => void }) => (
  <ChipMenu label={username} itemIcon={<LogoutIcon className="w-4 h-4" />} itemLabel="退出" onItemClick={onLogout} />
);

export const GuestMenu = ({ onLogin }: { onLogin: () => void }) => (
  <ChipMenu label="未登录" onLabelClick={onLogin} itemIcon={<LoginIcon />} itemLabel="登录" onItemClick={onLogin} />
);
