package udp

import (
	"net"

	"github.com/go-gost/core/limiter"
	"github.com/go-gost/core/listener"
	"github.com/go-gost/core/logger"
	md "github.com/go-gost/core/metadata"
	admission "github.com/go-gost/x/admission/wrapper"
	xnet "github.com/go-gost/x/internal/net"
	"github.com/go-gost/x/internal/net/udp"
	climiter "github.com/go-gost/x/limiter/conn/wrapper"
	traffic_limiter "github.com/go-gost/x/limiter/traffic"
	limiter_wrapper "github.com/go-gost/x/limiter/traffic/wrapper"
	metrics "github.com/go-gost/x/metrics/wrapper"
	stats "github.com/go-gost/x/observer/stats/wrapper"
	"github.com/go-gost/x/registry"
)

func init() {
	registry.ListenerRegistry().Register("udp", NewListener)
}

type udpListener struct {
	ln      net.Listener
	logger  logger.Logger
	md      metadata
	options listener.Options
}

func NewListener(opts ...listener.Option) listener.Listener {
	options := listener.Options{}
	for _, opt := range opts {
		opt(&options)
	}
	return &udpListener{
		logger:  options.Logger,
		options: options,
	}
}

func (l *udpListener) Init(md md.Metadata) (err error) {
	if err = l.parseMetadata(md); err != nil {
		return
	}

	network := "udp"
	if xnet.IsIPv4(l.options.Addr) {
		network = "udp4"
	}
	laddr, err := net.ResolveUDPAddr(network, l.options.Addr)
	if err != nil {
		return
	}

	var conn net.PacketConn
	// 源进源出：仅对监听通配地址的服务生效，改为在每个网卡的 IP 上各监听一个套接字，回包原路返回；
	// 取不到可用地址时退回普通监听
	if l.md.sourceInOut && (laddr.IP == nil || laddr.IP.IsUnspecified()) {
		if mc := listenSourceInOut(laddr.Port, network == "udp4"); mc != nil {
			conn = mc
		}
	}
	if conn == nil {
		conn, err = net.ListenUDP(network, laddr)
		if err != nil {
			return
		}
	}
	conn = metrics.WrapPacketConn(l.options.Service, conn)
	conn = stats.WrapPacketConn(conn, l.options.Stats)
	conn = admission.WrapPacketConn(l.options.Admission, conn)
	conn = limiter_wrapper.WrapPacketConn(
		conn,
		l.options.TrafficLimiter,
		traffic_limiter.ServiceLimitKey,
		limiter.ScopeOption(limiter.ScopeService),
		limiter.ServiceOption(l.options.Service),
		limiter.NetworkOption(conn.LocalAddr().Network()),
	)

	l.ln = udp.NewListener(conn, &udp.ListenConfig{
		Backlog:        l.md.backlog,
		ReadQueueSize:  l.md.readQueueSize,
		ReadBufferSize: l.md.readBufferSize,
		Keepalive:      l.md.keepalive,
		TTL:            l.md.ttl,
		Logger:         l.logger,
	})
	// 连接数限制：UDP 没有真正的连接，这里把「同一个客户端地址:端口」在 TTL 内的数据包视为一个连接（会话），
	// 与 TCP 监听一样按 climiter 的「$ N」限制总连接数、「$$ N」限制单个客户端 IP 的连接数；
	// 超过限制的新会话会被直接关闭，其数据包被丢弃。会话空闲超过 TTL 关闭后，连接数随之释放
	l.ln = climiter.WrapListener(l.options.ConnLimiter, l.ln)
	return
}

func (l *udpListener) Accept() (conn net.Conn, err error) {
	return l.ln.Accept()
}

func (l *udpListener) Addr() net.Addr {
	return l.ln.Addr()
}

func (l *udpListener) Close() error {
	return l.ln.Close()
}
