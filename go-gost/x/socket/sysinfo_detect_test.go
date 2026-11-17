package socket

import "testing"

func TestOSFromRelease(t *testing.T) {
	cases := []struct {
		name          string
		osRelease     string
		debianVersion string
		raspi         bool
		wantName      string
		wantVersion   string
	}{
		{"ubuntu", "NAME=\"Ubuntu\"\nID=ubuntu\nID_LIKE=debian\nVERSION_ID=\"22.04\"\n", "bookworm/sid", false, "ubuntu", "22.04"},
		// Debian 的 VERSION_ID 只有大版本，debian_version 有小版本时用它
		{"debian point release", "ID=debian\nVERSION_ID=\"12\"\n", "12.5", false, "debian", "12.5"},
		{"debian testing", "ID=debian\n", "trixie/sid", false, "debian", ""},
		// 没有 lsb-release 的 Kali，gopsutil 会当成 debian；debian_version 不是数字版本时不用它
		{"kali", "ID=kali\nID_LIKE=debian\nVERSION_ID=\"2024.1\"\n", "kali-rolling", false, "kali", "2024.1"},
		{"raspberry pi os bookworm", "ID=debian\nVERSION_ID=\"12\"\n", "12.4", true, "raspbian", "12.4"},
		{"manjaro", "NAME=\"Manjaro Linux\"\nID=manjaro\nID_LIKE=arch\nBUILD_ID=rolling\n", "", false, "manjaro", ""},
		{"amazon linux", "ID=\"amzn\"\nVERSION_ID=\"2023\"\n", "", false, "amzn", "2023"},
		{"oracle linux", "ID=\"ol\"\nVERSION_ID=\"9.3\"\n", "", false, "ol", "9.3"},
		{"arch single quotes", "ID='arch'\n# comment\n\nBUILD_ID=rolling\n", "", false, "arch", ""},
		{"uppercase id", "ID=openEuler\nVERSION_ID=\"22.03\"\n", "", false, "openeuler", "22.03"},
	}
	for _, c := range cases {
		name, version, ok := osFromRelease(parseOSRelease(c.osRelease), c.debianVersion, c.raspi)
		if !ok || name != c.wantName || version != c.wantVersion {
			t.Errorf("%s: got (%q, %q, %v), want (%q, %q, true)", c.name, name, version, ok, c.wantName, c.wantVersion)
		}
	}

	if _, _, ok := osFromRelease(parseOSRelease("NAME=Unknown\n"), "", false); ok {
		t.Error("没有 ID 时应返回 ok=false，沿用 gopsutil 的结果")
	}
}

func TestParseLscpuModel(t *testing.T) {
	output := "Architecture:             aarch64\n" +
		"Vendor ID:                ARM\n" +
		"  BIOS Model name:        Not Specified\n" +
		"  Model name:             Neoverse-V2\n" +
		"    Model:                1\n"
	if got := parseLscpuModel(output); got != "Neoverse-V2" {
		t.Errorf("got %q", got)
	}
	// 认不出的核心 lscpu 输出 -，跳过
	if got := parseLscpuModel("Model name: -\nModel name: Cortex-A72\n"); got != "Cortex-A72" {
		t.Errorf("got %q", got)
	}
	if got := parseLscpuModel("Architecture: x86_64\n"); got != "" {
		t.Errorf("got %q", got)
	}
}

func TestPickCPUModelSkipsUndefinedAndEmpty(t *testing.T) {
	undefined := func() string { return "Undefined" }
	empty := func() string { return "" }
	lscpu := func() string { return "Neoverse-N1" }
	board := func() string { return "Raspberry Pi 4 Model B Rev 1.4" }

	if got := pickCPUModel(undefined, lscpu, board); got != "Neoverse-N1" {
		t.Errorf("got %q", got)
	}
	if got := pickCPUModel(empty, empty, board); got != "Raspberry Pi 4 Model B Rev 1.4" {
		t.Errorf("got %q", got)
	}
	if got := pickCPUModel(undefined, empty); got != "" {
		t.Errorf("都取不到时应为空，got %q", got)
	}
	x86 := func() string { return "Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz" }
	if got := pickCPUModel(x86, lscpu); got != "Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz" {
		t.Errorf("gopsutil 有效时应直接用它，got %q", got)
	}
	if got := cleanDeviceTreeModel("Raspberry Pi 5 Model B Rev 1.0\x00"); got != "Raspberry Pi 5 Model B Rev 1.0" {
		t.Errorf("got %q", got)
	}
}

func TestSelectTrafficInterfaces(t *testing.T) {
	type nic struct {
		physical bool
		master   string
	}
	run := func(nics map[string]nic, order []string) map[string]bool {
		return selectTrafficInterfaces(order,
			func(n string) bool { return nics[n].physical },
			func(n string) string { return nics[n].master })
	}
	check := func(name string, got map[string]bool, want ...string) {
		if len(got) != len(want) {
			t.Errorf("%s: got %v, want %v", name, got, want)
			return
		}
		for _, w := range want {
			if !got[w] {
				t.Errorf("%s: got %v, want %v", name, got, want)
			}
		}
	}

	// Docker + WireGuard 主机：只算物理网卡 eth0
	check("docker host", run(map[string]nic{
		"lo": {}, "eth0": {physical: true}, "docker0": {}, "veth12ab": {master: "docker0"}, "wg0": {},
	}, []string{"lo", "eth0", "docker0", "veth12ab", "wg0"}), "eth0")

	// bond：bond0 和 VLAN 子网卡不是物理网卡，两块成员网卡各算一次
	check("bond", run(map[string]nic{
		"bond0": {}, "eno1": {physical: true, master: "bond0"}, "eno2": {physical: true, master: "bond0"}, "bond0.100": {},
	}, []string{"bond0", "eno1", "eno2", "bond0.100"}), "eno1", "eno2")

	// Proxmox：地址在网桥 vmbr0 上，流量按下面的物理网卡算
	check("proxmox bridge", run(map[string]nic{
		"vmbr0": {}, "enp3s0": {physical: true, master: "vmbr0"}, "tap100i0": {master: "vmbr0"},
	}, []string{"vmbr0", "enp3s0", "tap100i0"}), "enp3s0")

	// Azure 加速网络：VF 挂在 eth0 下，两者都是物理网卡，只算 eth0
	check("azure vf", run(map[string]nic{
		"eth0": {physical: true}, "enP1s1": {physical: true, master: "eth0"},
	}, []string{"eth0", "enP1s1"}), "eth0")

	// 容器 / OpenVZ：没有物理网卡，按名称排除虚拟网卡后计入
	check("lxc", run(map[string]nic{"lo": {}, "eth0": {}}, []string{"lo", "eth0"}), "eth0")
	check("openvz", run(map[string]nic{"lo": {}, "venet0": {}, "tun0": {}}, []string{"lo", "venet0", "tun0"}), "venet0")
}

func TestRefineVersion(t *testing.T) {
	cases := []struct {
		name, id, osVersion, gPlatform, gVersion, want string
	}{
		{"centos 7 point release", "centos", "7", "centos", "7.9.2009", "7.9.2009"},
		{"amazon linux 2023", "amzn", "2023", "amazon", "2023.3.20240219", "2023.3.20240219"},
		{"same precision", "ubuntu", "22.04", "ubuntu", "22.04", "22.04"},
		// gopsutil 把 Kali 认成 debian，版本是 kali-rolling，不能拿来用
		{"misdetected kali", "kali", "2024.1", "debian", "kali-rolling", "2024.1"},
		// 9 和 9.3 是细化，但 19.3 不是 9 的细化
		{"not a refinement", "rocky", "9", "rocky", "19.3", "9"},
		// os-release 没有版本：gopsutil 认出同一个发行版才用它的版本
		{"manjaro misdetected as arch", "manjaro", "", "arch", "24.0.1", ""},
		{"no version same platform", "gentoo", "", "gentoo", "2.15", "2.15"},
		{"gopsutil empty", "debian", "12.5", "debian", "", "12.5"},
	}
	for _, c := range cases {
		if got := refineVersion(c.id, c.osVersion, c.gPlatform, c.gVersion); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
