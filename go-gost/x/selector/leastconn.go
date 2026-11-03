package selector

import (
	"context"
	"sync"
	"sync/atomic"

	"github.com/go-gost/core/selector"
)

// activeConns 记录每个转发目标节点当前的活跃连接数，key 是节点对象本身（指针），value 是 *int64。
// 最小连接数策略据此挑选当前连接最少的节点；转发处理器在选中节点后调用 AcquireConn 计数，连接结束时释放。
var activeConns sync.Map

func connCounter(v any) *int64 {
	if c, ok := activeConns.Load(v); ok {
		return c.(*int64)
	}
	c, _ := activeConns.LoadOrStore(v, new(int64))
	return c.(*int64)
}

// AcquireConn 把节点的活跃连接数加 1，返回的函数在连接结束时调用以减 1（可重复调用，只生效一次）。
// 节点为 nil 时什么也不做。
func AcquireConn(v any) func() {
	if v == nil {
		return func() {}
	}
	counter := connCounter(v)
	atomic.AddInt64(counter, 1)
	var once sync.Once
	return func() {
		once.Do(func() { atomic.AddInt64(counter, -1) })
	}
}

type leastConnStrategy[T any] struct {
	counter uint64
}

// LeastConnStrategy 最小连接数策略：选择当前活跃连接最少的节点；
// 有多个节点连接数相同时在它们之间轮换，避免新连接总是落到列表里靠前的那个。
func LeastConnStrategy[T any]() selector.Strategy[T] {
	return &leastConnStrategy[T]{}
}

func (s *leastConnStrategy[T]) Apply(ctx context.Context, vs ...T) (v T) {
	if len(vs) == 0 {
		return
	}

	min := int64(-1)
	var candidates []int
	for i := range vs {
		n := atomic.LoadInt64(connCounter(any(vs[i])))
		switch {
		case min < 0 || n < min:
			min = n
			candidates = candidates[:0]
			candidates = append(candidates, i)
		case n == min:
			candidates = append(candidates, i)
		}
	}

	k := atomic.AddUint64(&s.counter, 1) - 1
	return vs[candidates[int(k%uint64(len(candidates)))]]
}
