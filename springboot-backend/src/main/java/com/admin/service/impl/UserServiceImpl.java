package com.admin.service.impl;

import cloud.tianai.captcha.application.ImageCaptchaApplication;
import cloud.tianai.captcha.spring.plugins.secondary.SecondaryVerificationApplication;
import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.common.utils.GostUtil;
import com.admin.common.utils.CaptchaProviderUtil;
import com.admin.common.utils.HttpContextUtils;
import com.admin.common.utils.JwtUtil;
import com.admin.common.utils.Md5Util;
import com.admin.common.utils.NotificationUtil;
import com.admin.common.utils.TunnelResolver;
import com.admin.entity.*;
import com.admin.mapper.ForwardMapper;
import com.admin.mapper.UserMapper;
import com.admin.mapper.UserTunnelMapper;
import com.admin.service.*;
import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * <p>
 * 用户服务实现类
 * 提供用户的增删改查功能，包括用户登录、创建、更新、删除和套餐信息查询
 * 支持用户关联数据的级联删除，包括转发和Gost服务的清理
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Slf4j
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, User> implements UserService {

    // ========== 常量定义 ==========
    
    /** 用户角色常量 */
    @javax.annotation.Resource
    private com.admin.service.DemoChangeService demoChangeService;

    private static final int ADMIN_ROLE_ID = 0;        // 管理员角色ID
    private static final int DEMO_MODE_ON = 1;         // 演示模式开启：管理员角色，但只读且数据打码
    private static final int DEMO_MODE_OFF = 0;
    private static final int USER_ROLE_ID = 1;         // 普通用户角色ID
    
    /** 用户状态常量 */
    private static final int USER_STATUS_ACTIVE = 1;   // 用户启用状态
    private static final int USER_STATUS_DISABLED = 0; // 用户停用状态
    
    /** 隧道类型常量 */
    private static final int TUNNEL_TYPE_TUNNEL_FORWARD = 2; // 隧道转发类型
    
    /** 成功响应消息 */
    private static final String SUCCESS_CREATE_MSG = "用户创建成功";
    private static final String SUCCESS_UPDATE_MSG = "用户更新成功";
    private static final String SUCCESS_DELETE_MSG = "用户及关联数据删除成功";
    
    /** 错误响应消息 */
    private static final String ERROR_LOGIN_CREDENTIALS = "账号或密码错误";
    private static final String ERROR_ACCOUNT_DISABLED = "账户停用";
    private static final String ERROR_CREATE_FAILED = "用户创建失败";
    private static final String ERROR_UPDATE_FAILED = "用户更新失败";
    private static final String ERROR_DELETE_FAILED = "用户删除失败";
    private static final String ERROR_USER_NOT_FOUND = "用户不存在";
    private static final String ERROR_USERNAME_EXISTS = "用户名已存在";
    private static final String ERROR_USERNAME_TAKEN = "用户名已被其他用户使用";
    private static final String ERROR_CANNOT_DELETE_ADMIN = "不能删除管理员用户";
    private static final String ERROR_CHANGE_SELF_ADMIN = "不能取消自己的管理员权限或封禁自己";
    private static final String ERROR_LAST_ADMIN = "至少要保留一名可用的全权限管理员";
    private static final String ERROR_NEED_FULL_ADMIN = "只有全权限管理员可以操作管理员账号";
    private static final String ERROR_USER_NOT_LOGGED_IN = "用户未登录或token无效";
    private static final String ERROR_GET_PACKAGE_INFO_FAILED = "获取套餐信息失败";
    private static final String ERROR_CURRENT_PASSWORD_WRONG = "当前密码错误";
    private static final String ERROR_PASSWORD_NOT_MATCH = "新密码和确认密码不匹配";

    /** 默认账号密码 */
    private static final String DEFAULT_USERNAME = "admin";
    private static final String DEFAULT_PASSWORD = "admin";
    
    /** 登录响应字段名 */
    private static final String LOGIN_TOKEN_FIELD = "token";
    private static final String LOGIN_NAME_FIELD = "name";
    private static final String LOGIN_ROLE_ID_FIELD = "role_id";
    private static final String LOGIN_REQUIRE_PASSWORD_CHANGE_FIELD = "requirePasswordChange";

    // ========== 依赖注入 ==========
    
    @Resource
    private UserMapper userMapper;
    
    @Resource
    @Lazy
    private ForwardMapper forwardMapper;
    
    @Resource
    private UserTunnelMapper userTunnelMapper;
    
    @Resource
    @Lazy
    private TunnelService tunnelService;

    @Resource
    @Lazy
    private ForwardService forwardService;

    @Resource
    @Lazy
    private InviteCodeService inviteCodeService;
    
    @Resource
    @Lazy
    private NodeService nodeService;

    @Resource
    UserTunnelService userTunnelService;

    @Resource
    ViteConfigService viteConfigService;

    @Resource
    StatisticsFlowService statisticsFlowService;

    @Resource
    private ImageCaptchaApplication application;

    @Resource
    @Lazy
    private UserGroupService userGroupService;

    @Resource
    @Lazy
    private PackagePlanService packagePlanService;

    @Resource
    @Lazy
    private NotificationUtil notificationUtil;

    @Resource
    @Lazy
    private TunnelResolver tunnelResolver;

    // ========== 公共接口实现 ==========

    /** 登录请求的客户端 IP：优先取反向代理带来的 X-Real-IP / X-Forwarded-For，供第三方验证码校验时一起提交 */
    private String clientIp() {
        try {
            javax.servlet.http.HttpServletRequest request = HttpContextUtils.getHttpServletRequest();
            String ip = request.getHeader("X-Real-IP");
            if (StringUtils.isBlank(ip)) {
                String forwarded = request.getHeader("X-Forwarded-For");
                ip = StringUtils.isBlank(forwarded) ? null : forwarded.split(",")[0].trim();
            }
            return StringUtils.isBlank(ip) ? request.getRemoteAddr() : ip;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 用户登录
     * 验证验证码、用户名密码，检查账户状态，生成JWT令牌
     * 
     * @param loginDto 登录数据传输对象
     * @return 登录结果响应，包含令牌和用户信息
     */
    @Override
    public R login(LoginDto loginDto) {

        // 1. 验证验证码：内置验证码校验前端换来的票据，Google / Cloudflare 校验前端拿到的令牌
        int captchaMode = CaptchaProviderUtil.resolveMode(viteConfigService);
        if (captchaMode == CaptchaProviderUtil.MODE_BUILT_IN) {
            if (StringUtils.isBlank(loginDto.getCaptchaId())) return R.err("验证码校验失败");
            boolean valid = ((SecondaryVerificationApplication) application).secondaryVerification(loginDto.getCaptchaId());
            if (!valid)  return R.err("验证码校验失败");
        } else if (captchaMode == CaptchaProviderUtil.MODE_GOOGLE || captchaMode == CaptchaProviderUtil.MODE_CLOUDFLARE) {
            if (!CaptchaProviderUtil.verifyToken(viteConfigService, captchaMode, loginDto.getCaptchaToken(), clientIp())) {
                return R.err("验证码校验失败");
            }
        }



        // 2. 验证用户凭据
        LoginValidationResult validationResult = validateUserCredentials(loginDto);
        if (validationResult.isHasError()) {
            return R.err(validationResult.getErrorMessage());
        }

        // 3. 生成令牌并返回用户信息
        User user = validationResult.getUser();
        String token = JwtUtil.generateToken(user);
        
        // 4. 检查是否使用默认账号密码
        boolean requirePasswordChange = isDefaultCredentials(loginDto.getUsername(), loginDto.getPassword());
        
        return R.ok(MapUtil.builder()
                .put(LOGIN_TOKEN_FIELD, token)
                .put(LOGIN_NAME_FIELD, user.getUser())
                .put(LOGIN_ROLE_ID_FIELD, user.getRoleId())
                .put(LOGIN_REQUIRE_PASSWORD_CHANGE_FIELD, requirePasswordChange)
                .build());
    }

    /**
     * 用户自助注册
     * 检查是否允许注册、用户名唯一性、两次密码是否一致，创建普通用户
     *
     * @param registerDto 注册数据传输对象
     * @return 注册结果响应
     */
    @Override
    public R register(RegisterDto registerDto) {
        // 1. 检查站点是否开放注册（未配置时默认关闭，需管理员在网站配置中显式开启）
        ViteConfig allowRegisterConfig = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "allow_register"));
        if (allowRegisterConfig == null || !Objects.equals(allowRegisterConfig.getValue(), "true")) {
            return R.err("当前站点已关闭注册");
        }

        // 2. 校验两次密码是否一致
        if (!registerDto.getPassword().equals(registerDto.getConfirmPassword())) {
            return R.err(ERROR_PASSWORD_NOT_MATCH);
        }

        // 3. 校验用户名唯一性
        R usernameValidationResult = validateUsernameUniqueness(registerDto.getUsername(), null);
        if (usernameValidationResult.getCode() != 0) {
            return usernameValidationResult;
        }

        // 3.1 按邀请码注册策略校验邀请码：disabled-不校验，optional-填了才校验，required-必须填且有效
        ViteConfig invitePolicyConfig = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", "invite_register_policy"));
        String invitePolicy = invitePolicyConfig != null ? invitePolicyConfig.getValue() : "disabled";
        InviteCode inviteCode = null;
        if ("required".equals(invitePolicy)) {
            if (StringUtils.isBlank(registerDto.getInviteCode())) {
                return R.err("请填写邀请码");
            }
            inviteCode = inviteCodeService.validateInviteCode(registerDto.getInviteCode());
            if (inviteCode == null) {
                return R.err("邀请码无效或已用完");
            }
        } else if ("optional".equals(invitePolicy) && StringUtils.isNotBlank(registerDto.getInviteCode())) {
            inviteCode = inviteCodeService.validateInviteCode(registerDto.getInviteCode());
            if (inviteCode == null) {
                return R.err("邀请码无效或已用完");
            }
        }
        // 先扣减再建号：与本项目兑换码的既有处理方式一致（OrderServiceImpl 购买套餐时同样是先扣减兑换码次数）。
        // 原子条件更新，避免并发下同一个邀请码被多个注册请求同时用完
        if (inviteCode != null && !inviteCodeService.consumeInviteCode(inviteCode.getId())) {
            return R.err("邀请码已被使用完，请重试");
        }
        // 4. 创建普通用户，默认无套餐、无配额，需管理员或后续购买套餐后才能使用转发功能
        User user = new User();
        user.setUser(registerDto.getUsername());
        user.setPwd(Md5Util.md5(registerDto.getPassword()));
        user.setRoleId(USER_ROLE_ID);
        user.setStatus(USER_STATUS_ACTIVE);
        user.setFlow(0L);
        user.setInFlow(0L);
        user.setOutFlow(0L);
        user.setNum(0);
        user.setExpTime(System.currentTimeMillis());
        user.setFlowResetTime(0L);
        user.setWalletBalance(java.math.BigDecimal.ZERO);
        user.setAutoRenew(0);

        long currentTime = System.currentTimeMillis();
        user.setCreatedTime(currentTime);
        user.setUpdatedTime(currentTime);

        boolean result = this.save(user);
        return result ? R.ok("注册成功") : R.err(ERROR_CREATE_FAILED);
    }

    /**
     * 创建用户
     * 检查用户名唯一性，设置默认属性，加密密码
     * 
     * @param userDto 用户创建数据传输对象
     * @return 创建结果响应
     */
    @Override
    public R createUser(UserDto userDto) {
        // 1. 验证用户名唯一性
        R usernameValidationResult = validateUsernameUniqueness(userDto.getUser(), null);
        if (usernameValidationResult.getCode() != 0) {
            return usernameValidationResult;
        }
        if (Boolean.TRUE.equals(userDto.getAdmin()) && !isCurrentFullAdmin()) {
            return R.err(403, ERROR_NEED_FULL_ADMIN);
        }

        // 2. 构建用户实体并保存
        User user = buildNewUserEntity(userDto);
        boolean result = this.save(user);
        
        if (result) {
            // 3. 添加到期时间延时任务
            return R.ok(SUCCESS_CREATE_MSG);
        } else {
            return R.err(ERROR_CREATE_FAILED);
        }
    }

    /**
     * 获取所有用户（分页）
     * 支持关键字搜索，排除管理员用户，清除密码信息
     *
     * @return 分页用户列表响应
     */
    @Override
    public R getAllUsers() {
        List<User> users = this.list();
        users.forEach(user -> user.setPwd(null));
        return R.ok(users);
    }

    /**
     * 更新用户信息
     * 验证用户存在性和用户名唯一性，处理密码加密
     * 
     * @param userUpdateDto 用户更新数据传输对象
     * @return 更新结果响应
     */
    @Override
    public R updateUser(UserUpdateDto userUpdateDto) {
        // 1. 验证用户是否存在
        if (!isUserExists(userUpdateDto.getId())) {
            return R.err(ERROR_USER_NOT_FOUND);
        }

        // 2. 验证用户名唯一性
        R usernameValidationResult = validateUsernameUniqueness(userUpdateDto.getUser(), userUpdateDto.getId());
        if (usernameValidationResult.getCode() != 0) {
            return usernameValidationResult;
        }

        // 3. 验证角色变更
        User beforeUpdate = this.getById(userUpdateDto.getId());
        if (beforeUpdate == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }
        int newRoleId = resolveRoleId(beforeUpdate, userUpdateDto.getAdmin());
        int newDemoMode = resolveDemoMode(beforeUpdate, userUpdateDto.getDemoMode(), newRoleId);
        int newStatus = userUpdateDto.getStatus() != null ? userUpdateDto.getStatus() : beforeUpdate.getStatus();
        // 受限管理员只能管理普通用户，否则可以通过新建或修改管理员绕过自己的权限
        if ((newRoleId == ADMIN_ROLE_ID || Integer.valueOf(ADMIN_ROLE_ID).equals(beforeUpdate.getRoleId())) && !isCurrentFullAdmin()) {
            return R.err(403, ERROR_NEED_FULL_ADMIN);
        }
        R roleChangeResult = validateAdminKept(beforeUpdate, newRoleId, newDemoMode, newStatus);
        if (roleChangeResult.getCode() != 0) {
            return roleChangeResult;
        }

        // 4. 构建更新实体并保存
        Long oldPackageId = beforeUpdate.getPackageId();
        User updateUser = buildUpdateUserEntity(userUpdateDto);
        updateUser.setRoleId(newRoleId);
        updateUser.setDemoMode(newDemoMode);
        updateUser.setDisableReason(User.resolveDisableReason(beforeUpdate.getStatus(), beforeUpdate.getDisableReason(), newStatus));
        boolean result = this.updateById(updateUser);

        // 角色变了：两种角色能分配的页面不同，旧设置不再有意义，恢复为新角色的全部页面
        if (result && !Objects.equals(beforeUpdate.getRoleId(), newRoleId)) {
            this.update(new UpdateWrapper<User>().eq("id", userUpdateDto.getId()).set("menu_permissions", null));
        }

        // 关闭演示模式：撤销它还没恢复的改动并清掉权限，下次开启要重新分配
        if (result && isDemoRequested(beforeUpdate.getDemoMode()) && newDemoMode == DEMO_MODE_OFF) {
            demoChangeService.restore(userUpdateDto.getId());
            this.update(new UpdateWrapper<User>().eq("id", userUpdateDto.getId()).set("demo_areas", null).set("demo_restore_time", null));
        }

        // MyBatis-Plus 默认按 NOT_NULL 策略更新，updateById 遇到 null 字段会直接跳过、不会清空数据库里原有的值。
        // 到期时间允许留空表示"永不过期"，如果这次提交就是要把它清空，必须用条件更新显式把该列写成 NULL
        if (result && userUpdateDto.getExpTime() == null) {
            this.update(new UpdateWrapper<User>().eq("id", userUpdateDto.getId()).set("exp_time", null));
        }

        if (result) {
            // 套餐换了：套餐限速随之变化，把该用户名下运行中规则的限速刷新到节点
            if (userUpdateDto.getPackageId() != null && !Objects.equals(oldPackageId, userUpdateDto.getPackageId())) {
                forwardService.refreshLimitsAfterCommit(Collections.singletonList(userUpdateDto.getId().intValue()));
            }
            // 5. 处理到期时间延时任务
            return R.ok(SUCCESS_UPDATE_MSG);
        } else {
            return R.err(ERROR_UPDATE_FAILED);
        }
    }

    /**
     * 删除用户
     * 级联删除用户相关的所有数据，包括转发、Gost服务和隧道权限
     * 
     * @param id 用户ID
     * @return 删除结果响应
     */
    @Override
    public R deleteUser(Long id) {
        // 1. 验证删除条件
        User deleteTarget = this.getById(id);
        if (deleteTarget != null && Integer.valueOf(ADMIN_ROLE_ID).equals(deleteTarget.getRoleId()) && !isCurrentFullAdmin()) {
            return R.err(403, ERROR_NEED_FULL_ADMIN);
        }
        R deleteValidationResult = validateUserDeletion(id);
        if (deleteValidationResult.getCode() != 0) {
            return deleteValidationResult;
        }

        try {
            // 删除演示账号前先撤销它还没恢复的改动
            demoChangeService.restore(id);
            // 2. 级联删除用户相关数据
            deleteUserRelatedData(id);
            statisticsFlowService.remove(new QueryWrapper<StatisticsFlow>().eq("user_id", id));
            // 3. 删除用户
            boolean result = this.removeById(id);
            return result ? R.ok(SUCCESS_DELETE_MSG) : R.err(ERROR_DELETE_FAILED);
            
        } catch (Exception e) {
            e.printStackTrace();
            return R.err("删除用户时发生错误：" + e.getMessage());
        }
    }

    /**
     * 获取用户套餐信息
     * 包括用户基本信息、隧道权限详情和转发详情
     * 
     * @return 用户套餐信息响应
     */
    @Override
    public R getUserPackageInfo() {
        try {
                    // 1. 获取当前用户信息
        CurrentUserInfo currentUser = getCurrentUserInfo();
        if (currentUser.isHasError()) {
            return R.err(currentUser.getErrorMessage());
        }

            // 2. 构建套餐信息
            UserPackageDto packageDto = buildUserPackageDto(currentUser);
            
            return R.ok(packageDto);
        } catch (Exception e) {
            e.printStackTrace();
            return R.err(ERROR_GET_PACKAGE_INFO_FAILED);
        }
    }

    /**
     * 修改账号密码
     * 验证当前密码、新密码确认、用户名唯一性、更新用户账号密码
     * 
     * @param changePasswordDto 修改账号密码数据传输对象
     * @return 修改结果响应
     */
    @Override
    public R updatePassword(ChangePasswordDto changePasswordDto) {
        try {
            // 1. 获取当前用户信息
            CurrentUserInfo currentUser = getCurrentUserInfo();
            if (currentUser.isHasError()) {
                return R.err(currentUser.getErrorMessage());
            }

            // 2. 验证新密码和确认密码是否匹配
            if (!changePasswordDto.getNewPassword().equals(changePasswordDto.getConfirmPassword())) {
                return R.err(ERROR_PASSWORD_NOT_MATCH);
            }

            // 3. 验证当前密码是否正确
            User user = currentUser.getUser();
            String currentPasswordMd5 = Md5Util.md5(changePasswordDto.getCurrentPassword());
            if (!user.getPwd().equals(currentPasswordMd5)) {
                return R.err(ERROR_CURRENT_PASSWORD_WRONG);
            }

            // 4. 用户名留空表示不修改，只改密码；填了且与当前用户名不同才需要校验唯一性
            String newUsername = StringUtils.isBlank(changePasswordDto.getNewUsername())
                    ? user.getUser() : changePasswordDto.getNewUsername().trim();
            if (!user.getUser().equals(newUsername)) {
                R usernameValidationResult = validateUsernameUniqueness(newUsername, user.getId());
                if (usernameValidationResult.getCode() != 0) {
                    return usernameValidationResult;
                }
            }

            // 5. 更新用户名和密码
            User updateUser = new User();
            updateUser.setId(user.getId());
            updateUser.setUser(newUsername);
            updateUser.setPwd(Md5Util.md5(changePasswordDto.getNewPassword()));
            updateUser.setUpdatedTime(System.currentTimeMillis());
            
            boolean result = this.updateById(updateUser);
            return result ? R.ok("账号密码修改成功") : R.err(ERROR_UPDATE_FAILED);
            
        } catch (Exception e) {
            e.printStackTrace();
            return R.err("修改账号密码时发生错误：" + e.getMessage());
        }
    }

    @Override
    public R reset(ResetFlowDto resetFlowDto) {
        if (resetFlowDto.getType() == 1){ // 清零账号流量
            User user = this.getById(resetFlowDto.getId());
            if (user == null) return R.err(ERROR_USER_NOT_FOUND);
            user.setInFlow(0L);
            user.setOutFlow(0L);
            this.updateById(user);
        }else { // 清零隧道流量
            UserTunnel tunnel = userTunnelService.getById(resetFlowDto.getId());
            if (tunnel == null) return R.err("隧道不存在");
            tunnel.setInFlow(0L);
            tunnel.setOutFlow(0L);
            userTunnelService.updateById(tunnel);
        }
        return R.ok();
    }

    /**
     * 更新当前登录用户的自动续费开关
     *
     * @param autoRenew 是否开启自动续费
     * @return 更新结果响应
     */
    @Override
    public R updateAutoRenew(Boolean autoRenew) {
        CurrentUserInfo currentUser = getCurrentUserInfo();
        if (currentUser.isHasError()) {
            return R.err(currentUser.getErrorMessage());
        }

        User updateUser = new User();
        updateUser.setId(currentUser.getUser().getId());
        updateUser.setAutoRenew(Boolean.TRUE.equals(autoRenew) ? 1 : 0);
        updateUser.setUpdatedTime(System.currentTimeMillis());

        boolean result = this.updateById(updateUser);
        return result ? R.ok() : R.err(ERROR_UPDATE_FAILED);
    }

    /**
     * 个人中心「重置密码」：当前密码校验通过后，新密码留空则随机生成；用户名留空表示不修改
     * 注意：不做token失效/强制下线其他设备（当前JWT为无状态签名，暂不支持该能力）
     *
     * @param resetPasswordDto 重置密码数据传输对象
     * @return 重置结果响应，若为随机生成密码则在data中返回一次性明文，前端需展示后引导用户重新登录
     */
    @Override
    public R resetPassword(ResetPasswordDto resetPasswordDto) {
        try {
            CurrentUserInfo currentUser = getCurrentUserInfo();
            if (currentUser.isHasError()) {
                return R.err(currentUser.getErrorMessage());
            }

            User user = currentUser.getUser();
            String currentPasswordMd5 = Md5Util.md5(resetPasswordDto.getCurrentPassword());
            if (!user.getPwd().equals(currentPasswordMd5)) {
                return R.err(ERROR_CURRENT_PASSWORD_WRONG);
            }

            // 用户名留空表示不修改；填了且与当前用户名不同才需要校验唯一性
            String newUsername = StringUtils.isBlank(resetPasswordDto.getNewUsername())
                    ? user.getUser() : resetPasswordDto.getNewUsername().trim();
            if (!user.getUser().equals(newUsername)) {
                R usernameValidationResult = validateUsernameUniqueness(newUsername, user.getId());
                if (usernameValidationResult.getCode() != 0) {
                    return usernameValidationResult;
                }
            }

            boolean generated = StringUtils.isBlank(resetPasswordDto.getNewPassword());
            String newPassword = generated ? RandomUtil.randomString(10) : resetPasswordDto.getNewPassword();

            User updateUser = new User();
            updateUser.setId(user.getId());
            updateUser.setUser(newUsername);
            updateUser.setPwd(Md5Util.md5(newPassword));
            updateUser.setUpdatedTime(System.currentTimeMillis());

            boolean result = this.updateById(updateUser);
            if (!result) {
                return R.err(ERROR_UPDATE_FAILED);
            }

            if (generated) {
                Map<String, Object> data = new HashMap<>();
                data.put("generatedPassword", newPassword);
                return R.ok(data);
            }
            return R.ok();
        } catch (Exception e) {
            e.printStackTrace();
            return R.err("重置密码时发生错误：" + e.getMessage());
        }
    }

    /**
     * 更新当前登录用户的推送设置（收款信息、设备离线与恢复、自动续费结果、到期提醒、流量提醒）
     *
     * @param notifySettingsDto 推送设置数据传输对象
     * @return 更新结果响应
     */
    @Override
    public R updateNotifySettings(NotifySettingsDto notifySettingsDto) {
        CurrentUserInfo currentUser = getCurrentUserInfo();
        if (currentUser.isHasError()) {
            return R.err(currentUser.getErrorMessage());
        }

        Integer paymentMode = notifySettingsDto.getPaymentMode() != null ? notifySettingsDto.getPaymentMode() : 0;
        Integer deviceMode = notifySettingsDto.getDeviceMode() != null ? notifySettingsDto.getDeviceMode() : 0;
        Integer renewMode = notifySettingsDto.getRenewMode() != null ? notifySettingsDto.getRenewMode() : 1;
        Integer expiryMode = notifySettingsDto.getExpiryMode() != null ? notifySettingsDto.getExpiryMode() : 1;
        Integer flowMode = notifySettingsDto.getFlowMode() != null ? notifySettingsDto.getFlowMode() : 1;
        String deviceGroupsJson = (notifySettingsDto.getDeviceGroupIds() != null && !notifySettingsDto.getDeviceGroupIds().isEmpty())
                ? JSON.toJSONString(notifySettingsDto.getDeviceGroupIds())
                : null;

        boolean result = this.update(new UpdateWrapper<User>()
                .eq("id", currentUser.getUser().getId())
                .set("notify_payment_mode", paymentMode)
                .set("notify_device_mode", deviceMode)
                .set("notify_device_groups", deviceGroupsJson)
                .set("notify_renew_mode", renewMode)
                .set("notify_expiry_mode", expiryMode)
                .set("notify_flow_mode", flowMode)
                .set("updated_time", System.currentTimeMillis()));

        return result ? R.ok() : R.err(ERROR_UPDATE_FAILED);
    }

    /**
     * 生成 Telegram 绑定码，供用户在 Telegram 客户端中向机器人发送 /start 或 /bind 完成绑定
     *
     * @return 绑定码及机器人用户名（用于拼接 t.me 深链）
     */
    @Override
    public R getTelegramBindCode() {
        CurrentUserInfo currentUser = getCurrentUserInfo();
        if (currentUser.isHasError()) {
            return R.err(currentUser.getErrorMessage());
        }

        String code = RandomUtil.randomNumbers(6);
        long now = System.currentTimeMillis();

        boolean result = this.update(new UpdateWrapper<User>()
                .eq("id", currentUser.getUser().getId())
                .set("telegram_bind_code", code)
                .set("telegram_bind_time", now)
                .set("updated_time", now));
        if (!result) {
            return R.err(ERROR_UPDATE_FAILED);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("code", code);
        data.put("botUsername", getConfigValue("telegram_bot_username"));
        return R.ok(data);
    }

    /**
     * 取消 Telegram 关联
     *
     * @return 取消结果响应
     */
    @Override
    public R unbindTelegram() {
        CurrentUserInfo currentUser = getCurrentUserInfo();
        if (currentUser.isHasError()) {
            return R.err(currentUser.getErrorMessage());
        }

        boolean result = this.update(new UpdateWrapper<User>()
                .eq("id", currentUser.getUser().getId())
                .set("telegram_chat_id", null)
                .set("telegram_bind_code", null)
                .set("telegram_bind_time", null)
                .set("updated_time", System.currentTimeMillis()));

        return result ? R.ok() : R.err(ERROR_UPDATE_FAILED);
    }

    /**
     * 管理员在站点设置中发送测试消息，验证 Bot Token 与自身 Telegram 绑定是否配置正确
     *
     * @return 发送结果响应
     */
    @Override
    public R sendTelegramTestMessage() {
        CurrentUserInfo currentUser = getCurrentUserInfo();
        if (currentUser.isHasError()) {
            return R.err(currentUser.getErrorMessage());
        }

        User user = currentUser.getUser();
        if (StringUtils.isBlank(user.getTelegramChatId())) {
            return R.err("请先在个人中心绑定 Telegram 后再测试");
        }

        boolean sent = notificationUtil.sendTestMessage(user);
        return sent ? R.ok("测试消息已发送，请查看 Telegram") : R.err("发送失败，请检查 Bot Token 配置是否正确");
    }

    // ========== 私有辅助方法 ==========


    /**
     * 验证用户登录凭据
     * 
     * @param loginDto 登录数据传输对象
     * @return 登录验证结果
     */
    private LoginValidationResult validateUserCredentials(LoginDto loginDto) {
        User user = this.getOne(new QueryWrapper<User>().eq("user", loginDto.getUsername()));
        if (user == null) {
            return LoginValidationResult.error(ERROR_LOGIN_CREDENTIALS);
        }
        
        if (!user.getPwd().equals(Md5Util.md5(loginDto.getPassword()))) {
            return LoginValidationResult.error(ERROR_LOGIN_CREDENTIALS);
        }
        
        // 因到期停用的账号允许登录，否则无法自助续费；规则相关操作仍由状态和额度校验拦截
        if (user.getStatus() == USER_STATUS_DISABLED && !User.disabledByExpiry(user)) {
            return LoginValidationResult.error(ERROR_ACCOUNT_DISABLED);
        }
        
        return LoginValidationResult.success(user);
    }

    /**
     * 检查是否使用默认账号密码
     * 
     * @param username 用户名
     * @param password 密码
     * @return 是否是默认凭据
     */
    private boolean isDefaultCredentials(String username, String password) {
        return DEFAULT_USERNAME.equals(username) && DEFAULT_PASSWORD.equals(password);
    }

    /**
     * 验证用户名唯一性
     * 
     * @param username 用户名
     * @param excludeUserId 排除的用户ID（用于更新时排除自己）
     * @return 验证结果响应
     */
    private R validateUsernameUniqueness(String username, Long excludeUserId) {
        QueryWrapper<User> queryWrapper = new QueryWrapper<User>().eq("user", username);
        if (excludeUserId != null) {
            queryWrapper.ne("id", excludeUserId);
        }
        
        User existUser = this.getOne(queryWrapper);
        if (existUser != null) {
            String errorMsg = excludeUserId != null ? ERROR_USERNAME_TAKEN : ERROR_USERNAME_EXISTS;
            return R.err(errorMsg);
        }
        
        return R.ok();
    }

    /**
     * 构建新用户实体对象
     * 
     * @param userDto 用户创建DTO
     * @return 构建完成的用户对象
     */
    private User buildNewUserEntity(UserDto userDto) {
        User user = new User();
        BeanUtils.copyProperties(userDto, user);
        user.setFlowResetClock(normalizeResetClock(userDto.getFlowResetClock()));
        
        // 设置加密密码
        user.setPwd(Md5Util.md5(userDto.getPwd()));
        
        // 设置默认属性
        user.setStatus(userDto.getStatus() != null ? userDto.getStatus() : USER_STATUS_ACTIVE);
        user.setDisableReason(User.resolveDisableReason(USER_STATUS_ACTIVE, User.DISABLE_REASON_NONE, user.getStatus()));
        user.setDemoMode(Boolean.TRUE.equals(userDto.getAdmin()) && isDemoRequested(userDto.getDemoMode()) ? DEMO_MODE_ON : DEMO_MODE_OFF);
        user.setRoleId(Boolean.TRUE.equals(userDto.getAdmin()) ? ADMIN_ROLE_ID : USER_ROLE_ID);
        
        // 设置时间戳
        long currentTime = System.currentTimeMillis();
        user.setCreatedTime(currentTime);
        user.setUpdatedTime(currentTime);
        
        return user;
    }

    private static boolean isDemoRequested(Integer demoMode) {
        return Integer.valueOf(DEMO_MODE_ON).equals(demoMode);
    }

    /** 编辑后的演示模式：只有管理员才能开启，不是管理员时一定关闭。只改部分字段的调用（如更换套餐）不传，保持原样 */
    static int resolveDemoMode(User target, Integer demoMode, int newRoleId) {
        if (newRoleId != ADMIN_ROLE_ID) {
            return DEMO_MODE_OFF;
        }
        Integer effective = demoMode != null ? demoMode : target.getDemoMode();
        return isDemoRequested(effective) ? DEMO_MODE_ON : DEMO_MODE_OFF;
    }

    /** 编辑后的角色，只由管理员开关决定，和演示模式无关；不传时保持原样 */
    static int resolveRoleId(User target, Boolean admin) {
        if (admin == null) {
            return target.getRoleId();
        }
        return admin ? ADMIN_ROLE_ID : USER_ROLE_ID;
    }

    private boolean isCurrentFullAdmin() {
        User me = this.getById(JwtUtil.getUserIdFromToken());
        return me != null && Integer.valueOf(ADMIN_ROLE_ID).equals(me.getRoleId()) && me.getMenuPermissions() == null;
    }

    /** 不能让自己失去管理员权限，也不能让系统里没有可用的管理员，否则再也进不了后台 */
    private R validateAdminKept(User target, int newRoleId, int newDemoMode, int newStatus) {
        boolean wasActiveAdmin = isRealAdmin(target) && target.getMenuPermissions() == null
                && !Integer.valueOf(USER_STATUS_DISABLED).equals(target.getStatus());
        boolean willBeActiveAdmin = newRoleId == ADMIN_ROLE_ID && newDemoMode == DEMO_MODE_OFF && newStatus != USER_STATUS_DISABLED;
        if (!wasActiveAdmin || willBeActiveAdmin) {
            return R.ok();
        }
        if (target.getId().intValue() == JwtUtil.getUserIdFromToken()) {
            return R.err(ERROR_CHANGE_SELF_ADMIN);
        }
        long otherAdmins = this.count(new QueryWrapper<User>()
                .eq("role_id", ADMIN_ROLE_ID).eq("demo_mode", DEMO_MODE_OFF)
                .ne("status", USER_STATUS_DISABLED).ne("id", target.getId()).isNull("menu_permissions"));
        return otherAdmins > 0 ? R.ok() : R.err(ERROR_LAST_ADMIN);
    }

    /** 真管理员：管理员角色且不是演示账号。不能被删除，要先取消管理员 */
    private static boolean isRealAdmin(User user) {
        return user.getRoleId() != null && user.getRoleId() == ADMIN_ROLE_ID
                && !Integer.valueOf(DEMO_MODE_ON).equals(user.getDemoMode());
    }

    /**
     * 检查用户是否存在
     * 
     * @param userId 用户ID
     * @return 用户是否存在
     */
    private boolean isUserExists(Long userId) {
        return this.getById(userId) != null;
    }

    /** 流量重置时刻留空时按 00:00（每月重置日 0 点整）处理 */
    private String normalizeResetClock(String clock) {
        return StrUtil.isBlank(clock) ? "00:00" : clock.trim();
    }

    /**
     * 构建用户更新实体对象
     * 
     * @param userUpdateDto 用户更新DTO
     * @return 构建完成的更新对象
     */
    private User buildUpdateUserEntity(UserUpdateDto userUpdateDto) {
        User user = new User();
        BeanUtils.copyProperties(userUpdateDto, user);
        // 列是 NOT NULL DEFAULT '00:00'，且 updateById 会跳过 null，所以留空时显式写成 00:00，保证能把自定义时刻改回默认
        user.setFlowResetClock(normalizeResetClock(userUpdateDto.getFlowResetClock()));
        
        // 处理密码更新
        if (StrUtil.isNotBlank(userUpdateDto.getPwd())) {
            user.setPwd(Md5Util.md5(userUpdateDto.getPwd()));
        } else {
            user.setPwd(null); // 不更新密码字段
        }
        
        // 设置更新时间
        user.setUpdatedTime(System.currentTimeMillis());
        
        return user;
    }

    /**
     * 验证用户删除条件
     * 
     * @param userId 用户ID
     * @return 验证结果响应
     */
    private R validateUserDeletion(Long userId) {
        User user = this.getById(userId);
        if (user == null) {
            return R.err(ERROR_USER_NOT_FOUND);
        }

        if (isRealAdmin(user)) {
            return R.err(ERROR_CANNOT_DELETE_ADMIN);
        }

        return R.ok();
    }

    /**
     * 删除用户相关的所有数据
     * 
     * @param userId 用户ID
     */
    private void deleteUserRelatedData(Long userId) {
        // 1. 删除用户的所有转发和对应的Gost服务
        deleteUserForwardsAndGostServices(userId);
        
        // 2. 删除用户隧道权限
        deleteUserTunnelPermissions(userId);
    }

    /**
     * 删除用户转发和对应的Gost服务
     * 
     * @param userId 用户ID
     */
    private void deleteUserForwardsAndGostServices(Long userId) {
        QueryWrapper<Forward> forwardQuery = new QueryWrapper<>();
        forwardQuery.eq("user_id", userId);
        List<Forward> userForwards = forwardMapper.selectList(forwardQuery);
        
        for (Forward forward : userForwards) {
            try {
                // 删除Gost服务
                deleteGostServicesForForward(forward, userId);
            } catch (Exception e) {
                // 记录错误但继续删除，避免因为Gost服务删除失败而阻断用户删除
                System.err.println("删除用户转发对应的Gost服务失败，转发ID: " + forward.getId() + ", 错误: " + e.getMessage());
            }
            
            // 删除数据库中的转发记录
            forwardMapper.deleteById(forward.getId());
        }
    }

    /**
     * 删除转发对应的Gost服务
     * 
     * @param forward 转发对象
     * @param userId 用户ID
     */
    private void deleteGostServicesForForward(Forward forward, Long userId) {
        Tunnel tunnel = tunnelResolver.resolveTunnel(forward);
        if (tunnel == null) return;

        Node inNode = nodeService.getNodeById(tunnel.getInNodeId());
        if (inNode == null) return;

        // 获取用户隧道关系
        UserTunnel userTunnel = tunnelResolver.resolveUserTunnel(forward.getUserId(), forward);
        if (userTunnel == null) return;

        String serviceName = buildServiceName(forward.getId(), userId, userTunnel.getId());

        // 删除主服务
        GostUtil.DeleteService(inNode.getId(), serviceName);

        // 清理连接数/IP限制器（如果存在，忽略不存在的错误）
        if ((forward.getConnLimit() != null && forward.getConnLimit() > 0)
                || (forward.getIpLimit() != null && forward.getIpLimit() > 0)) {
            GostUtil.DeleteCLimiters(inNode.getId(), forward.getId());
        }

        // 如果是隧道转发，还需要删除链和远程服务
        if (tunnel.getType() == TUNNEL_TYPE_TUNNEL_FORWARD) {
            deleteGostTunnelForwardServices(tunnel, serviceName, inNode);
        }
    }

    /**
     * 删除隧道转发相关的Gost服务
     * 
     * @param tunnel 隧道对象
     * @param serviceName 服务名称
     * @param inNode 入口节点
     */
    private void deleteGostTunnelForwardServices(Tunnel tunnel, String serviceName, Node inNode) {
        Node outNode = nodeService.getNodeById(tunnel.getOutNodeId());
        if (outNode != null) {
            GostUtil.DeleteChains(inNode.getId(), serviceName);
            GostUtil.DeleteRemoteService(outNode.getId(), serviceName);
        }
    }

    /**
     * 构建服务名称
     * 
     * @param forwardId 转发ID
     * @param userId 用户ID
     * @param userTunnelId 用户隧道ID
     * @return 服务名称
     */
    private String buildServiceName(Long forwardId, Long userId, Integer userTunnelId) {
        return forwardId + "_" + userId + "_" + userTunnelId;
    }


    /**
     * 删除用户隧道权限
     * 
     * @param userId 用户ID
     */
    private void deleteUserTunnelPermissions(Long userId) {
        QueryWrapper<UserTunnel> userTunnelQuery = new QueryWrapper<>();
        userTunnelQuery.eq("user_id", userId);
        userTunnelMapper.delete(userTunnelQuery);
    }

    /**
     * 获取当前用户信息
     * 
     * @return 当前用户信息结果
     */
    private CurrentUserInfo getCurrentUserInfo() {
        Integer userId = JwtUtil.getUserIdFromToken();
        Integer roleId = JwtUtil.getRoleIdFromToken();
        
        if (userId == null) {
            return CurrentUserInfo.error(ERROR_USER_NOT_LOGGED_IN);
        }
        
        User user = this.getById(userId);
        if (user == null) {
            return CurrentUserInfo.error(ERROR_USER_NOT_FOUND);
        }
        
        return CurrentUserInfo.success(user, roleId);
    }

    /**
     * 构建用户套餐信息DTO
     * 
     * @param currentUser 当前用户信息
     * @return 用户套餐信息DTO
     */
    private UserPackageDto buildUserPackageDto(CurrentUserInfo currentUser) {
        User user = currentUser.getUser();
        Integer roleId = currentUser.getRoleId();
        
        // 1. 构造用户基本信息
        UserPackageDto.UserInfoDto userInfo = buildUserInfoDto(user);
        
        // 2. 获取隧道权限详情
        List<UserPackageDto.UserTunnelDetailDto> tunnelPermissions = getTunnelPermissions(user.getId());
        
        // 3. 获取转发详情
        List<UserPackageDto.UserForwardDetailDto> forwards = userMapper.getUserForwardDetails(user.getId().intValue());

        // 4. 查询最近24小时流量信息，没有的补0
        List<StatisticsFlow> statisticsFlows = getLast24HoursFlowStatistics(user.getId());
        
        // 5. 构造返回结果
        UserPackageDto packageDto = new UserPackageDto();
        packageDto.setUserInfo(userInfo);
        packageDto.setTunnelPermissions(tunnelPermissions);
        packageDto.setForwards(forwards);
        packageDto.setStatisticsFlows(statisticsFlows);
        
        return packageDto;
    }

    /**
     * 构建用户基本信息DTO
     * 
     * @param user 用户对象
     * @return 用户基本信息DTO
     */
    private UserPackageDto.UserInfoDto buildUserInfoDto(User user) {
        UserPackageDto.UserInfoDto userInfo = new UserPackageDto.UserInfoDto();
        userInfo.setId(user.getId());
        userInfo.setUser(user.getUser());
        userInfo.setStatus(user.getStatus());
        userInfo.setFlow(user.getFlow());
        userInfo.setInFlow(user.getInFlow());
        userInfo.setOutFlow(user.getOutFlow());
        userInfo.setNum(user.getNum());
        userInfo.setExpTime(user.getExpTime());
        userInfo.setFlowResetTime(user.getFlowResetTime());
        userInfo.setFlowResetClock(user.getFlowResetClock());
        userInfo.setCreatedTime(user.getCreatedTime());
        userInfo.setUpdatedTime(user.getUpdatedTime());
        userInfo.setGroupId(user.getGroupId());
        userInfo.setPackageId(user.getPackageId());
        userInfo.setWalletBalance(user.getWalletBalance());
        userInfo.setAutoRenew(user.getAutoRenew());
        userInfo.setTelegramBound(StringUtils.isNotBlank(user.getTelegramChatId()));
        userInfo.setTelegramChatId(user.getTelegramChatId());
        userInfo.setNotifyPaymentMode(user.getNotifyPaymentMode() != null ? user.getNotifyPaymentMode() : 0);
        userInfo.setNotifyDeviceMode(user.getNotifyDeviceMode() != null ? user.getNotifyDeviceMode() : 0);
        userInfo.setNotifyDeviceGroupIds(parseDeviceGroupIds(user.getNotifyDeviceGroups()));
        userInfo.setNotifyRenewMode(user.getNotifyRenewMode() != null ? user.getNotifyRenewMode() : 1);
        userInfo.setNotifyExpiryMode(user.getNotifyExpiryMode() != null ? user.getNotifyExpiryMode() : 1);
        userInfo.setNotifyFlowMode(user.getNotifyFlowMode() != null ? user.getNotifyFlowMode() : 1);

        if (user.getGroupId() != null) {
            UserGroup group = userGroupService.getById(user.getGroupId());
            userInfo.setGroupName(group != null ? group.getName() : null);
        }
        if (user.getPackageId() != null) {
            PackagePlan packagePlan = packagePlanService.getById(user.getPackageId());
            userInfo.setPackageName(packagePlan != null ? packagePlan.getName() : null);
        }

        return userInfo;
    }

    /**
     * 解析设备离线推送范围的JSON字符串为ID列表，解析失败或为空时返回空列表
     */
    private List<Long> parseDeviceGroupIds(String json) {
        if (StringUtils.isBlank(json)) {
            return Collections.emptyList();
        }
        try {
            return JSON.parseArray(json, Long.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    /**
     * 读取单个站点配置值（如 telegram_bot_username），不存在时返回null
     */
    private String getConfigValue(String name) {
        ViteConfig config = viteConfigService.getOne(new QueryWrapper<ViteConfig>().eq("name", name));
        return config != null ? config.getValue() : null;
    }

    /**
     * 获取隧道权限详情
     * 
     * @param userId 用户ID
     * @return 隧道权限详情列表
     */
    private List<UserPackageDto.UserTunnelDetailDto> getTunnelPermissions(Long userId) {
        return userMapper.getUserTunnelDetails(userId.intValue());
    }

    /**
     * 获取用户最近24小时的流量统计数据，没有数据的时间点补0
     * 
     * @param userId 用户ID
     * @return 最近24小时流量统计列表
     */
    private List<StatisticsFlow> getLast24HoursFlowStatistics(Long userId) {
        // 按ID倒序查最近24条记录（ID越大越新，时间就是23:00, 22:00, 21:00...这样倒序）
        List<StatisticsFlow> recentFlows = statisticsFlowService.list(
                new QueryWrapper<StatisticsFlow>()
                        .eq("user_id", userId)
                        .orderByDesc("id")
                        .last("LIMIT 24")
        );

        List<StatisticsFlow> result = new ArrayList<>(recentFlows);

        // 如果查出来的记录不足24条，需要补0和对应的时间
        if (result.size() < 24) {
            // 获取最早记录的时间，继续往前推
            int startHour = getCurrentHour();
            if (!result.isEmpty()) {
                // 从最后一条记录的时间继续往前推
                String lastTime = result.get(result.size() - 1).getTime();
                startHour = parseHour(lastTime) - 1;
            }

            // 补0到24条
            while (result.size() < 24) {
                if (startHour < 0) startHour = 23; // 跨天处理

                StatisticsFlow emptyFlow = new StatisticsFlow();
                emptyFlow.setUserId(userId);
                emptyFlow.setFlow(0L);
                emptyFlow.setTotalFlow(0L);
                emptyFlow.setTime(String.format("%02d:00", startHour));
                result.add(emptyFlow);

                startHour--;
            }
        }

        log.info("用户 {} 获取到 {} 条实际记录，补齐为 {} 条24小时记录", userId, recentFlows.size(), result.size());
        return result;

    }

    /**
     * 获取当前小时（0-23）
     */
    private int getCurrentHour() {
        return java.time.LocalDateTime.now().getHour();
    }

    /**
     * 解析时间字符串获取小时数
     */
    private int parseHour(String timeStr) {
        try {
            if (timeStr != null && timeStr.contains(":")) {
                return Integer.parseInt(timeStr.split(":")[0]);
            }
        } catch (Exception e) {
            // 解析失败，返回当前小时
        }
        return getCurrentHour();
    }


    // ========== 内部数据类 ==========

    /**
     * 登录验证结果封装类
     */
    @Data
    private static class LoginValidationResult {
        private final boolean hasError;
        private final String errorMessage;
        private final User user;

        private LoginValidationResult(boolean hasError, String errorMessage, User user) {
            this.hasError = hasError;
            this.errorMessage = errorMessage;
            this.user = user;
        }

        public static LoginValidationResult success(User user) {
            return new LoginValidationResult(false, null, user);
        }

        public static LoginValidationResult error(String errorMessage) {
            return new LoginValidationResult(true, errorMessage, null);
        }
    }

    /**
     * 当前用户信息封装类
     */
    @Data
    private static class CurrentUserInfo {
        private final boolean hasError;
        private final String errorMessage;
        private final User user;
        private final Integer roleId;

        private CurrentUserInfo(boolean hasError, String errorMessage, User user, Integer roleId) {
            this.hasError = hasError;
            this.errorMessage = errorMessage;
            this.user = user;
            this.roleId = roleId;
        }

        public static CurrentUserInfo success(User user, Integer roleId) {
            return new CurrentUserInfo(false, null, user, roleId);
        }

        public static CurrentUserInfo error(String errorMessage) {
            return new CurrentUserInfo(true, errorMessage, null, null);
        }
    }
}
