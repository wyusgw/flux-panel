package com.admin.common.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DemoDataMaskerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode mask(String json) throws Exception {
        return DemoDataMasker.mask(mapper.readTree(json));
    }

    @Test
    void masksNodeSecretsAndAddresses() throws Exception {
        JsonNode node = mask("{\"id\":3,\"name\":\"HK-1\",\"secret\":\"abc\",\"ip\":\"1.2.3.4\",\"serverIp\":\"2001:db8::1\",\"portSta\":1000}");
        assertEquals("***", node.get("secret").asText());
        assertEquals("***", node.get("ip").asText());
        assertEquals("***", node.get("serverIp").asText());
        assertEquals("HK-1", node.get("name").asText());
        assertEquals(1000, node.get("portSta").asInt());
    }

    @Test
    void masksUserIdentityButKeepsTypes() throws Exception {
        JsonNode user = mask("{\"id\":7,\"user\":\"alice\",\"walletBalance\":12.5,\"telegramChatId\":\"99\",\"pwd\":null,\"roleId\":1}");
        assertEquals("用户7", user.get("user").asText());
        assertEquals(0, user.get("walletBalance").asInt());
        assertEquals("***", user.get("telegramChatId").asText());
        assertEquals(true, user.get("pwd").isNull());
        assertEquals(1, user.get("roleId").asInt());
    }

    @Test
    void masksForwardsOrdersAndCodes() throws Exception {
        assertEquals("***", mask("{\"remoteAddr\":\"example.com:443\"}").get("remoteAddr").asText());
        assertEquals("用户5", mask("{\"userId\":5,\"userName\":\"bob\"}").get("userName").asText());
        assertEquals("***", mask("{\"code\":\"INVITE1\"}").get("code").asText());
        assertEquals("***", mask("{\"tradeNo\":\"T1\",\"redeemCode\":\"R\"}").get("tradeNo").asText());
        assertEquals("***", mask("{\"payload\":\"{gost config}\"}").get("payload").asText());
    }

    @Test
    void masksUserRankingNamesOnly() throws Exception {
        JsonNode stats = mask("{\"todayUserRanking\":[{\"name\":\"alice\",\"value\":5}],\"todayNodeRanking\":[{\"name\":\"HK-1\",\"value\":5}]}");
        assertEquals("***", stats.get("todayUserRanking").get(0).get("name").asText());
        assertEquals(5, stats.get("todayUserRanking").get(0).get("value").asInt());
        assertEquals("HK-1", stats.get("todayNodeRanking").get(0).get("name").asText());
    }

    @Test
    void masksIpsInsideOtherStringsAndNestedObjects() throws Exception {
        JsonNode node = mask("{\"name\":\"node 8.8.8.8 hk\",\"node\":{\"ip\":\"1.1.1.1\"},\"list\":[{\"secret\":\"x\"}]}");
        assertEquals("node *** hk", node.get("name").asText());
        assertEquals("***", node.get("node").get("ip").asText());
        assertEquals("***", node.get("list").get(0).get("secret").asText());
    }

    @Test
    void leavesClocksVersionsAndOrdinaryTextAlone() throws Exception {
        JsonNode node = mask("{\"flowResetClock\":\"00:00\",\"time\":\"12:30:45\",\"version\":\"1.2.3.4\",\"name\":\"a::b test\"}");
        assertEquals("00:00", node.get("flowResetClock").asText());
        assertEquals("12:30:45", node.get("time").asText());
        assertEquals("1.2.3.4", node.get("version").asText());
    }

    @Test
    void maskIpsHandlesRawWebSocketMessages() {
        assertEquals("{\"hostIp\":\"***\",\"cpu\":1.5}", DemoDataMasker.maskIps("{\"hostIp\":\"10.0.0.1\",\"cpu\":1.5}"));
    }
}
