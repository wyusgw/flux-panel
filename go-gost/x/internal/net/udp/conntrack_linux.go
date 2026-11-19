//go:build linux

package udp

import (
	"bufio"
	"net"
	"os"
	"strings"
)

// ConntrackSessions 从 Linux conntrack 表统计仍在超时窗口内的 UDP 流。
// 返回 false 表示系统没有可读取的 conntrack 表，调用方应使用套接字统计回退。
func ConntrackSessions() (inbound, outbound int, ok bool) {
	localIPs, err := localIPSet()
	if err != nil {
		return 0, 0, false
	}

	var file *os.File
	for _, path := range []string{"/proc/net/nf_conntrack", "/proc/net/ip_conntrack"} {
		file, err = os.Open(path)
		if err == nil {
			break
		}
	}
	if file == nil {
		return 0, 0, false
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 || fields[2] != "udp" {
			continue
		}

		var sourceIP, targetIP string
		for _, field := range fields[3:] {
			if strings.HasPrefix(field, "src=") && sourceIP == "" {
				sourceIP = strings.TrimPrefix(field, "src=")
			} else if strings.HasPrefix(field, "dst=") && targetIP == "" {
				targetIP = strings.TrimPrefix(field, "dst=")
			}
			if sourceIP != "" && targetIP != "" {
				break
			}
		}

		_, sourceLocal := localIPs[normalizeIP(sourceIP)]
		_, targetLocal := localIPs[normalizeIP(targetIP)]
		switch {
		case sourceLocal && targetLocal:
			inbound++
			outbound++
		case sourceLocal:
			outbound++
		case targetLocal:
			inbound++
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, 0, false
	}
	return inbound, outbound, true
}

func localIPSet() (map[string]struct{}, error) {
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		return nil, err
	}
	ips := make(map[string]struct{}, len(addresses))
	for _, address := range addresses {
		ip, _, err := net.ParseCIDR(address.String())
		if err != nil {
			continue
		}
		ips[normalizeIP(ip.String())] = struct{}{}
	}
	return ips, nil
}

func normalizeIP(value string) string {
	ip := net.ParseIP(value)
	if ip == nil {
		return value
	}
	return ip.String()
}
