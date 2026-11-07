package com.admin.service;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.User;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
public interface UserService extends IService<User> {

    R login(LoginDto loginDto);

    /** 密码尝试计数用的账号标识：MySQL 比较用户名时忽略大小写、重音和末尾空格，同一账号有多种写法 */
    String loginAttemptKey(String username);

    R register(RegisterDto registerDto);

    R createUser(UserDto userDto);

    R getAllUsers();

    R updateUser(UserUpdateDto userUpdateDto);

    R deleteUser(Long id);

    R getUserPackageInfo();
    
    R updatePassword(ChangePasswordDto changePasswordDto);

    R reset(ResetFlowDto resetFlowDto);

    R updateAutoRenew(Boolean autoRenew);

    R resetPassword(ResetPasswordDto resetPasswordDto);

    R updateNotifySettings(NotifySettingsDto notifySettingsDto);

    R getTelegramBindCode();

    R unbindTelegram();

    R sendTelegramTestMessage();
}
