//go:build !linux

package udp

// ConntrackSessions 仅 Linux 提供系统 UDP 流追踪。
func ConntrackSessions() (inbound, outbound int, ok bool) {
	return 0, 0, false
}
