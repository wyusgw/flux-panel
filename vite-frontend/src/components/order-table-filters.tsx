import { useMemo, useState } from "react";
import { HeaderCell, TableHeaderFilter } from "@/components/table-header-filter";

interface FilterableOrder {
  orderNo: string;
  info: string;
  amount: number;
  type: string;
  orderStatus: number;
  userId?: number;
  userName?: string;
}

const EMPTY_TEXT = { orderNo: '', user: '', info: '', amount: '' };

/** 我的订单、订单管理共用的表头筛选 */
export function useOrderTableFilters<T extends FilterableOrder>(
  orders: T[],
  typeText: (type: string) => string,
  statuses: { status: number; text: string }[],
  onChange: () => void,
) {
  const [text, setText] = useState(EMPTY_TEXT);
  const [types, setTypes] = useState<string[]>([]);
  const [statusValues, setStatusValues] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const has = (value: unknown, keyword: string) => !keyword.trim() || String(value ?? '').toLowerCase().includes(keyword.trim().toLowerCase());
    return orders.filter(order =>
      has(order.orderNo, text.orderNo) &&
      has(order.userName || `#${order.userId}`, text.user) &&
      has(order.info, text.info) &&
      has(order.amount, text.amount) &&
      (types.length === 0 || types.includes(order.type)) &&
      (statusValues.length === 0 || statusValues.includes(String(order.orderStatus)))
    );
  }, [orders, text, types, statusValues]);

  const typeOptions = useMemo(
    () => Array.from(new Set(orders.map(order => order.type))).map(type => ({ value: type, label: typeText(type) })),
    [orders, typeText]
  );

  const textHeader = (label: string, key: keyof typeof EMPTY_TEXT) => (
    <HeaderCell label={label}>
      <TableHeaderFilter
        type="text"
        label={label}
        text={text[key]}
        onTextChange={(value) => { setText(prev => ({ ...prev, [key]: value })); onChange(); }}
        onClear={() => { setText(prev => ({ ...prev, [key]: '' })); onChange(); }}
      />
    </HeaderCell>
  );

  return {
    filtered,
    headers: {
      orderNo: textHeader('订单号', 'orderNo'),
      user: textHeader('用户', 'user'),
      info: textHeader('订单信息', 'info'),
      amount: textHeader('金额', 'amount'),
      type: (
        <HeaderCell label="类型">
          <TableHeaderFilter
            type="options"
            label="类型"
            options={typeOptions}
            selected={types}
            onSelectedChange={(values) => { setTypes(values); onChange(); }}
            onClear={() => { setTypes([]); onChange(); }}
          />
        </HeaderCell>
      ),
      status: (
        <HeaderCell label="状态">
          <TableHeaderFilter
            type="options"
            label="状态"
            options={statuses.map(item => ({ value: String(item.status), label: item.text }))}
            selected={statusValues}
            onSelectedChange={(values) => { setStatusValues(values); onChange(); }}
            onClear={() => { setStatusValues([]); onChange(); }}
          />
        </HeaderCell>
      ),
    },
  };
}
