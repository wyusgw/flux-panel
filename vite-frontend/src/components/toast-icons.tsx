// 提示消息图标：实心圆底 + 深色符号
export const ToastInfoIcon = () => (
  <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#6f9bff" />
    <circle cx="12" cy="7.4" r="1.5" fill="#15161a" />
    <rect x="10.7" y="10.2" width="2.6" height="7.6" rx="1.3" fill="#15161a" />
  </svg>
);

export const ToastSuccessIcon = () => (
  <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#1f9d2f" />
    <path d="M7.8 12.4l2.8 2.8 5.6-5.8" fill="none" stroke="#15161a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ToastErrorIcon = () => (
  <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#e5484d" />
    <path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4" fill="none" stroke="#15161a" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const ToastWarningIcon = () => (
  <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#f5a623" />
    <rect x="10.7" y="6.5" width="2.6" height="7.6" rx="1.3" fill="#15161a" />
    <circle cx="12" cy="16.8" r="1.5" fill="#15161a" />
  </svg>
);
