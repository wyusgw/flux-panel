package selector

import (
	"context"
	"hash/crc32"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-gost/core/logger"
	"github.com/go-gost/core/metadata"
	mdutil "github.com/go-gost/x/metadata/util"
	"github.com/go-gost/core/selector"
	ctxvalue "github.com/go-gost/x/ctx"
)

type roundRobinStrategy[T any] struct {
	counter uint64
}

// RoundRobinStrategy is a strategy for node selector.
// The node will be selected by round-robin algorithm.
func RoundRobinStrategy[T any]() selector.Strategy[T] {
	return &roundRobinStrategy[T]{}
}

func (s *roundRobinStrategy[T]) Apply(ctx context.Context, vs ...T) (v T) {
	if len(vs) == 0 {
		return
	}

	n := atomic.AddUint64(&s.counter, 1) - 1

	// 加权轮询：节点 metadata 里带 weight（正整数）时，按权重比例轮换，
	// 例如权重 3:1 时每 4 次请求里前一个节点占 3 次；都没有设置权重（全部按 1）时与普通轮询完全一致
	weights := make([]int, len(vs))
	sum := 0
	weighted := false
	for i := range vs {
		weight := 1
		if md, _ := any(vs[i]).(metadata.Metadatable); md != nil {
			if w := mdutil.GetInt(md.Metadata(), labelWeight); w > 0 {
				weight = w
			}
		}
		if weight > 1 {
			weighted = true
		}
		weights[i] = weight
		sum += weight
	}
	if !weighted {
		return vs[int(n%uint64(len(vs)))]
	}

	pos := int(n % uint64(sum))
	for i, weight := range weights {
		if pos < weight {
			return vs[i]
		}
		pos -= weight
	}
	return vs[len(vs)-1]
}

type randomStrategy[T any] struct {
	rw *RandomWeighted[T]
	mu sync.Mutex
}

// RandomStrategy is a strategy for node selector.
// The node will be selected randomly.
func RandomStrategy[T any]() selector.Strategy[T] {
	return &randomStrategy[T]{
		rw: NewRandomWeighted[T](),
	}
}

func (s *randomStrategy[T]) Apply(ctx context.Context, vs ...T) (v T) {
	if len(vs) == 0 {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.rw.Reset()
	for i := range vs {
		weight := 0
		if md, _ := any(vs[i]).(metadata.Metadatable); md != nil {
			weight = mdutil.GetInt(md.Metadata(), labelWeight)
		}
		if weight <= 0 {
			weight = 1
		}
		s.rw.Add(vs[i], weight)
	}

	return s.rw.Next()
}

type fifoStrategy[T any] struct{}

// FIFOStrategy is a strategy for node selector.
// The node will be selected from first to last,
// and will stick to the selected node until it is failed.
func FIFOStrategy[T any]() selector.Strategy[T] {
	return &fifoStrategy[T]{}
}

// Apply applies the fifo strategy for the nodes.
func (s *fifoStrategy[T]) Apply(ctx context.Context, vs ...T) (v T) {
	if len(vs) == 0 {
		return
	}
	return vs[0]
}

type hashStrategy[T any] struct {
	r  *rand.Rand
	mu sync.Mutex
}

func HashStrategy[T any]() selector.Strategy[T] {
	return &hashStrategy[T]{
		r: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *hashStrategy[T]) Apply(ctx context.Context, vs ...T) (v T) {
	if len(vs) == 0 {
		return
	}
	if h := ctxvalue.HashFromContext(ctx); h != nil {
		value := uint64(crc32.ChecksumIEEE([]byte(h.Source)))
		logger.Default().Tracef("hash %s %d", h.Source, value)
		return vs[value%uint64(len(vs))]
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return vs[s.r.Intn(len(vs))]
}
