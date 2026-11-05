import { useEffect, useRef } from 'react';

/**
 * 第三方验证码弹层：Google reCAPTCHA v2（复选框）与 Cloudflare Turnstile。
 * 打开时按需加载服务商脚本并渲染组件，用户通过后把令牌交给 onToken，登录时随请求带给后端校验；
 * 脚本加载失败（网络访问不了服务商）时调用 onError，由调用方提示并关闭。
 */
export type ThirdPartyProvider = 'GOOGLE' | 'CLOUDFLARE';

const SCRIPT_URLS: Record<ThirdPartyProvider, string> = {
  GOOGLE: 'https://www.google.com/recaptcha/api.js?render=explicit',
  CLOUDFLARE: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
};

const PROVIDER_NAMES: Record<ThirdPartyProvider, string> = {
  GOOGLE: 'Google reCAPTCHA',
  CLOUDFLARE: 'Cloudflare Turnstile',
};

// 同一个脚本只加载一次，已加载的直接复用
const scriptPromises: Partial<Record<ThirdPartyProvider, Promise<void>>> = {};

const loadScript = (provider: ThirdPartyProvider): Promise<void> => {
  const cached = scriptPromises[provider];
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URLS[provider];
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // 失败后允许下次重新尝试加载
      delete scriptPromises[provider];
      script.remove();
      reject(new Error('验证码脚本加载失败'));
    };
    document.head.appendChild(script);
  });
  scriptPromises[provider] = promise;
  return promise;
};

// 脚本的 onload 之后全局对象（grecaptcha / turnstile）有时还没就绪（reCAPTCHA 要等 ready 回调），这里轮询等待
const waitForApi = async (provider: ThirdPartyProvider): Promise<any> => {
  const key = provider === 'GOOGLE' ? 'grecaptcha' : 'turnstile';
  for (let i = 0; i < 100; i++) {
    const api = (window as any)[key];
    if (api && (provider !== 'GOOGLE' || typeof api.render === 'function')) return api;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('验证码组件初始化超时');
};

export function ThirdPartyCaptcha({ provider, siteKey, onToken, onCancel, onError }: {
  provider: ThirdPartyProvider;
  siteKey: string;
  onToken: (token: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 回调放进 ref，避免父组件重渲染时重复渲染验证码组件
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useEffect(() => {
    let cancelled = false;
    let widgetId: any = null;
    let api: any = null;

    (async () => {
      try {
        await loadScript(provider);
        api = await waitForApi(provider);
        if (cancelled || !containerRef.current) return;
        const isDark = document.documentElement.classList.contains('dark');
        const render = () => {
          if (cancelled || !containerRef.current) return;
          widgetId = api.render(containerRef.current, {
            sitekey: siteKey,
            theme: isDark ? 'dark' : 'light',
            callback: (token: string) => callbacks.current.onToken(token),
            'error-callback': () => callbacks.current.onError('验证码验证失败或加载失败'),
          });
        };
        // reCAPTCHA 要在 ready 之后才能 render
        if (provider === 'GOOGLE' && typeof api.ready === 'function') api.ready(render); else render();
      } catch (error: any) {
        if (!cancelled) callbacks.current.onError(`${PROVIDER_NAMES[provider]} 加载失败，请检查网络是否能访问该服务`);
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (api && widgetId !== null) {
          if (provider === 'CLOUDFLARE') api.remove(widgetId);
          else api.reset(widgetId);
        }
      } catch {
        // 组件已不在页面上，忽略
      }
    };
  }, [provider, siteKey]);

  // 没有卡片、标题和按钮：只在模糊的暗色背景上显示服务商自己的验证框；
  // 想取消登录时点击验证框外的背景，或按 Esc
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm captcha-backdrop-enter" onClick={onCancel} />
      <div ref={containerRef} className="relative flex justify-center" />
    </div>
  );
}
