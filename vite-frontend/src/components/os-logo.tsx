import type { ReactNode } from 'react';
import svgUbuntu from 'simple-icons/icons/ubuntu.svg?raw';
import svgDebian from 'simple-icons/icons/debian.svg?raw';
import svgCentos from 'simple-icons/icons/centos.svg?raw';
import svgFedora from 'simple-icons/icons/fedora.svg?raw';
import svgAlpine from 'simple-icons/icons/alpinelinux.svg?raw';
import svgArch from 'simple-icons/icons/archlinux.svg?raw';
import svgRocky from 'simple-icons/icons/rockylinux.svg?raw';
import svgAlma from 'simple-icons/icons/almalinux.svg?raw';
import svgKali from 'simple-icons/icons/kalilinux.svg?raw';
import svgOpensuse from 'simple-icons/icons/opensuse.svg?raw';
import svgSuse from 'simple-icons/icons/suse.svg?raw';
import svgRedhat from 'simple-icons/icons/redhat.svg?raw';
import svgFreebsd from 'simple-icons/icons/freebsd.svg?raw';
import svgOpenbsd from 'simple-icons/icons/openbsd.svg?raw';
import svgApple from 'simple-icons/icons/apple.svg?raw';
import svgLinux from 'simple-icons/icons/linux.svg?raw';
import svgManjaro from 'simple-icons/icons/manjaro.svg?raw';
import svgGentoo from 'simple-icons/icons/gentoo.svg?raw';
import svgMint from 'simple-icons/icons/linuxmint.svg?raw';
import svgRaspberrypi from 'simple-icons/icons/raspberrypi.svg?raw';
import svgOpenwrt from 'simple-icons/icons/openwrt.svg?raw';
import svgNixos from 'simple-icons/icons/nixos.svg?raw';
import svgDeepin from 'simple-icons/icons/deepin.svg?raw';

// 系统 Logo：品牌图形来自 simple-icons（CC0 协议）。注意不能 `import { siUbuntu } from 'simple-icons'`——
// 它的入口会把 3000 多个图标全部打进包里（实测主包从 7MB 涨到 12MB），所以改为按文件引入用到的几个 SVG 原文，只取其中的 path。
// Windows 在 simple-icons 里没有收录，这里内置了四宫格 SVG；没有收录的系统（如 Amazon Linux、Oracle Linux）显示通用终端图标。
// 输入是 agent 上报的发行版 ID（ubuntu、debian、rhel…）或 GOOS（windows、darwin、freebsd），不区分大小写。
// 品牌色本身接近黑色的（Apple、AlmaLinux），深色主题下看不清，改用 currentColor 跟随文字颜色。

type Brand = { svg: string; color: string };

const BRANDS: Record<string, Brand> = {
  ubuntu: { svg: svgUbuntu, color: '#E95420' },
  debian: { svg: svgDebian, color: '#A81D33' },
  centos: { svg: svgCentos, color: '#262577' },
  fedora: { svg: svgFedora, color: '#51A2DA' },
  alpine: { svg: svgAlpine, color: '#0D597F' },
  alpinelinux: { svg: svgAlpine, color: '#0D597F' },
  arch: { svg: svgArch, color: '#1793D1' },
  archlinux: { svg: svgArch, color: '#1793D1' },
  rocky: { svg: svgRocky, color: '#10B981' },
  almalinux: { svg: svgAlma, color: 'currentColor' },
  kali: { svg: svgKali, color: '#557C94' },
  opensuse: { svg: svgOpensuse, color: '#73BA25' },
  'opensuse-leap': { svg: svgOpensuse, color: '#73BA25' },
  'opensuse-tumbleweed': { svg: svgOpensuse, color: '#73BA25' },
  sles: { svg: svgSuse, color: '#30BA78' },
  suse: { svg: svgSuse, color: '#30BA78' },
  rhel: { svg: svgRedhat, color: '#EE0000' },
  redhat: { svg: svgRedhat, color: '#EE0000' },
  freebsd: { svg: svgFreebsd, color: '#AB2B28' },
  openbsd: { svg: svgOpenbsd, color: '#F2CA30' },
  darwin: { svg: svgApple, color: 'currentColor' },
  macos: { svg: svgApple, color: 'currentColor' },
  manjaro: { svg: svgManjaro, color: '#35BFA4' },
  gentoo: { svg: svgGentoo, color: '#54487A' },
  linuxmint: { svg: svgMint, color: '#86BE43' },
  raspbian: { svg: svgRaspberrypi, color: '#A22846' },
  openwrt: { svg: svgOpenwrt, color: '#00B5E2' },
  nixos: { svg: svgNixos, color: '#5277C3' },
  deepin: { svg: svgDeepin, color: '#007CFF' },
  linux: { svg: svgLinux, color: '#FCC624' }
};

const windows: ReactNode = (
  <>
    <rect x="3" y="3" width="8" height="8" fill="#0078D4" />
    <rect x="13" y="3" width="8" height="8" fill="#0078D4" />
    <rect x="3" y="13" width="8" height="8" fill="#0078D4" />
    <rect x="13" y="13" width="8" height="8" fill="#0078D4" />
  </>
);

const generic: ReactNode = (
  <>
    <rect x="2.5" y="4" width="19" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

const pathOf = (svg: string) => svg.match(/<path d="([^"]+)"/)?.[1] ?? '';

export const OsLogo = ({ name, className = 'w-4 h-4' }: { name?: string; className?: string }) => {
  const key = (name || '').toLowerCase();
  const brand = BRANDS[key];
  return (
    <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24" aria-hidden="true">
      {key === 'windows' ? windows : brand ? <path d={pathOf(brand.svg)} fill={brand.color} /> : generic}
    </svg>
  );
};
