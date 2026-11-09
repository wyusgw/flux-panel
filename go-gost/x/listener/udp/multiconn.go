package udp

import (
	"errors"
	"net"
	"sync"
	"time"
)

// 源进源出：对监听通配地址的 UDP 服务，改为在每个网卡的 IP 上各监听一个套接字，
// 并记住每个客户端地址是从哪个套接字进来的，回包时从同一个套接字（同一个源 IP）发出。

const (
	sourceMapTTL      = 10 * time.Minute
	sourceMapMaxSize  = 65536
	sourceReadChanLen = 256
)

type multiPacket struct {
	data []byte
	addr net.Addr
	src  *net.UDPConn
}

type sourceEntry struct {
	conn *net.UDPConn
	seen time.Time
}

type multiPacketConn struct {
	conns []*net.UDPConn
	ch    chan multiPacket

	mu      sync.Mutex
	sources map[string]sourceEntry
	lastGC  time.Time

	closeOnce sync.Once
	closed    chan struct{}
	wg        sync.WaitGroup
}

func newMultiPacketConn(conns []*net.UDPConn, bufSize int) *multiPacketConn {
	m := &multiPacketConn{
		conns:   conns,
		ch:      make(chan multiPacket, sourceReadChanLen),
		sources: make(map[string]sourceEntry),
		lastGC:  time.Now(),
		closed:  make(chan struct{}),
	}
	if bufSize <= 0 {
		bufSize = 65535
	}
	for _, c := range conns {
		m.wg.Add(1)
		go m.readLoop(c, bufSize)
	}
	return m
}

func (m *multiPacketConn) readLoop(c *net.UDPConn, bufSize int) {
	defer m.wg.Done()
	buf := make([]byte, bufSize)
	for {
		n, addr, err := c.ReadFrom(buf)
		if err != nil {
			select {
			case <-m.closed:
				return
			default:
			}
			var ne net.Error
			if errors.As(err, &ne) && ne.Timeout() {
				continue
			}
			// 单个套接字出错（例如网卡地址被移除）不影响其他套接字
			return
		}
		data := make([]byte, n)
		copy(data, buf[:n])
		m.remember(addr, c)
		select {
		case m.ch <- multiPacket{data: data, addr: addr, src: c}:
		case <-m.closed:
			return
		}
	}
}

func (m *multiPacketConn) remember(addr net.Addr, c *net.UDPConn) {
	now := time.Now()
	key := addr.String()
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sources[key] = sourceEntry{conn: c, seen: now}
	if now.Sub(m.lastGC) > time.Minute || len(m.sources) > sourceMapMaxSize {
		for k, e := range m.sources {
			if now.Sub(e.seen) > sourceMapTTL {
				delete(m.sources, k)
			}
		}
		m.lastGC = now
	}
}

func (m *multiPacketConn) ReadFrom(b []byte) (int, net.Addr, error) {
	select {
	case p := <-m.ch:
		n := copy(b, p.data)
		return n, p.addr, nil
	case <-m.closed:
		return 0, nil, net.ErrClosed
	}
}

func (m *multiPacketConn) WriteTo(b []byte, addr net.Addr) (int, error) {
	m.mu.Lock()
	e, ok := m.sources[addr.String()]
	m.mu.Unlock()
	if !ok {
		return 0, errors.New("udp: no source socket for " + addr.String())
	}
	return e.conn.WriteTo(b, addr)
}

func (m *multiPacketConn) Close() error {
	var err error
	m.closeOnce.Do(func() {
		close(m.closed)
		for _, c := range m.conns {
			if e := c.Close(); e != nil && err == nil {
				err = e
			}
		}
	})
	return err
}

func (m *multiPacketConn) LocalAddr() net.Addr {
	a := m.conns[0].LocalAddr().(*net.UDPAddr)
	// 对外展示为通配地址:端口，与未开启源进源出时一致
	return &net.UDPAddr{IP: net.IPv4zero, Port: a.Port}
}

func (m *multiPacketConn) SetDeadline(t time.Time) error {
	return m.each(func(c *net.UDPConn) error { return c.SetDeadline(t) })
}

func (m *multiPacketConn) SetReadDeadline(t time.Time) error {
	return m.each(func(c *net.UDPConn) error { return c.SetReadDeadline(t) })
}

func (m *multiPacketConn) SetWriteDeadline(t time.Time) error {
	return m.each(func(c *net.UDPConn) error { return c.SetWriteDeadline(t) })
}

func (m *multiPacketConn) each(f func(*net.UDPConn) error) error {
	var first error
	for _, c := range m.conns {
		if err := f(c); err != nil && first == nil {
			first = err
		}
	}
	return first
}

// listenSourceInOut 在 port 上为每个网卡的单播 IP 各监听一个 UDP 套接字；
// 没有可用地址或全部监听失败时返回 nil，调用方应退回普通的通配监听。
// ipv4Only 为 true 时只监听 IPv4 地址。
func listenSourceInOut(port int, ipv4Only bool) *multiPacketConn {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	var conns []*net.UDPConn
	seen := map[string]bool{}
	for _, a := range addrs {
		ipNet, ok := a.(*net.IPNet)
		if !ok {
			continue
		}
		ip := ipNet.IP
		if ip.IsUnspecified() || ip.IsMulticast() || ip.IsLinkLocalUnicast() {
			continue
		}
		is4 := ip.To4() != nil
		if ipv4Only && !is4 {
			continue
		}
		network := "udp6"
		if is4 {
			network = "udp4"
		}
		key := ip.String()
		if seen[key] {
			continue
		}
		seen[key] = true
		c, err := net.ListenUDP(network, &net.UDPAddr{IP: ip, Port: port})
		if err != nil {
			continue
		}
		conns = append(conns, c)
	}
	if len(conns) == 0 {
		return nil
	}
	return newMultiPacketConn(conns, 0)
}
