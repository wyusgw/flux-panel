package socket

import (
	"bufio"
	"context"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// 节点状态页显示的系统信息补充识别：
//   - 发行版：gopsutil 判断 Debian 系时依赖 /etc/lsb-release（没有就一律当成 debian），
//     判断 RedHat 系时取 *-release 文件的第一个词，标识也不统一（amazon / oracle 而不是 os-release 的 amzn / ol），
//     Kali 精简安装、Devuan、Manjaro 等会被认错。这里优先按 /etc/os-release 的 ID / VERSION_ID 识别，
//     与面板的系统名称、图标对照表使用同一套标识；读不到再沿用 gopsutil 的结果
//   - CPU 型号：gopsutil 在 ARM 上只认 ARM 公司自己的核心且型号表不全，新核心显示 Undefined，
//     Ampere One、鲲鹏等其它厂商没有型号。取不到时依次用 lscpu 的型号、设备树里的开发板型号

// parseOSRelease 解析 os-release 格式（KEY=VALUE，值可以带单引号或双引号），忽略空行和注释
func parseOSRelease(content string) map[string]string {
	fields := make(map[string]string)
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		fields[strings.TrimSpace(key)] = value
	}
	return fields
}

var debianPointRelease = regexp.MustCompile(`^\d+(\.\d+)+$`)

// osFromRelease 按 os-release 的内容得出系统标识和版本。
// Debian 的 VERSION_ID 只有大版本（12），/etc/debian_version 是数字版本（12.5）时用它；
// 树莓派系统新版的 ID 也是 debian，装了 raspi-config 时按 raspbian 显示。没有 ID 时返回 ok=false
func osFromRelease(fields map[string]string, debianVersion string, hasRaspiConfig bool) (name, version string, ok bool) {
	name = strings.ToLower(strings.TrimSpace(fields["ID"]))
	if name == "" {
		return "", "", false
	}
	version = strings.TrimSpace(fields["VERSION_ID"])
	if name == "debian" {
		if v := strings.TrimSpace(debianVersion); debianPointRelease.MatchString(v) {
			version = v
		}
		if hasRaspiConfig {
			name = "raspbian"
		}
	}
	return name, version, true
}

// detectLinuxRelease 读取 /etc/os-release（没有时读 /usr/lib/os-release）识别发行版
func detectLinuxRelease() (name, version string, ok bool) {
	content := readFileTrim("/etc/os-release")
	if content == "" {
		content = readFileTrim("/usr/lib/os-release")
	}
	if content == "" {
		return "", "", false
	}
	return osFromRelease(parseOSRelease(content), readFileTrim("/etc/debian_version"), fileExists("/usr/bin/raspi-config"))
}

// usableCPUModel 型号为空、gopsutil 认不出的 Undefined、lscpu 认不出的 - 都不算
func usableCPUModel(model string) bool {
	m := strings.TrimSpace(model)
	return m != "" && m != "-" && !strings.EqualFold(m, "undefined")
}

// parseLscpuModel 取 lscpu 输出里第一个有效的「Model name:」（不取 BIOS Model name）
func parseLscpuModel(output string) string {
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		value, ok := strings.CutPrefix(line, "Model name:")
		if !ok {
			continue
		}
		if v := strings.TrimSpace(value); usableCPUModel(v) {
			return v
		}
	}
	return ""
}

// lscpuModel 调用 lscpu 取型号；强制英文输出，否则中文系统上字段名是「型号名称」
func lscpuModel() string {
	path, err := exec.LookPath("lscpu")
	if err != nil {
		path = ""
		for _, p := range []string{"/usr/bin/lscpu", "/bin/lscpu", "/usr/local/bin/lscpu"} {
			if fileExists(p) {
				path = p
				break
			}
		}
		if path == "" {
			return ""
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, path)
	cmd.Env = append(os.Environ(), "LC_ALL=C", "LANG=C")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return parseLscpuModel(string(out))
}

// cleanDeviceTreeModel 设备树里的型号以 \0 结尾
func cleanDeviceTreeModel(raw string) string {
	return strings.TrimSpace(strings.Trim(raw, "\x00"))
}

// deviceTreeModel 开发板（树莓派等）在设备树里写有型号
func deviceTreeModel() string {
	for _, p := range []string{"/proc/device-tree/model", "/sys/firmware/devicetree/base/model"} {
		if b, err := os.ReadFile(p); err == nil {
			if m := cleanDeviceTreeModel(string(b)); m != "" {
				return m
			}
		}
	}
	return ""
}

// pickCPUModel 依次取第一个有效的型号，都没有时返回空串（页面显示「暂无型号信息」，不再显示 Undefined）
func pickCPUModel(candidates ...func() string) string {
	for _, candidate := range candidates {
		if m := strings.TrimSpace(candidate()); usableCPUModel(m) {
			return m
		}
	}
	return ""
}

// 流量统计的网卡：原来除回环外全部累加，Docker / veth、网桥、WireGuard 等隧道、VLAN 子网卡、bond 和它的成员网卡
// 会把同一份流量重复计算；容器停止后它的 veth 消失，累计值还会突然变小。
// Linux 上改为只统计物理网卡（/sys/class/net/<网卡>/device 存在）：网桥、bond、VLAN、隧道都没有 device，
// 只算它们下面的物理网卡；master 本身也是物理网卡的（如 Azure 加速网络的 VF 挂在 eth0 下）不再重复计算。
// 容器、OpenVZ 里没有物理网卡时，按名称排除常见的虚拟网卡后全部计入
var virtualInterfacePrefixes = []string{
	"lo", "docker", "br-", "veth", "virbr", "vmbr", "vnet", "lxcbr", "lxdbr", "tun", "tap", "wg", "tailscale", "zt",
	"cni", "flannel", "cali", "kube", "ifb", "dummy", "gre", "erspan", "sit", "ip6tnl", "ip_vti", "ip6_vti", "vxlan", "genev", "nlmon",
}

func isVirtualInterfaceName(name string) bool {
	for _, prefix := range virtualInterfacePrefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

// selectTrafficInterfaces 从网卡列表里选出要统计流量的网卡
func selectTrafficInterfaces(names []string, isPhysical func(string) bool, masterOf func(string) string) map[string]bool {
	selected := make(map[string]bool)
	for _, name := range names {
		if !isPhysical(name) {
			continue
		}
		if master := masterOf(name); master != "" && isPhysical(master) {
			continue
		}
		selected[name] = true
	}
	if len(selected) > 0 {
		return selected
	}
	for _, name := range names {
		if !isVirtualInterfaceName(name) {
			selected[name] = true
		}
	}
	return selected
}

func isPhysicalInterface(name string) bool {
	return fileExists("/sys/class/net/" + name + "/device")
}

func interfaceMaster(name string) string {
	target, err := os.Readlink("/sys/class/net/" + name + "/master")
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.TrimRight(target, "/"), "/")
	return parts[len(parts)-1]
}

// refineVersion os-release 的 VERSION_ID 有时只有大版本（CentOS 7 为 7，Amazon Linux 2023 为 2023），
// gopsutil 从 *-release 文件读到的更细（7.9.2009、2023.3.20240219）。
// 只有确定是同一个版本号的细化时才用 gopsutil 的：它以 os-release 的版本加「.」开头；
// os-release 没有版本时，要求 gopsutil 认出的是同一个发行版。gopsutil 认错发行版（Kali 认成 debian）时不会用到它的版本
func refineVersion(osID, osVersion, gopsutilPlatform, gopsutilVersion string) string {
	g := strings.TrimSpace(gopsutilVersion)
	if g == "" {
		return osVersion
	}
	if osVersion != "" {
		if strings.HasPrefix(g, osVersion+".") {
			return g
		}
		return osVersion
	}
	if strings.EqualFold(strings.TrimSpace(gopsutilPlatform), osID) {
		return g
	}
	return osVersion
}
