import { ExclamationCircleFilled, InfoCircleFilled, TagsOutlined } from "@/components/ant-icons";
import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import toast from 'react-hot-toast';

import { getPackagePlanList, purchasePackage, getUserPackageInfo, redeemPackageCode, createRechargeOrder, getRechargeOrderStatus } from "@/api";
import { getCachedConfigs } from "@/config/site";
import { EmptyState } from "@/components/empty-state";

interface PackagePlanItem {
  id: number;
  name: string;
  traffic: number;
  durationDays: number;
  maxRules: number;
  price: number;
}

interface PaymentChannel {
  id: string;
  name: string;
  type: 'epay' | 'epusdt' | 'tokenpay' | 'cryptomus' | 'alipayf2f' | 'wechatnative';
  enabled: boolean;
  payTypes?: string[];
  feeRate?: string | number;
}

const SUPPORTED_CHANNEL_TYPES: string[] = ['epay', 'epusdt', 'tokenpay', 'cryptomus', 'alipayf2f', 'wechatnative'];

const PAY_TYPE_NAMES: Record<string, string> = {
  alipay: '支付宝',
  wxpay: '微信支付',
  qqpay: 'QQ钱包'
};

/** 渠道可选的付款方式，旧配置没有 payTypes 时默认支付宝 */
const payTypesOf = (channel: PaymentChannel) =>
  channel.type !== 'epay' ? [''] : (channel.payTypes ?? ['alipay']).filter(type => PAY_TYPE_NAMES[type]);

const feeRateOf = (channel: PaymentChannel) => {
  const rate = Number(channel.feeRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
};

/** 与后端一致：手续费 = 金额 × 费率%，四舍五入到分 */
const payAmountOf = (amount: number, rate: number) => {
  const cents = Math.round(amount * 100);
  return (cents + Math.round(cents * rate / 100)) / 100;
};

const PAYMENT_TYPE_LABELS: Record<PaymentChannel['type'], string> = {
  epay: 'EPay',
  epusdt: 'EPUSDT',
  tokenpay: 'TokenPay',
  cryptomus: 'Cryptomus',
  alipayf2f: '支付宝当面付',
  wechatnative: '微信支付'
};

const NoPaymentIcon = () => (
  <svg width="105" height="102" viewBox="31 8 105 102" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="no-payment-shadow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#939395" />
        <stop offset="1" stopColor="#5f5f60" />
      </linearGradient>
    </defs>
    <ellipse cx="75.700" cy="101.700" rx="44.700" ry="7.700" fill="url(#no-payment-shadow)" />
    <path d="M51 64 40 76h71.500l-11-12H51Z" fill="#7e848b" />
    <path d="M51 31.500a1.500 1.500 0 0 1 1.500-1.500h46.600a1.500 1.500 0 0 1 1.500 1.500V76H51V31.500Z" fill="#aeaeb0" />
    <rect x="58" y="37.500" width="36" height="18.500" rx="1" fill="#9da0a4" />
    <rect x="58" y="63.400" width="36" height="2.500" rx="1.250" fill="#9da0a4" />
    <rect x="58" y="71" width="36" height="2.500" rx="1.250" fill="#9da0a4" />
    <path d="M40 76h71.500v23.500a3 3 0 0 1-3 3H43a3 3 0 0 1-3-3V76Z" fill="#9da0a4" />
    <path d="M60 76h31.400c-.3 3.500-1.800 7-4 7H64c-2.200 0-3.700-3.500-4-7Z" fill="#a7a7aa" />
    <path d="M121.500 9.500c8.300 0 15 5.400 15 12s-6.700 12-15 12c-3 0-5.800-.7-8.100-1.900L108 34l1.400-6.200c-1.800-1.800-2.900-3.900-2.900-6.300 0-6.600 6.700-12 15-12Z" fill="#9da0a4" />
    <path d="m115.500 19.700 1.900 3.300h-3.800l1.900-3.300Z" fill="#aeaeb0" />
    <rect x="119.800" y="19.800" width="3.200" height="3.200" fill="#aeaeb0" />
    <circle cx="127.700" cy="21.400" r="1.700" fill="#aeaeb0" />
  </svg>
);

const planTypeLabel = (durationDays: number) => {
  if (durationDays <= 0) return '永久';
  if (durationDays % 365 === 0) return `${durationDays / 365} 年付`;
  if (durationDays % 30 === 0) return `${durationDays / 30} 月付`;
  return `${durationDays} 天`;
};

const TagIcon = () => (
  <TagsOutlined className="w-4 h-4 text-default-600 flex-shrink-0" />
);

const WarningIcon = () => (
  <ExclamationCircleFilled className="w-4 h-4 text-warning" />
);

const InfoIcon = () => (
  <InfoCircleFilled className="w-5 h-5 text-primary" />
);

export default function ShopPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PackagePlanItem[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  const [rechargeAmount, setRechargeAmount] = useState('100.00');
  const [rechargeLoadingKey, setRechargeLoadingKey] = useState<string | null>(null);
  const [minRechargeAmount, setMinRechargeAmount] = useState(0);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);

  const [redeemInput, setRedeemInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const [planToPurchase, setPlanToPurchase] = useState<PackagePlanItem | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  // 支付宝当面付：展示收款码并轮询订单状态
  const [qrPay, setQrPay] = useState<{ orderNo: string; code: string; payAmount: number; wechat: boolean } | null>(null);
  const [qrPaid, setQrPaid] = useState(false);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopQrPoll = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
  };

  useEffect(() => stopQrPoll, []);

  useEffect(() => {
    stopQrPoll();
    if (!qrPay || qrPaid) return;
    const startedAt = Date.now();
    qrPollRef.current = setInterval(async () => {
      // 支付宝收款码默认 2 小时内有效，超过 30 分钟不再自动查询，用户可手动刷新
      if (Date.now() - startedAt > 30 * 60 * 1000) {
        stopQrPoll();
        return;
      }
      try {
        const res = await getRechargeOrderStatus(qrPay.orderNo);
        if (res.code === 0 && res.data?.orderStatus === 1) {
          stopQrPoll();
          setQrPaid(true);
          toast.success('充值成功');
          loadData();
        }
      } catch (error) {
        // 网络抖动时下次再查
      }
    }, 3000);
    return stopQrPoll;
  }, [qrPay, qrPaid]);
  const [purchasedPlanName, setPurchasedPlanName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansRes, userRes, configs] = await Promise.all([
        getPackagePlanList(),
        getUserPackageInfo(),
        getCachedConfigs()
      ]);

      if (plansRes.code === 0) {
        setPlans(plansRes.data || []);
      } else {
        toast.error(plansRes.msg || '获取套餐失败');
      }

      if (userRes.code === 0 && userRes.data?.userInfo) {
        setWalletBalance(userRes.data.userInfo.walletBalance ?? 0);
      }

      setMinRechargeAmount(Number(configs.payment_min_amount) || 0);
      try {
        const channels = JSON.parse(configs.payment_config_json || '[]');
        // 只显示已接入的类型，后台旧配置里不支持的类型即使启用了也不显示
        setPaymentChannels(Array.isArray(channels)
          ? channels.filter((channel: PaymentChannel) => channel.enabled && SUPPORTED_CHANNEL_TYPES.includes(channel.type))
          : []);
      } catch (error) {
        setPaymentChannels([]);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRecharge = async (channel: PaymentChannel, payType: string) => {
    const amount = parseFloat(rechargeAmount);
    if (!amount || amount <= 0) {
      toast.error('请输入有效的充值金额');
      return;
    }
    if (amount < minRechargeAmount) {
      toast.error(`充值金额不能低于最小充值金额 ${minRechargeAmount} 元`);
      return;
    }

    setRechargeLoadingKey(`${channel.id}:${payType}`);
    try {
      const res = await createRechargeOrder(amount, channel.id, payType || undefined);
      if (res.code === 0 && res.data?.payUrl && res.data?.qrCode) {
        setQrPaid(false);
        setQrPay({ orderNo: res.data.orderNo, code: res.data.payUrl, payAmount: Number(res.data.payAmount ?? amount), wechat: channel.type === 'wechatnative' });
      } else if (res.code === 0 && res.data?.payUrl) {
        window.location.href = res.data.payUrl;
      } else {
        toast.error(res.msg || '创建充值订单失败');
      }
    } catch (error) {
      toast.error('创建充值订单失败');
    } finally {
      setRechargeLoadingKey(null);
    }
  };

  const handleRedeem = async () => {
    if (!redeemInput.trim()) {
      toast.error('请输入兑换码');
      return;
    }
    setRedeemLoading(true);
    try {
      const res = await redeemPackageCode(redeemInput.trim());
      if (res.code === 0 && res.data?.pending) {
        toast(res.msg || '订单处理中，请稍后查看');
        setRedeemInput('');
        loadData();
      } else if (res.code === 0) {
        if (res.data?.type === 'balance') {
          toast.success(`兑换成功，已到账 ${res.data.amount} 元`);
        } else {
          toast.success('兑换成功');
        }
        setRedeemInput('');
        loadData();
      } else {
        toast.error(res.msg || '兑换失败');
      }
    } catch (error) {
      toast.error('兑换失败');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleBuyClick = (plan: PackagePlanItem) => {
    setPlanToPurchase(plan);
    setOpenPopoverId(plan.id);
  };

  const confirmPurchase = async () => {
    if (!planToPurchase) return;

    setPurchaseLoading(true);
    try {
      const res = await purchasePackage(planToPurchase.id);
      if (res.code === 0 && res.data?.pending) {
        // 订单已提交但还在队列里处理，不能当作购买成功
        setOpenPopoverId(null);
        toast(res.msg || '订单处理中，请稍后查看');
        loadData();
      } else if (res.code === 0) {
        setOpenPopoverId(null);
        setPurchasedPlanName(planToPurchase.name);
        setSuccessModalOpen(true);
        loadData();
      } else {
        toast.error(res.msg || '购买失败');
      }
    } catch (error) {
      toast.error('购买失败');
    } finally {
      setPurchaseLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-default-600">正在加载...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="management-page px-4 lg:px-6 py-5 lg:py-6">
      <Card className="management-table-card mb-4">
        <CardHeader className="px-6 py-4 border-b border-default-100"><h1 className="text-base font-semibold text-foreground">我的钱包</h1></CardHeader>
        <CardBody className="p-6 gap-6">
          <p className="pt-2 text-xl font-semibold text-foreground">钱包余额: {Number(walletBalance)} 元</p>

          <div className="rounded-medium border-1 border-default-200">
            <div className="px-6 py-4 border-b border-default-200"><h2 className="text-base font-semibold text-foreground">钱包充值</h2></div>
            <div className="p-6">
          <div className="inline-flex h-8 max-w-full items-stretch rounded-small border-1 border-default-300 text-sm">
            <label htmlFor="recharge-amount" className="flex items-center whitespace-nowrap rounded-l-small border-r-1 border-default-300 bg-default-100 px-3 text-foreground">充值金额</label>
            <input
              id="recharge-amount"
              type="number"
              autoComplete="off"
              value={rechargeAmount}
              onChange={(e) => setRechargeAmount(e.target.value)}
              className="w-44 min-w-0 bg-transparent px-3 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            />
            <span className="flex items-center rounded-r-small border-l-1 border-default-300 bg-default-100 px-3 text-foreground">CNY</span>
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">最小充值金额: {minRechargeAmount} 元</p>

          {paymentChannels.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {paymentChannels.flatMap((channel) => payTypesOf(channel).map((payType) => {
                const channelName = channel.name || PAYMENT_TYPE_LABELS[channel.type];
                const rate = feeRateOf(channel);
                const amount = parseFloat(rechargeAmount);
                const key = `${channel.id}:${payType}`;
                return (
                  <Button key={key} variant="bordered" className="h-auto min-h-10 py-1.5 flex-col gap-0" isLoading={rechargeLoadingKey === key} onPress={() => handleRecharge(channel, payType)}>
                    <span>{payType ? `${channelName} · ${PAY_TYPE_NAMES[payType]}` : channelName}</span>
                    {rate > 0 && (
                      <span className="text-tiny text-default-500">
                        手续费 {rate}%{amount > 0 ? `，实付 ${payAmountOf(amount, rate).toFixed(2)} 元` : ''}
                      </span>
                    )}
                  </Button>
                );
              }))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 pt-4">
              <NoPaymentIcon />
              <p className="text-sm text-foreground">站点未配置任何支付方式!</p>
            </div>
          )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="management-table-card mb-4">
        <CardHeader className="px-6 py-4 border-b border-default-100"><h2 className="text-base font-semibold text-foreground">购买套餐</h2></CardHeader>
        <CardBody className="p-6">
          {plans.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {plans.map((plan) => (
                <Card key={plan.id} className="w-full sm:w-[190px] shrink-0 shadow-none border border-default-200">
                  <CardHeader className="pb-1.5">
                    <h3 className="text-small font-semibold text-foreground">{plan.name}</h3>
                  </CardHeader>
                  <CardBody className="pt-0">
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-tiny text-default-500">类型</span>
                        <span className="text-tiny font-medium text-foreground">{planTypeLabel(plan.durationDays)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-tiny text-default-500">最大规则数</span>
                        <span className="text-tiny font-medium text-foreground">{plan.maxRules > 0 ? plan.maxRules : '不限'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-tiny text-default-500">流量</span>
                        <span className="text-tiny font-medium text-foreground">{plan.traffic > 0 ? `${plan.traffic.toFixed(2)} GiB` : '不限流量'}</span>
                      </div>
                    </div>
                    <Popover isOpen={openPopoverId === plan.id} onOpenChange={(open) => setOpenPopoverId(open ? plan.id : null)} placement="bottom-start">
                      <PopoverTrigger>
                        <Button size="sm" variant="bordered" className="w-full" onPress={() => handleBuyClick(plan)}>
                          {plan.price > 0 ? `点击购买 （${plan.price} 元）` : '免费领取'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <div className="px-4 py-3 w-[min(18rem,calc(100vw-2rem))]">
                          <div className="flex items-center gap-2 mb-2">
                            <WarningIcon />
                            <span className="font-semibold text-foreground">购买</span>
                          </div>
                          <p className="text-small text-default-600">{plan.price > 0 ? `从余额支付 ${plan.price} 元购买此套餐，请确保余额充足。` : '该套餐为免费套餐，确认后即可领取。'}</p>
                          <p className="text-small text-default-600 mt-2 font-medium">购买后将覆盖当前套餐</p>
                          <div className="flex justify-end gap-2 mt-3">
                            <Button size="sm" variant="light" onPress={() => setOpenPopoverId(null)}>取消</Button>
                            <Button size="sm" color="default" onPress={confirmPurchase} isLoading={purchaseLoading}>确定</Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </CardBody>
      </Card>

      <Card className="management-table-card">
        <CardHeader className="px-6 py-4 border-b border-default-100"><h2 className="text-base font-semibold text-foreground">兑换套餐</h2></CardHeader>
        <CardBody className="p-6">
          <p className="mt-3 mb-7 py-0.5 pl-2.5 border-l-[3px] border-default-100 text-sm text-default-600">如果您有兑换码，则可以免费或低价购买对应的套餐。</p>
          <div className="flex items-center gap-3.5">
            <Input
              size="sm"
              autoComplete="off"
              placeholder="兑换码"
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value)}
              variant="bordered"
              startContent={<TagIcon />}
              className="w-[196px]"
              classNames={{ inputWrapper: "h-8 min-h-8 border-small border-default-300 rounded-small" }}
            />
            <Button size="sm" color="primary" radius="sm" className="h-8 min-w-16 text-sm tracking-[0.2em]" onPress={handleRedeem} isLoading={redeemLoading}>兑换</Button>
          </div>
        </CardBody>
      </Card>

      <Modal isOpen={qrPay !== null} onOpenChange={(open) => { if (!open) { stopQrPoll(); setQrPay(null); } }} size="sm" placement="center" backdrop="opaque" isDismissable={false}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{qrPaid ? '充值成功' : qrPay?.wechat ? '微信扫码支付' : '支付宝扫码支付'}</ModalHeader>
              <ModalBody className="items-center gap-3">
                {qrPaid ? (
                  <p className="text-small text-default-600">已到账，当前余额 {Number(walletBalance)} 元</p>
                ) : qrPay && (
                  <>
                    <p className="text-base font-semibold text-foreground">应付 {qrPay.payAmount.toFixed(2)} 元</p>
                    <div className="rounded-medium bg-white p-3">
                      <QRCodeSVG value={qrPay.code} size={200} marginSize={0} />
                    </div>
                    <p className="text-small text-default-500 text-center">
                      {qrPay.wechat
                        ? '请使用微信扫码付款，付款后页面会自动更新。手机上可截图后在微信中识别二维码'
                        : '请使用支付宝扫码付款，付款后页面会自动更新'}
                    </p>
                    {!qrPay.wechat && (
                      <Button as="a" href={qrPay.code} size="sm" variant="bordered" className="sm:hidden">打开支付宝付款</Button>
                    )}
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                {!qrPaid && (
                  <Button size="sm" variant="bordered" onPress={async () => {
                    if (!qrPay) return;
                    const res = await getRechargeOrderStatus(qrPay.orderNo);
                    if (res.code === 0 && res.data?.orderStatus === 1) {
                      setQrPaid(true);
                      loadData();
                    } else {
                      toast('尚未收到付款，请完成支付后再试');
                    }
                  }}>我已支付</Button>
                )}
                <Button size="sm" color="primary" onPress={onClose}>{qrPaid ? '知道了' : '关闭'}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={successModalOpen} onOpenChange={setSuccessModalOpen} size="sm" placement="center" backdrop="opaque">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <InfoIcon />
                <span>购买 {purchasedPlanName} 成功</span>
              </ModalHeader>
              <ModalBody className="py-0">
                <p className="text-small text-default-600">购买成功</p>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" color="primary" onPress={onClose}>知道了</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
