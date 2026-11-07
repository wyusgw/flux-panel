import { EmptyState } from "@/components/empty-state";
import { AnnouncementContent } from "@/components/announcement-content";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { useEffect, useState } from "react";

import { getConfigByName, getBackendInfo } from "@/api";
import { PANEL_VERSION, getCachedConfigs } from "@/config/site";

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
    <div className="dashboard-home px-4 lg:px-6 py-5 lg:py-6">
      <section className="dashboard-panel bg-content1 flex flex-col gap-4 px-4 lg:px-6 pt-8 pb-6">
        <h1 className="text-xl font-semibold text-foreground">欢迎使用</h1>
        <p className="mb-2 text-xl font-semibold text-foreground">面板版本: {PANEL_VERSION}</p>

        <Card className="home-inner-card" shadow="none">
          <CardHeader className="px-6 py-4 border-b border-default-100">
            <h2 className="text-base font-semibold text-foreground">站点公告</h2>
          </CardHeader>
          <CardBody className="min-h-24 px-6 py-4">
            {loading ? (
              <div className="flex items-center gap-3 py-3 text-sm text-default-500">
                <span className="animate-spin h-4 w-4 border-2 border-default-300 border-t-primary rounded-full" />
                正在加载公告…
              </div>
            ) : announcement ? (
              <AnnouncementContent value={announcement} className="text-base leading-7 text-foreground" />
            ) : (
              <EmptyState text="暂无站点公告" />
            )}
          </CardBody>
        </Card>

        <Accordion
          variant="bordered"
          selectionMode="multiple"
          className="home-inner-card home-accordion"
          itemClasses={{
            trigger: 'flex-row-reverse gap-3 px-4 py-3',
            title: 'text-sm',
            indicator: 'rotate-180 data-[open=true]:rotate-[-90deg]',
            content: 'px-4 pt-0 pb-3',
          }}
        >
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
      </section>
    </div>
  );
}
