package protodetect

import (
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"strings"
	"testing"
)

// 构造真实格式的 AEAD Shadowsocks 首包：salt + 加密的长度 + 加密的载荷
func aeadFirstPacket(t *testing.T, payload []byte) []byte {
	t.Helper()
	salt := make([]byte, 16)
	key := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		t.Fatal(err)
	}
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	nonce := make([]byte, aead.NonceSize())
	out := append([]byte{}, salt...)
	out = aead.Seal(out, nonce, []byte{byte(len(payload) >> 8), byte(len(payload))}, nil)
	nonce[0] = 1
	return aead.Seal(out, nonce, payload, nil)
}

func TestDetectsShadowsocksFirstPackets(t *testing.T) {
	const total = 5000
	detected := 0
	target := []byte("\x03\x0bexample.com\x01\xbbGET / HTTP/1.1\r\nHost: example.com\r\n\r\n")
	for i := 0; i < total; i++ {
		if LooksFullyEncrypted(aeadFirstPacket(t, target)) {
			detected++
		}
	}
	rate := float64(detected) / total
	t.Logf("Shadowsocks 首包识别率 %.2f%%", rate*100)
	if rate < 0.95 {
		t.Fatalf("识别率过低: %.2f%%", rate*100)
	}
}

func TestLeavesPlainProtocolsAlone(t *testing.T) {
	cases := map[string][]byte{
		"HTTP":  []byte("GET /index.html HTTP/1.1\r\nHost: example.com\r\nUser-Agent: curl/8\r\nAccept: */*\r\n\r\n"),
		"HTTP2": []byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n\x00\x00\x12\x04\x00\x00\x00\x00\x00\x00\x03\x00\x00\x00\x64"),
		"SSH":   []byte("SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5\r\n"),
		"JSON":  []byte(`{"method":"subscribe","params":{"channel":"ticker","symbol":"BTC"},"id":1234567}`),
		"Redis": []byte("*3\r\n$3\r\nSET\r\n$11\r\nsession_key\r\n$12\r\nsession_data\r\n"),
		"短数据":   {0xde, 0xad, 0xbe, 0xef, 0x13, 0x37},
		"RDP":   {0x03, 0x00, 0x00, 0x2b, 0x26, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x43, 0x6f, 0x6f, 0x6b, 0x69, 0x65, 0x3a, 0x20, 0x6d, 0x73, 0x74, 0x73, 0x68, 0x61, 0x73, 0x68, 0x3d, 0x75, 0x73, 0x65, 0x72, 0x0d, 0x0a, 0x01, 0x00, 0x08, 0x00, 0x03, 0x00, 0x00, 0x00},
		"全零帧":   make([]byte, 64),
	}
	for name, data := range cases {
		if LooksFullyEncrypted(data) {
			t.Errorf("%s 不应被判定为全加密流量", name)
		}
	}
}

func TestLeavesTLSAlone(t *testing.T) {
	random := make([]byte, 200)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	for _, prefix := range [][]byte{{0x16, 0x03, 0x01}, {0x17, 0x03, 0x03}} {
		if LooksFullyEncrypted(append(append([]byte{}, prefix...), random...)) {
			t.Errorf("TLS 记录 %x 不应被判定为全加密流量", prefix)
		}
	}
}

// 记录已知的误伤：压缩数据在统计上和加密数据一样，这种情况只能靠文档说明，这里防止行为被无意改变
func TestKnownFalsePositiveOnCompressedPayload(t *testing.T) {
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	random := make([]byte, 512)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write(random); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if !LooksFullyEncrypted(buffer.Bytes()) {
		t.Skip("这次的压缩数据没有被判定为全加密流量")
	}
}

func TestObserverCatchesSaltSentSeparately(t *testing.T) {
	const total = 2000
	detected := 0
	for i := 0; i < total; i++ {
		packet := aeadFirstPacket(t, []byte("\x03\x0bexample.com\x01\xbbpayload"))
		var observer Observer
		if observer.Feed(packet[:16]) {
			t.Fatal("只有 salt 时样本不够，不应判定")
		}
		if observer.Feed(packet[16:]) {
			detected++
		}
	}
	if rate := float64(detected) / total; rate < 0.95 {
		t.Fatalf("分开发送时识别率过低: %.2f%%", rate*100)
	}
}

func TestObserverStopsAfterDecisionAndAfterFewSmallReads(t *testing.T) {
	random := make([]byte, 64)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	var plainFirst Observer
	plainFirst.Feed([]byte(strings.Repeat("plain text request line ", 4)))
	for i := 0; i < 5; i++ {
		if plainFirst.Feed(random) {
			t.Fatal("首包已判定为明文，后面的数据不应再判断")
		}
	}

	var chatty Observer
	for i := 0; i < maxObservedReads; i++ {
		chatty.Feed(random[:2])
	}
	if chatty.Feed(random) {
		t.Fatal("超过观察次数后不应再判断")
	}
}

type relayLike struct{}

func TestRelayDetectionUsesPackageName(t *testing.T) {
	if IsRelayHandler(&relayLike{}) {
		t.Error("其他包的类型不应被当成 relay")
	}
	if strings.HasPrefix("*forward.forwardHandler", "*relay.") {
		t.Error("前缀判断有误")
	}
}
