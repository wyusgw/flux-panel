import { useEffect, useRef, useState } from "react";
import { UserIcon } from "@/components/icons";

export const LogoutIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M18.4 7.5A8 8 0 1020 12h-7" />
  </svg>
);

const LoginIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M18.4 7.5A8 8 0 1020 12h-9" />
    <path d="M14 8.5L10.5 12l3.5 3.5" />
  </svg>
);

// 顶栏右上角的两块式标识（登录前后共用）：文字与用户图标分别高亮。
// 用户图标在鼠标悬停时展开菜单，触屏和键盘则点击展开、再点收起；文字默认同样点击展开，传了 onLabelClick 时改为执行它
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

  return (
    <div ref={rootRef} className="user-chip">
      <button type="button" className="user-chip-name" title={label} onClick={onLabelClick ?? (() => setOpen(prev => !prev))}>
        <span className="truncate">{label}</span>
      </button>
      <div
        className="user-chip-menu"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') { hovering.current = true; setOpen(true); } }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { hovering.current = false; setOpen(false); } }}
      >
        <button
          type="button"
          className={`user-chip-icon${open ? ' is-active' : ''}`}
          aria-label="用户菜单"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(prev => hovering.current || !prev)}
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
