package socket

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// detectVirtualization 识别本机所在的虚拟化/容器平台，物理机或确实无法识别时返回空串。
//
// gopsutil 的 VirtualizationSystem 只认 /proc 下少数特征（xen、kvm 模块、QEMU CPU 型号、openvz、docker 等），
// 对 Hyper-V、VMware、各家云主机（AWS/阿里云/腾讯云等）、CPU 直通的 KVM、LXC/Podman 容器等经常识别不出来，
// 这里按准确度从高到低依次尝试：
//  1. systemd-detect-virt（systemd 自带，覆盖最全，容器优先于虚拟机）
//  2. 容器特征文件（/.dockerenv、/run/.containerenv、/proc/1/environ、/proc/1/cgroup、OpenVZ、WSL）
//  3. DMI 固件信息（/sys/class/dmi/id 下的厂商、产品名，能区分大多数虚拟机与云平台）
//  4. gopsutil 的识别结果（作为 guest 时）
//  5. CPU 的 hypervisor 标志位（能确定是虚拟机但不知道具体平台时返回 "vm"）
func detectVirtualization(gopsutilSystem, gopsutilRole string) string {
	if runtime.GOOS != "linux" {
		if gopsutilSystem != "" && gopsutilRole == "guest" {
			return gopsutilSystem
		}
		return ""
	}

	if v := detectBySystemd(); v != "" {
		return v
	}
	if v := detectContainer(); v != "" {
		return v
	}
	if v := detectByDMI(); v != "" {
		return v
	}
	if gopsutilSystem != "" && gopsutilRole == "guest" {
		return gopsutilSystem
	}
	if cpuHasHypervisorFlag() {
		return "vm"
	}
	return ""
}

// detectBySystemd 调用 systemd-detect-virt；未安装、超时或输出 none 时返回空串
func detectBySystemd() string {
	path, err := exec.LookPath("systemd-detect-virt")
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// 该命令在物理机上输出 none 且退出码非 0，这里只看输出
	out, _ := exec.CommandContext(ctx, path).Output()
	v := strings.TrimSpace(string(out))
	if v == "" || v == "none" {
		return ""
	}
	return v
}

func readFileTrim(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// detectContainer 识别常见容器环境
func detectContainer() string {
	if fileExists("/.dockerenv") {
		return "docker"
	}
	if fileExists("/run/.containerenv") {
		return "podman"
	}
	// systemd/lxc 等容器管理器会在 1 号进程环境变量里写 container=xxx
	if env, err := os.ReadFile("/proc/1/environ"); err == nil {
		for _, kv := range strings.Split(string(env), "\x00") {
			if strings.HasPrefix(kv, "container=") {
				if v := strings.TrimPrefix(kv, "container="); v != "" {
					return v
				}
			}
		}
	}
	if cg := readFileTrim("/proc/1/cgroup"); cg != "" {
		switch {
		case strings.Contains(cg, "/docker"):
			return "docker"
		case strings.Contains(cg, "/kubepods"):
			return "kubernetes"
		case strings.Contains(cg, "/lxc"):
			return "lxc"
		}
	}
	// OpenVZ/Virtuozzo 容器有 /proc/vz 但没有 /proc/bc（宿主机两者都有）
	if fileExists("/proc/vz") && !fileExists("/proc/bc") {
		return "openvz"
	}
	release := strings.ToLower(readFileTrim("/proc/sys/kernel/osrelease"))
	if strings.Contains(release, "microsoft") || strings.Contains(release, "wsl") {
		return "wsl"
	}
	return ""
}

// dmiRules 按 DMI 厂商/产品名中出现的关键字匹配虚拟化平台，名称与 systemd-detect-virt 的输出保持一致；
// 云厂商的 KVM 实例通常只在厂商名里体现，统一归为 kvm
var dmiRules = []struct {
	keyword string
	virt    string
}{
	{"kvm", "kvm"},
	{"qemu", "qemu"},
	{"vmware", "vmware"},
	{"virtualbox", "oracle"},
	{"innotek", "oracle"},
	{"xen", "xen"},
	{"bochs", "bochs"},
	{"parallels", "parallels"},
	{"bhyve", "bhyve"},
	{"apple virtualization", "apple"},
	{"amazon ec2", "amazon"},
	{"google compute engine", "google"},
	{"alibaba cloud", "kvm"},
	{"tencent cloud", "kvm"},
	{"huawei cloud", "kvm"},
	{"openstack", "kvm"},
	{"digitalocean", "kvm"},
	{"hetzner", "kvm"},
	{"vultr", "kvm"},
	{"linode", "kvm"},
	{"akamai", "kvm"},
	{"oraclecloud", "kvm"},
	{"scaleway", "kvm"},
	{"nutanix", "kvm"},
	{"proxmox", "kvm"},
	{"cloud hypervisor", "kvm"},
	{"firecracker", "kvm"},
}

// detectByDMI 读取 /sys/class/dmi/id 下的固件信息识别虚拟机/云主机
func detectByDMI() string {
	fields := []string{"sys_vendor", "product_name", "product_version", "board_vendor", "bios_vendor", "chassis_vendor", "chassis_asset_tag"}
	var parts []string
	for _, f := range fields {
		if v := readFileTrim("/sys/class/dmi/id/" + f); v != "" {
			parts = append(parts, strings.ToLower(v))
		}
	}
	if len(parts) == 0 {
		return ""
	}
	all := strings.Join(parts, " | ")

	// Hyper-V（含 Azure）：厂商是 Microsoft Corporation，产品名为 Virtual Machine
	if strings.Contains(all, "microsoft corporation") && strings.Contains(all, "virtual machine") {
		return "microsoft"
	}
	for _, r := range dmiRules {
		if strings.Contains(all, r.keyword) {
			return r.virt
		}
	}
	return ""
}

// cpuHasHypervisorFlag 检查 /proc/cpuinfo 的 flags 是否带 hypervisor 位（x86 虚拟机都会设置）
func cpuHasHypervisorFlag() bool {
	b, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "flags") {
			for _, f := range strings.Fields(line) {
				if f == "hypervisor" {
					return true
				}
			}
			return false
		}
	}
	return false
}
