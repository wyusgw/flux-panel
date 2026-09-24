import type { NavigateOptions } from "react-router-dom";
import * as React from "react";

import { HeroUIProvider } from "@heroui/system";
import { useHref, useNavigate } from "react-router-dom";
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastErrorIcon, ToastInfoIcon, ToastSuccessIcon } from '@/components/toast-icons';
import { I18nProvider } from "@react-aria/i18n";

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

export interface ProvidersProps {
  children: React.ReactNode;
}

export function Provider({ children }: ProvidersProps) {
  const navigate = useNavigate();

  return (
    <I18nProvider locale="zh-CN">
      <HeroUIProvider navigate={navigate} useHref={useHref}>
        <ThemeProvider>
          {children}
          <Toaster
            position="top-center"
            containerStyle={{ top: 20 }}
            toastOptions={{
              duration: 2000,
              className: 'app-toast',
              blank: { icon: <ToastInfoIcon /> },
              success: { icon: <ToastSuccessIcon /> },
              error: { icon: <ToastErrorIcon /> },
            }}
          />
        </ThemeProvider>
      </HeroUIProvider>
    </I18nProvider>
  );
}
