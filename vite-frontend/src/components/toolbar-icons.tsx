const ToolbarIcon = ({ children }: { children: React.ReactNode }) => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

/** 工具栏「添加」图标：带加号的文件 */
export const ToolbarAddIcon = () => (
  <ToolbarIcon><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M12 11.500v5M9.500 14h5" /></ToolbarIcon>
);

/** 工具栏「删除」图标：垃圾桶 */
export const ToolbarDeleteIcon = () => (
  <ToolbarIcon><path d="M4 7h16M9 7V4.500h6V7M6.500 7l1 13h9l1-13" /></ToolbarIcon>
);
