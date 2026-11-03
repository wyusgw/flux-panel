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
//  1. systemd-detect-virt（systemd 自带，覆盖最全，容器优先于虚拟机）；
//     它明确输出 none 时视为物理机，只再看容器特征和 kvm-clock，不再用固件厂商名推测，
//     避免 AWS 裸金属（厂商同样是 Amazon EC2）等物理机被误判为虚拟机
//  2. 容器特征文件（/.dockerenv、/run/.containerenv、/proc/1/environ、/proc/1/cgroup、Kubernetes、OpenVZ、WSL）
//  3. DMI 固件信息（/sys/class/dmi/id 下的厂商、产品名，能区分大多数虚拟机与云平台）
//  4. Xen 半虚拟化（PV）虚拟机没有 DMI 信息，看 /sys/hypervisor/type
//  5. gopsutil 的识别结果（作为 guest 时）
//  6. kvm-clock 时钟源（KVM 虚拟机特有）
//  7. CPU 的 hypervisor 标志位（能确定是虚拟机但不知道具体平台时返回 "vm"）
func detectVirtualization(gopsutilSystem, gopsutilRole string) string {
	if runtime.GOOS != "linux" {
		if gopsutilSystem != "" && gopsutilRole == "guest" {
			return gopsutilSystem
		}
		return ""
	}

	systemdResult, systemdOK := detectBySystemd()
	if systemdResult != "" {
		// systemd 在 KVM 隐藏了 CPUID 特征时只能从固件看出 QEMU，有 kvm-clock 说明实际是 KVM 加速
		if (systemdResult == "qemu" || systemdResult == "bochs") && hasKVMClock() {
			return "kvm"
		}
		return systemdResult
	}
	if v := detectContainer(); v != "" {
		return v
	}
	if systemdOK {
		// systemd-detect-virt 明确判定为非虚拟化
		if hasKVMClock() {
			return "kvm"
		}
		return ""
	}
	if v := detectByDMI(); v != "" {
		// 固件写 QEMU/Bochs 的机器绝大多数是 KVM 加速的虚拟机（纯 QEMU 软件模拟没有 kvm-clock），按 kvm 显示
		if (v == "qemu" || v == "bochs") && hasKVMClock() {
			return "kvm"
		}
		return v
	}
	// Xen dom0（宿主机）同样有 /sys/hypervisor/type，靠 /proc/xen/capabilities 里的 control_d 排除
	if t := readFileTrim("/sys/hypervisor/type"); t != "" && !strings.Contains(readFileTrim("/proc/xen/capabilities"), "control_d") {
		return t
	}
	if gopsutilSystem != "" && gopsutilRole == "guest" {
		return gopsutilSystem
	}
	// 服务商抹掉了固件信息的 KVM 虚拟机仍会提供 kvm-clock 时钟源
	if hasKVMClock() {
		return "kvm"
	}
	if cpuHasHypervisorFlag() {
		return "vm"
	}
	return ""
}

// detectBySystemd 调用 systemd-detect-virt，返回识别结果以及 systemd 是否给出了有效结论：
// 识别到平台时返回 (平台, true)；明确输出 none 时返回 ("", true)；未安装、超时或无输出时返回 ("", false)
func detectBySystemd() (string, bool) {
	path, err := exec.LookPath("systemd-detect-virt")
	if err != nil {
		// 节点程序可能由环境变量很少的方式启动（PATH 为空或不完整），再按常见安装位置找一次
		path = ""
		for _, p := range []string{"/usr/bin/systemd-detect-virt", "/bin/systemd-detect-virt", "/usr/local/bin/systemd-detect-virt", "/usr/lib/systemd/systemd-detect-virt"} {
			if fileExists(p) {
				path = p
				break
			}
		}
		if path == "" {
			return "", false
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// 该命令在物理机上输出 none 且退出码非 0，这里只看输出
	out, _ := exec.CommandContext(ctx, path).Output()
	v := strings.TrimSpace(string(out))
	switch v {
	case "":
		return "", false
	case "none":
		return "", true
	}
	return v, true
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
	// cgroup v2 下 /proc/1/cgroup 只有 "0::/"，看不出容器类型；Kubernetes 的 Pod 会挂载服务账户目录并注入环境变量
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" || fileExists("/var/run/secrets/kubernetes.io/serviceaccount") {
		return "kubernetes"
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
	// 具体的虚拟化软件
	{"vmware", "vmware"},
	{"virtualbox", "oracle"},
	{"innotek", "oracle"},
	{"parallels", "parallels"},
	{"bhyve", "bhyve"},
	{"apple virtualization", "apple"},
	{"xen", "xen"},
	// 云平台（固件里常同时带 qemu/bochs 字样，必须先于下面的通用规则匹配）
	{"amazon ec2", "amazon"},
	{"google compute engine", "google"},
	{"alibaba cloud", "kvm"},
	{"tencent cloud", "kvm"},
	{"huawei cloud", "kvm"},
	{"huaweicloud", "kvm"},
	{"baidu", "kvm"},
	{"ucloud", "kvm"},
	{"jdcloud", "kvm"},
	{"volcengine", "kvm"},
	{"kubevirt", "kvm"},
	{"openstack", "kvm"},
	{"digitalocean", "kvm"},
	{"hetzner", "kvm"},
	{"vultr", "kvm"},
	{"linode", "kvm"},
	{"akamai", "kvm"},
	{"oraclecloud", "kvm"},
	{"scaleway", "kvm"},
	{"proxmox", "kvm"},
	{"cloud hypervisor", "kvm"},
	{"firecracker", "kvm"},
	// 通用规则
	{"kvm", "kvm"},
	{"qemu", "qemu"},
	{"bochs", "bochs"},
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
	return matchDMI(strings.Join(parts, " | "))
}

// matchDMI 根据拼接好的小写 DMI 字段匹配虚拟化平台
func matchDMI(all string) string {
	// Hyper-V（含 Azure）：厂商是 Microsoft Corporation，产品名为 Virtual Machine
	if strings.Contains(all, "microsoft corporation") && strings.Contains(all, "virtual machine") {
		return "microsoft"
	}
	// Nutanix AHV 虚拟机：厂商 Nutanix、产品名 AHV（Nutanix 物理节点厂商也是 Nutanix，不能只看厂商）
	if strings.Contains(all, "nutanix") && strings.Contains(all, "ahv") {
		return "kvm"
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

// hasKVMClock 检查内核可用时钟源里是否有 kvm-clock，只有运行在 KVM 上的虚拟机才会有
func hasKVMClock() bool {
	for _, f := range strings.Fields(readFileTrim("/sys/devices/system/clocksource/clocksource0/available_clocksource")) {
		if f == "kvm-clock" {
			return true
		}
	}
	return false
}
