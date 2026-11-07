// Package panelproxy 让节点通过 SOCKS5 或 SSH 代理连接面板（WebSocket 与 HTTP 上报）。
package panelproxy

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/net/proxy"
)

// Parse 解析代理地址，返回规范化的 URL。空字符串表示不使用代理。
// 支持：socks5://[user:pass@]host:port、socks5h://...、socks://...、host:port（按 SOCKS5 处理），
// 以及 ssh://user:pass@host[:port]（通过 SSH 隧道转发，端口默认 22，必须带用户名和密码）。
// socks5 与 socks5h 都由代理解析域名，面板域名不会在本机解析。
func Parse(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	if !strings.Contains(raw, "://") {
		raw = "socks5://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("代理地址格式错误: %v", err)
	}
	switch strings.ToLower(u.Scheme) {
	case "socks", "socks5", "socks5h":
		u.Scheme = "socks5"
	case "ssh":
		u.Scheme = "ssh"
		if u.User == nil || u.User.Username() == "" {
			return nil, fmt.Errorf("SSH 代理需要用户名和密码")
		}
		if _, ok := u.User.Password(); !ok {
			return nil, fmt.Errorf("SSH 代理需要用户名和密码")
		}
	default:
		return nil, fmt.Errorf("不支持的代理协议: %s（仅支持 socks5、ssh）", u.Scheme)
	}
	if u.Hostname() == "" {
		return nil, fmt.Errorf("代理地址缺少主机")
	}
	if u.Port() == "" {
		port := "1080"
		if u.Scheme == "ssh" {
			port = "22"
		}
		u.Host = net.JoinHostPort(u.Hostname(), port)
	}
	return u, nil
}

// Dialer 通过代理拨号。SSH 代理会复用同一条 SSH 连接，断开后自动重连。
type Dialer struct {
	dial  func(ctx context.Context, network, addr string) (net.Conn, error)
	close func()
}

// DialContext 经代理建立连接。
func (d *Dialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	return d.dial(ctx, network, addr)
}

// Close 释放代理占用的连接（SOCKS5 无需释放）。
func (d *Dialer) Close() {
	if d.close != nil {
		d.close()
	}
}

// New 创建一个独立的代理拨号器；代理为空时返回 nil, nil，调用方使用默认直连。
func New(raw string) (*Dialer, error) {
	u, err := Parse(raw)
	if err != nil || u == nil {
		return nil, err
	}
	if u.Scheme == "ssh" {
		return newSSH(u), nil
	}
	return newSocks5(u)
}

func newSocks5(u *url.URL) (*Dialer, error) {
	var auth *proxy.Auth
	if u.User != nil {
		pwd, _ := u.User.Password()
		auth = &proxy.Auth{User: u.User.Username(), Password: pwd}
	}

	base := &net.Dialer{Timeout: 10 * time.Second}
	d, err := proxy.SOCKS5("tcp", u.Host, auth, base)
	if err != nil {
		return nil, fmt.Errorf("创建 SOCKS5 拨号器失败: %v", err)
	}

	return &Dialer{dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
		if cd, ok := d.(proxy.ContextDialer); ok {
			return cd.DialContext(ctx, network, addr)
		}
		return d.Dial(network, addr)
	}}, nil
}

func newSSH(u *url.URL) *Dialer {
	pwd, _ := u.User.Password()
	cfg := &ssh.ClientConfig{
		User: u.User.Username(),
		Auth: []ssh.AuthMethod{ssh.Password(pwd)},
		// 不校验服务器公钥：节点与面板之间的消息本身有密钥加密，这里只是转发通道
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	var (
		mu     sync.Mutex
		client *ssh.Client
	)

	connect := func(ctx context.Context) (*ssh.Client, error) {
		nd := &net.Dialer{Timeout: cfg.Timeout}
		conn, err := nd.DialContext(ctx, "tcp", u.Host)
		if err != nil {
			return nil, err
		}
		// 握手阶段限时，完成后清除，避免影响后续转发
		conn.SetDeadline(time.Now().Add(cfg.Timeout))
		c, chans, reqs, err := ssh.NewClientConn(conn, u.Host, cfg)
		if err != nil {
			conn.Close()
			return nil, err
		}
		conn.SetDeadline(time.Time{})
		return ssh.NewClient(c, chans, reqs), nil
	}

	get := func(ctx context.Context) (*ssh.Client, error) {
		mu.Lock()
		defer mu.Unlock()
		if client != nil {
			return client, nil
		}
		c, err := connect(ctx)
		if err != nil {
			return nil, fmt.Errorf("连接 SSH 代理失败: %v", err)
		}
		client = c
		return client, nil
	}

	drop := func(bad *ssh.Client) {
		mu.Lock()
		defer mu.Unlock()
		if client == bad {
			client = nil
		}
		bad.Close()
	}

	return &Dialer{
		dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			// 复用的 SSH 连接可能已断开，失败时丢弃并重连一次
			for attempt := 0; ; attempt++ {
				c, err := get(ctx)
				if err != nil {
					return nil, err
				}
				conn, err := c.Dial(network, addr)
				if err == nil {
					return conn, nil
				}
				if attempt > 0 {
					return nil, fmt.Errorf("通过 SSH 代理连接失败: %v", err)
				}
				drop(c)
			}
		},
		close: func() {
			mu.Lock()
			defer mu.Unlock()
			if client != nil {
				client.Close()
				client = nil
			}
		},
	}
}

var (
	cacheMu  sync.Mutex
	cacheRaw string
	cacheDlr *Dialer
)

// DialContext 返回走代理的拨号函数，供长期使用的连接共用；代理为空时返回 nil。
// 代理地址变化时会关闭旧的拨号器。
func DialContext(raw string) (func(ctx context.Context, network, addr string) (net.Conn, error), error) {
	raw = strings.TrimSpace(raw)
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if raw != cacheRaw && cacheDlr != nil {
		cacheDlr.Close()
		cacheDlr, cacheRaw = nil, ""
	}
	if raw == "" {
		return nil, nil
	}
	if cacheDlr == nil {
		d, err := New(raw)
		if err != nil {
			return nil, err
		}
		cacheDlr, cacheRaw = d, raw
	}
	return cacheDlr.DialContext, nil
}
