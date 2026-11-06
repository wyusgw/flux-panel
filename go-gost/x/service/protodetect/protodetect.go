// Package protodetect 判断连接首包是否像 Shadowsocks 这类全加密协议。
//
// Shadowsocks 没有固定报文头，首包看起来就是随机数据，无法精确识别，只能按统计特征判断：
// 排除明显是明文或已知协议的数据，剩下的视为全加密流量。因此它分不清 Shadowsocks、VMess
// 和其他加密或压缩的自定义协议，有误伤的可能。判断规则参考 Wu et al.,
// "How the Great Firewall of China Detects and Blocks Fully Encrypted Traffic" (USENIX Security 2023)。
package protodetect

import (
	"bytes"
	"fmt"
	"math/bits"
	"strings"
)

// MinFullyEncryptedLen AEAD 模式 Shadowsocks 首包的最小长度：16 字节 salt + 2 字节长度 + 16 字节 tag。
// 更短的数据样本太少，判断不可靠，直接放行。
const MinFullyEncryptedLen = 34

var knownPrefixes = [][]byte{
	// TLS 记录：握手、应用数据、告警、ChangeCipherSpec
	{0x16, 0x03}, {0x17, 0x03}, {0x15, 0x03}, {0x14, 0x03},
	[]byte("GET "), []byte("POST "), []byte("PUT "), []byte("HEAD "), []byte("DELETE "),
	[]byte("OPTIONS "), []byte("PATCH "), []byte("CONNECT "), []byte("TRACE "), []byte("PRI * HTTP/2"),
}

func isPrintable(b byte) bool {
	return b >= 0x20 && b <= 0x7e
}

// LooksFullyEncrypted 判断首包是否像全加密流量。
func LooksFullyEncrypted(data []byte) bool {
	if len(data) < MinFullyEncryptedLen {
		return false
	}
	for _, prefix := range knownPrefixes {
		if bytes.HasPrefix(data, prefix) {
			return false
		}
	}

	// 随机数据平均每字节有 4 个比特为 1；明显偏离的是结构化的二进制协议
	setBits := 0
	printable := 0
	run := 0
	longestRun := 0
	for _, b := range data {
		setBits += bits.OnesCount8(b)
		if isPrintable(b) {
			printable++
			run++
			if run > longestRun {
				longestRun = run
			}
		} else {
			run = 0
		}
	}
	average := float64(setBits) / float64(len(data))
	if average <= 3.4 || average >= 4.6 {
		return false
	}

	// 前 6 个字节全是可打印字符：协议名、版本号一类的明文开头（如 SSH-2.0）
	firstSixPrintable := true
	for _, b := range data[:6] {
		if !isPrintable(b) {
			firstSixPrintable = false
			break
		}
	}
	if firstSixPrintable {
		return false
	}
	// 一半以上是可打印字符，或者有一段连续超过 20 个可打印字符：包含明文内容
	if printable*2 > len(data) || longestRun > 20 {
		return false
	}
	return true
}

// maxObservedReads 最多累积前几次读取。真实的 Shadowsocks 客户端常把 salt 和后续数据分开发送，
// 单看第一次读到的数据不够判断；但也不能一直累积，否则长连接里很多小的二进制包拼起来会被误判。
const maxObservedReads = 3

// Observer 累积连接最开始的数据，够长时判断一次，之后不再判断。不是并发安全的，每个连接一个。
type Observer struct {
	data  []byte
	reads int
	done  bool
}

// Feed 传入新读到的数据，返回 true 表示判定为全加密流量。
func (o *Observer) Feed(chunk []byte) bool {
	if o.done || len(chunk) == 0 {
		return false
	}
	o.reads++
	o.data = append(o.data, chunk...)
	if len(o.data) < MinFullyEncryptedLen {
		if o.reads >= maxObservedReads {
			o.done = true
			o.data = nil
		}
		return false
	}
	o.done = true
	result := LooksFullyEncrypted(o.data)
	o.data = nil
	return result
}

// IsRelayHandler 判断是否节点之间隧道使用的 relay 服务。
// 隧道连接里的 relay 报文是面板自己的二进制协议，不能按全加密判断，否则会掐断隧道；
// 用户流量已经在隧道入口的转发服务上检查过了。
func IsRelayHandler(handler interface{}) bool {
	return strings.HasPrefix(fmt.Sprintf("%T", handler), "*relay.")
}
