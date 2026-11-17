import { SimpleGroupPage } from "@/components/simple-group-page";
import { HelpTooltip } from "@/components/help-tooltip";
import {
  getNodeGroupList,
  createUserGroup,
  getUserGroupList,
  updateUserGroup,
  deleteUserGroup,
  batchDeleteUserGroups,
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
        '可用节点组：设置后，该用户组的用户只能看到、使用节点属于所选节点组的设备组（链式出口要求每一跳的节点都在所选节点组里），节点状态页同样只显示这些节点；用户自己添加的单端隧道设备不受限制；留空表示不限制。所选节点组被删除后不会自动放开限制。',
      ]}
      extraField={{
        key: 'nodeGroupIds',
        label: <HelpTooltip content="设置后，该用户组的用户只能看到、使用节点属于所选节点组的设备组；用户自己添加的单端隧道设备不受限制；留空表示不限制">可用节点组</HelpTooltip>,
        columnLabel: '可用节点组',
        placeholder: '留空表示不限制',
        emptyText: '不限制',
        loadOptions: getNodeGroupList,
      }}
      api={{ list: getUserGroupList, create: createUserGroup, update: updateUserGroup, remove: deleteUserGroup, batchRemove: batchDeleteUserGroups, reorder: reorderUserGroups }}
    />
  );
}
