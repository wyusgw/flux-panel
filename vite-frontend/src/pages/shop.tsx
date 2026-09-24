import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import toast from 'react-hot-toast';

import { getPackagePlanList, purchasePackage, getUserPackageInfo, redeemPackageCode, createRechargeOrder } from "@/api";
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
  type: 'epay' | 'epusdt' | 'tokenpay' | 'cyber' | 'cryptomus';
  enabled: boolean;
  config?: Record<string, string>;
}

const PAYMENT_TYPE_LABELS: Record<PaymentChannel['type'], string> = {
  epay: 'EPay',
  epusdt: 'EPUSDT',
  tokenpay: 'TokenPay',
  cyber: 'Cyber',
  cryptomus: 'Cryptomus'
};

const NoPaymentIcon = () => (
  <svg className="w-16 h-16 text-default-300" viewBox="0 0 64 64" fill="currentColor">
    <path d="M12 47h40l5 9a2 2 0 01-2 3H9a2 2 0 01-2-3l5-9z" />
    <rect x="27" y="39" width="10" height="9" />
    <rect x="9" y="8" width="46" height="33" rx="5" />
    <rect x="14" y="13" width="36" height="23" rx="2" className="fill-content1" />
    <path d="M39 2a10 10 0 100 20 10.4 10.4 0 002.6-.33L48 24v-4.2A10 10 0 0039 2z" />
    <circle cx="35" cy="12" r="1.6" className="fill-content1" />
    <circle cx="39" cy="12" r="1.6" className="fill-content1" />
    <circle cx="43" cy="12" r="1.6" className="fill-content1" />
  </svg>
);

const planTypeLabel = (durationDays: number) => {
  if (durationDays <= 0) return '永久';
  if (durationDays % 365 === 0) return `${durationDays / 365} 年付`;
  if (durationDays % 30 === 0) return `${durationDays / 30} 月付`;
  return `${durationDays} 天`;
};

const TagIcon = () => (
  <svg className="w-4 h-4 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.59 13.41L11 3.83A2 2 0 009.59 3.2L4 3a1 1 0 00-1 1l.2 5.59a2 2 0 00.58 1.41l9.59 9.59a2 2 0 002.83 0l4.41-4.41a2 2 0 000-2.83z" />
    <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
  </svg>
);

const WarningIcon = () => (
  <svg className="w-4 h-4 text-warning" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.184c.75 1.334-.213 2.98-1.742 2.98H3.72c-1.53 0-2.492-1.646-1.743-2.98L8.257 3.1zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-.25-7.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" clipRule="evenodd" />
  </svg>
);

const InfoIcon = () => (
  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
  </svg>
);

export default function ShopPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PackagePlanItem[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  const [rechargeAmount, setRechargeAmount] = useState('100.00');
  const [rechargeLoadingChannelId, setRechargeLoadingChannelId] = useState<string | null>(null);
  const [minRechargeAmount, setMinRechargeAmount] = useState(0);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);

  const [redeemInput, setRedeemInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const [planToPurchase, setPlanToPurchase] = useState<PackagePlanItem | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
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
        setPaymentChannels(Array.isArray(channels) ? channels.filter((channel: PaymentChannel) => channel.enabled) : []);
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

  const handleRecharge = async (channel: PaymentChannel) => {
    const amount = parseFloat(rechargeAmount);
    if (!amount || amount <= 0) {
      toast.error('请输入有效的充值金额');
      return;
    }
    if (amount < minRechargeAmount) {
      toast.error(`充值金额不能低于最小充值金额 ${minRechargeAmount} 元`);
      return;
    }

    setRechargeLoadingChannelId(channel.id);
    try {
      const res = await createRechargeOrder(amount, channel.id);
      if (res.code === 0 && res.data?.payUrl) {
        window.location.href = res.data.payUrl;
      } else {
        toast.error(res.msg || '创建充值订单失败');
      }
    } catch (error) {
      toast.error('创建充值订单失败');
    } finally {
      setRechargeLoadingChannelId(null);
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
      if (res.code === 0) {
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
      if (res.code === 0) {
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
    <div className="px-3 lg:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">我的钱包</h1>
        <p className="mt-2 text-base font-semibold text-foreground">钱包余额: {walletBalance.toFixed(0)} 元</p>
      </div>

      <Card className="border border-gray-200 dark:border-default-200 shadow-md mb-6">
        <CardHeader className="pb-0"><h3 className="text-base font-semibold text-foreground">钱包充值</h3></CardHeader>
        <CardBody>
          <div className="flex items-end gap-2 max-w-sm">
            <Input
              size="sm"
              autoComplete="off"
              label="充值金额"
              type="number"
              value={rechargeAmount}
              onChange={(e) => setRechargeAmount(e.target.value)}
              variant="bordered"
              endContent={<span className="text-sm text-default-500">CNY</span>}
            />
          </div>
          <p className="mt-3 text-sm font-medium text-default-600">最小充值金额: {minRechargeAmount} 元</p>

          {paymentChannels.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {paymentChannels.map((channel) => (
                <Button key={channel.id} variant="bordered" isLoading={rechargeLoadingChannelId === channel.id} onPress={() => handleRecharge(channel)}>
                  {channel.name || PAYMENT_TYPE_LABELS[channel.type]}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <NoPaymentIcon />
              <p className="text-sm text-default-500">站点未配置任何支付方式!</p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="border border-gray-200 dark:border-default-200 shadow-md mb-6">
        <CardHeader className="pb-0"><h3 className="text-base font-semibold text-foreground">购买套餐</h3></CardHeader>
        <CardBody>
          {plans.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {plans.map((plan) => (
                <Card key={plan.id} className="w-full sm:w-[190px] shrink-0 shadow-sm border border-gray-200 dark:border-gray-700">
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
                        <span className="text-tiny font-medium text-foreground">{plan.maxRules}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-tiny text-default-500">流量</span>
                        <span className="text-tiny font-medium text-foreground">{plan.traffic.toFixed(2)} GiB</span>
                      </div>
                    </div>
                    <Popover isOpen={openPopoverId === plan.id} onOpenChange={(open) => setOpenPopoverId(open ? plan.id : null)} placement="bottom-start">
                      <PopoverTrigger>
                        <Button size="sm" variant="bordered" className="w-full" onPress={() => handleBuyClick(plan)}>
                          点击购买 （{plan.price} 元）
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <div className="px-4 py-3 w-[min(18rem,calc(100vw-2rem))]">
                          <div className="flex items-center gap-2 mb-2">
                            <WarningIcon />
                            <span className="font-semibold text-foreground">购买</span>
                          </div>
                          <p className="text-small text-default-600">从余额支付 {plan.price} 元购买此套餐，请确保余额充足。</p>
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
            <EmptyState className="py-12" />
          )}
        </CardBody>
      </Card>

      <Card className="border border-gray-200 dark:border-default-200 shadow-md">
        <CardHeader className="pb-0"><h3 className="text-base font-semibold text-foreground">兑换套餐</h3></CardHeader>
        <CardBody>
          <p className="text-sm text-default-500 mb-3">如果您有兑换码，则可以免费或低价购买对应的套餐。</p>
          <div className="flex gap-2 max-w-lg">
            <Input
              size="sm"
              autoComplete="off"
              placeholder="兑换码"
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value)}
              variant="bordered"
              startContent={<TagIcon />}
              className="flex-1"
            />
            <Button color="default" onPress={handleRedeem} isLoading={redeemLoading}>兑换</Button>
          </div>
        </CardBody>
      </Card>

      <Modal isOpen={successModalOpen} onOpenChange={setSuccessModalOpen} size="sm" placement="center" backdrop="blur">
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
                <Button color="default" onPress={onClose}>知道了</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
