package panelproxy

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"golang.org/x/crypto/ssh"
	"io"
	"net"
	"strconv"
	"testing"
)

func TestParse(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"", "", false},
		{"127.0.0.1", "socks5://127.0.0.1:1080", false},
		{"1.2.3.4:7890", "socks5://1.2.3.4:7890", false},
		{"socks5://u:p@1.2.3.4:7890", "socks5://u:p@1.2.3.4:7890", false},
		{"socks5h://1.2.3.4:7890", "socks5://1.2.3.4:7890", false},
		{"socks://1.2.3.4:7890", "socks5://1.2.3.4:7890", false},
		{"http://1.2.3.4:8080", "", true},
		{"socks5://:1080", "", true},
		{"ssh://u:p@1.2.3.4", "ssh://u:p@1.2.3.4:22", false},
		{"ssh://u:p@1.2.3.4:2222", "ssh://u:p@1.2.3.4:2222", false},
		{"ssh://1.2.3.4:22", "", true},
		{"ssh://u@1.2.3.4:22", "", true},
	}
	for _, c := range cases {
		u, err := Parse(c.in)
		if (err != nil) != c.wantErr {
			t.Fatalf("%q: err=%v wantErr=%v", c.in, err, c.wantErr)
		}
		got := ""
		if u != nil {
			got = u.String()
		}
		if got != c.want {
			t.Fatalf("%q: got %q want %q", c.in, got, c.want)
		}
	}
}

func TestDialContextEmpty(t *testing.T) {
	d, err := DialContext("")
	if err != nil || d != nil {
		t.Fatalf("empty proxy should return nil dialer, got nil=%v err=%v", d == nil, err)
	}
}

// 最小 SOCKS5 服务端（无认证，仅 CONNECT），验证拨号确实经过代理。
func TestDialThroughSocks5(t *testing.T) {
	target, _ := net.Listen("tcp", "127.0.0.1:0")
	defer target.Close()
	go func() {
		c, err := target.Accept()
		if err == nil {
			c.Write([]byte("pong"))
			c.Close()
		}
	}()

	proxyLn, _ := net.Listen("tcp", "127.0.0.1:0")
	defer proxyLn.Close()
	connects := make(chan string, 1)
	go func() {
		c, err := proxyLn.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		buf := make([]byte, 262)
		io.ReadFull(c, buf[:2])
		io.ReadFull(c, buf[:int(buf[1])])
		c.Write([]byte{5, 0})
		io.ReadFull(c, buf[:4]) // VER CMD RSV ATYP
		var host string
		switch buf[3] {
		case 1:
			io.ReadFull(c, buf[:4])
			host = net.IP(buf[:4]).String()
		case 3:
			io.ReadFull(c, buf[:1])
			n := int(buf[0])
			io.ReadFull(c, buf[:n])
			host = string(buf[:n])
		}
		io.ReadFull(c, buf[:2])
		port := int(buf[0])<<8 | int(buf[1])
		connects <- net.JoinHostPort(host, strconv.Itoa(port))
		up, err := net.Dial("tcp", net.JoinHostPort(host, strconv.Itoa(port)))
		if err != nil {
			return
		}
		defer up.Close()
		c.Write([]byte{5, 0, 0, 1, 0, 0, 0, 0, 0, 0})
		io.Copy(c, up)
	}()

	d, err := DialContext("socks5://" + proxyLn.Addr().String())
	if err != nil || d == nil {
		t.Fatalf("DialContext: nil=%v err=%v", d == nil, err)
	}
	conn, err := d(context.Background(), "tcp", target.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	b, _ := io.ReadAll(conn)
	if string(b) != "pong" {
		t.Fatalf("got %q", b)
	}
	if got := <-connects; got != target.Addr().String() {
		t.Fatalf("proxy saw %q", got)
	}
}

// 最小 SSH 服务端：密码 u/p，只处理 direct-tcpip 转发。
func TestDialThroughSSH(t *testing.T) {
	target, _ := net.Listen("tcp", "127.0.0.1:0")
	defer target.Close()
	go func() {
		for {
			c, err := target.Accept()
			if err != nil {
				return
			}
			c.Write([]byte("pong"))
			c.Close()
		}
	}()

	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	signer, _ := ssh.NewSignerFromKey(priv)
	cfg := &ssh.ServerConfig{PasswordCallback: func(c ssh.ConnMetadata, pw []byte) (*ssh.Permissions, error) {
		if c.User() == "u" && string(pw) == "p" {
			return nil, nil
		}
		return nil, io.ErrUnexpectedEOF
	}}
	cfg.AddHostKey(signer)

	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	defer ln.Close()
	forwarded := make(chan string, 4)
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc, chans, reqs, err := ssh.NewServerConn(nc, cfg)
				if err != nil {
					return
				}
				go ssh.DiscardRequests(reqs)
				for nch := range chans {
					if nch.ChannelType() != "direct-tcpip" {
						nch.Reject(ssh.UnknownChannelType, "no")
						continue
					}
					d := nch.ExtraData()
					hl := binary.BigEndian.Uint32(d[:4])
					host := string(d[4 : 4+hl])
					port := binary.BigEndian.Uint32(d[4+hl : 8+hl])
					forwarded <- net.JoinHostPort(host, strconv.Itoa(int(port)))
					ch, _, _ := nch.Accept()
					up, err := net.Dial("tcp", net.JoinHostPort(host, strconv.Itoa(int(port))))
					if err != nil {
						ch.Close()
						continue
					}
					go func() { io.Copy(ch, up); ch.Close(); up.Close() }()
				}
				sc.Close()
			}()
		}
	}()

	d, err := New("ssh://u:p@" + ln.Addr().String())
	if err != nil || d == nil {
		t.Fatalf("New: %v %v", d, err)
	}
	defer d.Close()
	for i := 0; i < 2; i++ { // 第二次复用同一条 SSH 连接
		conn, err := d.DialContext(context.Background(), "tcp", target.Addr().String())
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(conn)
		conn.Close()
		if string(b) != "pong" {
			t.Fatalf("got %q", b)
		}
		if got := <-forwarded; got != target.Addr().String() {
			t.Fatalf("ssh saw %q", got)
		}
	}

	bad, _ := New("ssh://u:wrong@" + ln.Addr().String())
	defer bad.Close()
	if _, err := bad.DialContext(context.Background(), "tcp", target.Addr().String()); err == nil {
		t.Fatal("wrong password should fail")
	}
}
