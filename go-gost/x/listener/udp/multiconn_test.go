package udp

import (
	"net"
	"testing"
	"time"
)

func freeUDPPort(t *testing.T) int {
	t.Helper()
	c, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		t.Skip("cannot allocate udp port:", err)
	}
	defer c.Close()
	return c.LocalAddr().(*net.UDPAddr).Port
}

// 沙箱或防火墙可能挡住发往本机非回环地址的 UDP，先用普通套接字做对照，对照都不通的地址不参与断言
func plainReachable(ip net.IP) bool {
	srv, err := net.ListenUDP("udp4", &net.UDPAddr{IP: ip, Port: 0})
	if err != nil {
		return false
	}
	defer srv.Close()
	srv.SetDeadline(time.Now().Add(time.Second))
	cli, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		return false
	}
	defer cli.Close()
	if _, err := cli.WriteTo([]byte("x"), srv.LocalAddr()); err != nil {
		return false
	}
	_, _, err = srv.ReadFromUDP(make([]byte, 4))
	return err == nil
}

// 向本机每个 IPv4 地址发包，回包的源地址必须等于被访问的那个地址
func TestSourceInOutRepliesFromSameIP(t *testing.T) {
	port := freeUDPPort(t)
	mc := listenSourceInOut(port, true)
	if mc == nil {
		t.Skip("no usable ipv4 address")
	}
	defer mc.Close()

	go func() {
		buf := make([]byte, 1500)
		for {
			n, addr, err := mc.ReadFrom(buf)
			if err != nil {
				return
			}
			mc.WriteTo(buf[:n], addr)
		}
	}()

	tested := 0
	for _, c := range mc.conns {
		dst := c.LocalAddr().(*net.UDPAddr)
		if dst.IP.To4() == nil {
			continue
		}
		if !dst.IP.IsLoopback() && !plainReachable(dst.IP) {
			t.Logf("skip %s: not reachable even with plain sockets", dst.IP)
			continue
		}
		cli, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
		if err != nil {
			t.Fatal(err)
		}
		cli.SetDeadline(time.Now().Add(2 * time.Second))
		if _, err := cli.WriteTo([]byte("ping"), dst); err != nil {
			cli.Close()
			t.Fatal(err)
		}
		buf := make([]byte, 16)
		n, from, err := cli.ReadFromUDP(buf)
		cli.Close()
		if err != nil {
			t.Fatalf("no reply via %s: %v", dst.IP, err)
		}
		if string(buf[:n]) != "ping" {
			t.Fatalf("unexpected reply %q", buf[:n])
		}
		if !from.IP.Equal(dst.IP) {
			t.Fatalf("reply came from %s, want %s", from.IP, dst.IP)
		}
		tested++
	}
	if tested == 0 {
		t.Skip("no ipv4 socket tested")
	}
}

func TestWriteToUnknownPeerFails(t *testing.T) {
	port := freeUDPPort(t)
	mc := listenSourceInOut(port, true)
	if mc == nil {
		t.Skip("no usable ipv4 address")
	}
	defer mc.Close()
	if _, err := mc.WriteTo([]byte("x"), &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 9}); err == nil {
		t.Fatal("expected error for unknown peer")
	}
	mc.Close()
	if _, _, err := mc.ReadFrom(make([]byte, 8)); err == nil {
		t.Fatal("expected error after close")
	}
}
