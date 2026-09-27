/**
 * 复制文本到剪贴板。navigator.clipboard 只在安全上下文（https 或 localhost）下可用——
 * Docker 部署常见直接用 http://ip:port 访问面板，这种非安全上下文下 navigator.clipboard
 * 通常是 undefined，直接调用会抛错导致复制失败。这里在不可用时退回旧版 execCommand 方案。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 继续往下尝试旧版方案
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
