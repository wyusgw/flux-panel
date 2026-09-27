import { Card, CardBody, CardHeader } from "@heroui/card";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { useEffect, useState } from "react";

import { getConfigByName, getBackendInfo } from "@/api";
import { siteConfig, getCachedConfigs } from "@/config/site";

interface SiteInfo {
  title: string;
  allow_register: boolean;
  allow_single_tunnel: boolean;
  allow_looking_glass: boolean;
}

interface BackendInfo {
  time: number;
  version: string;
}

export default function HomePage() {
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [backendInfo, setBackendInfo] = useState<BackendInfo | null>(null);

  useEffect(() => {
    const loadAnnouncement = async () => {
      try {
        const response = await getConfigByName('site_announcement');
        if (response.code === 0 && response.data?.value) {
          setAnnouncement(response.data.value);
        }
      } catch (error) {
        console.error('获取站点公告失败:', error);
      } finally {
        setLoading(false);
      }
    };

    const loadSiteInfo = async () => {
      try {
        const configs = await getCachedConfigs();
        setSiteInfo({
          title: configs.app_name || '',
          allow_register: configs.allow_register === 'true',
          allow_single_tunnel: configs.user_device_group_enabled === 'true',
          allow_looking_glass: configs.allow_looking_glass === 'true',
        });
      } catch (error) {
        console.error('获取站点信息失败:', error);
      }
    };

    const loadBackendInfo = async () => {
      try {
        const response = await getBackendInfo();
        if (response.code === 0 && response.data) {
          setBackendInfo(response.data);
        }
      } catch (error) {
        console.error('获取后端信息失败:', error);
      }
    };

    loadAnnouncement();
    loadSiteInfo();
    loadBackendInfo();
    localStorage.setItem('e', '/dashboard');
  }, []);

  return (
    <div className="dashboard-home px-4 lg:px-6 py-5 lg:py-6 max-w-[1200px] mx-auto">
      <section className="mb-5 lg:mb-6">
        <p className="text-xs font-medium tracking-[0.16em] text-blue-400 uppercase">Welcome</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">欢迎使用 {siteConfig.name}</h1>
        <p className="mt-1 text-sm text-default-500">面板版本 v{siteConfig.version}</p>
      </section>

      <Card className="dashboard-panel">
        <CardHeader className="gap-2 pb-3 border-b border-default-100">
          <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <h2 className="text-base font-semibold text-foreground">系统公告</h2>
        </CardHeader>
        <CardBody className="min-h-32 p-4">
          {loading ? (
            <div className="flex items-center gap-3 py-3 text-sm text-default-500">
              <span className="animate-spin h-4 w-4 border-2 border-default-300 border-t-primary rounded-full" />
              正在加载公告…
            </div>
          ) : announcement ? (
            <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{announcement}</p>
          ) : (
            <p className="py-3 text-sm text-default-500">暂无系统公告</p>
          )}
        </CardBody>
      </Card>

      <div className="mt-4">
        <Accordion variant="bordered" selectionMode="multiple">
          <AccordionItem key="site-info" title="站点信息">
            <pre className="text-xs font-mono text-default-600 bg-default-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {siteInfo ? JSON.stringify(siteInfo, null, 2) : '加载中...'}
            </pre>
          </AccordionItem>
          <AccordionItem key="backend-info" title="后端信息">
            <pre className="text-xs font-mono text-default-600 bg-default-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {backendInfo ? JSON.stringify(backendInfo, null, 2) : '加载中...'}
            </pre>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
