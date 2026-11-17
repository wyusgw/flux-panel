import { SimpleGroupPage } from "@/components/simple-group-page";
import {
  createNodeGroup,
  getNodeGroupList,
  updateNodeGroup,
  deleteNodeGroup,
  batchDeleteNodeGroups,
  reorderNodeGroups
} from "@/api";

export default function NodeGroupPage() {
  return (
    <SimpleGroupPage
      label="节点组"
      countLabel="节点数量"
      countKey="nodeCount"
      help={[
        '本页可以设置节点组的 ID - 名称 对应关系。也可以不命名，直接使用数字分组。',
        '在设备管理里编辑设备组（未配置的设备点「补全配置」）时指定节点所属的节点组，一个节点可以同时属于多个节点组。',
        '删除节点组不会删除节点本身，只会解除节点与该组的归属关系。',
        '节点状态页会按节点组分类显示节点，没有绑定任何节点的节点组不会显示。',
        '用户组可以设置「可用节点组」：设置后，该用户组的用户只能使用节点属于这些节点组的设备组。',
      ]}
      api={{ list: getNodeGroupList, create: createNodeGroup, update: updateNodeGroup, remove: deleteNodeGroup, batchRemove: batchDeleteNodeGroups, reorder: reorderNodeGroups }}
    />
  );
}
