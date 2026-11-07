import { useMemo } from "react";
import DOMPurify from "dompurify";


/** 公告是 HTML 时，链接一律在新标签页打开，并且不带来源信息 */
const sanitizer = DOMPurify();
sanitizer.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** 过滤后的 HTML：去掉脚本、样式表、表单、嵌入框架和事件属性，只保留展示用的标签 */
export const sanitizeAnnouncement = (html: string): string =>
  sanitizer.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "link", "meta", "base"],
    FORBID_ATTR: ["formaction"],
  });

/** 以 < 开头（忽略前面的空白）才当作 HTML 渲染，其余按纯文本原样保留换行 */
export const isHtmlAnnouncement = (text: string) => text.trimStart().startsWith("<");

/** 站点公告内容：支持 HTML（经过过滤），纯文本按原样换行显示 */
export function AnnouncementContent({ value, className = "" }: { value: string; className?: string }) {
  const html = useMemo(() => (isHtmlAnnouncement(value) ? sanitizeAnnouncement(value) : null), [value]);

  if (html === null) {
    return <p className={`${className} whitespace-pre-wrap`}>{value}</p>;
  }
  return <div className={`${className} announcement-html`} dangerouslySetInnerHTML={{ __html: html }} />;
}
