import { SimpleGroupPage } from "@/components/simple-group-page";
import {
  createUserGroup,
  getUserGroupList,
  updateUserGroup,
  deleteUserGroup,
  reorderUserGroups
} from "@/api";

export default function UserGroupPage() {
  return (
    <SimpleGroupPage
      label="用户组"
      countLabel="用户数量"
      countKey="userCount"
      help={[
        '本页可以设置用户组的 ID - 名称 对应关系。也可以不命名，直接使用数字分组。',
        '用户组 #0 是最基本的用户组，代表该用户新注册，未购买套餐，不能使用转发。',
        '删除用户组不会对用户产生实际影响。',
        '用户可以看到自己所在分组的名称，如果分组未命名，则显示用户组 ID。',
      ]}
      api={{ list: getUserGroupList, create: createUserGroup, update: updateUserGroup, remove: deleteUserGroup, reorder: reorderUserGroups }}
    />
  );
}
