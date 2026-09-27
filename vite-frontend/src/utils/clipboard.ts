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
    // 如果当前是在一个焦点陷阱容器内点击复制（不仅是 HeroUI Modal，Dropdown/Menu/
    // Popover 等浮层同样用 react-aria 的 FocusScope 把焦点限制在自己的子树里，只是
    // 不带 aria-modal 属性），把临时文本框插到 body 上再 focus 会被立刻抢回焦点，
    // 导致 execCommand('copy') 复制不到任何内容（但仍可能返回 true，界面上会显示
    // 复制成功）。与其针对每种浮层单独判断，直接把文本框插到当前已获得焦点的元素
    // 同级——它既然能被聚焦，所在位置必然已经在被允许的焦点范围内
    const activeParent = (document.activeElement as Element | null)?.parentElement;
    const container = (activeParent && activeParent !== document.body ? activeParent : null) || document.body;
    container.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    container.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
