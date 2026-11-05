package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.ForwardDto;
import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.service.ForwardService;
import com.admin.service.UserDailyRawFlowService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * <p>
 *  前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/forward")
public class ForwardController extends BaseController {

    @Autowired
    private ForwardService forwardService;

    @Autowired
    private UserDailyRawFlowService userDailyRawFlowService;

    @LogAnnotation
    @PostMapping("/create")
    public R create(@Validated @RequestBody ForwardDto forwardDto) {
        return forwardService.createForward(forwardDto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R readAll() {
        return forwardService.getAllForwards();
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@Validated @RequestBody ForwardUpdateDto forwardUpdateDto) {
        return forwardService.updateForward(forwardUpdateDto);
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.deleteForward(id);
    }

    @LogAnnotation
    @PostMapping("/forceDelete")
    public R forceDelete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.forceDeleteForward(id);
    }

    @LogAnnotation
    @PostMapping("/pause")
    public R pause(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.pauseForward(id);
    }

    @LogAnnotation
    @PostMapping("/resume")
    public R resume(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.resumeForward(id);
    }

    /**
     * 转发诊断功能
     * @param params 包含forwardId的参数
     * @return 诊断结果
     */
    @LogAnnotation
    @PostMapping("/diagnose")
    public R diagnoseForward(@RequestBody Map<String, Object> params) {
        Long forwardId = Long.valueOf(params.get("forwardId").toString());
        return forwardService.diagnoseForward(forwardId);
    }

    /**
     * 诊断详情：点开某一段的详细结果时，只对这一段重新测试（次数取站点设置里的「诊断详情连接次数」）
     * @param params 包含 forwardId、leg（inbound/outbound）、targetIp、targetPort
     */
    @LogAnnotation
    @PostMapping("/diagnoseDetail")
    public R diagnoseForwardDetail(@RequestBody Map<String, Object> params) {
        Long forwardId = Long.valueOf(params.get("forwardId").toString());
        String leg = params.get("leg") != null ? params.get("leg").toString() : null;
        String targetIp = params.get("targetIp") != null ? params.get("targetIp").toString() : null;
        Integer targetPort = params.get("targetPort") != null ? Integer.valueOf(params.get("targetPort").toString()) : null;
        return forwardService.diagnoseForwardDetail(forwardId, leg, targetIp, targetPort);
    }

    /**
     * 更新转发排序
     * @param params 包含forwards数组的参数，每个元素包含id和inx
     * @return 更新结果
     */
    @LogAnnotation
    @PostMapping("/updateOrder")
    public R updateForwardOrder(@RequestBody Map<String, Object> params) {
        return forwardService.updateForwardOrder(params);
    }

    /**
     * 转发规则页「统计数据」弹窗：今日/昨日累计流量（不计流量倍率的原始字节数）。
     * 默认查当前用户；带 userId 时查指定用户，查别人的数据仅限管理员（用户转发规则页）
     */
    @LogAnnotation
    @PostMapping("/dailyFlow")
    public R dailyFlow(@RequestBody(required = false) Map<String, Object> params) {
        Integer userId = JwtUtil.getUserIdFromToken();
        if (params != null && params.get("userId") != null) {
            Integer targetUserId = Integer.valueOf(params.get("userId").toString());
            if (!targetUserId.equals(userId) && !Integer.valueOf(0).equals(JwtUtil.getRoleIdFromToken())) {
                return R.err("无权查看该用户的统计数据");
            }
            userId = targetUserId;
        }
        long[] flows = userDailyRawFlowService.getTodayAndYesterday(userId);
        Map<String, Object> data = new HashMap<>();
        data.put("todayFlow", flows[0]);
        data.put("yesterdayFlow", flows[1]);
        return R.ok(data);
    }

}
