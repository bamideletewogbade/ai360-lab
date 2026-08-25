import {
  AI_COST_TARGET_RATIO,
  CREDIT_VALUE_GHS,
  FEATURE_WEIGHTS,
  FX_BUFFER_RATE,
  landedCostGhs,
  providerFeeRate,
  usdToGhs,
} from '@/lib/billing/credits'
import { BILLING_PLANS, CREDIT_TOP_UPS } from '@/lib/billing/catalog'
import type {
  AdminCreditRate,
  AdminFinance,
  AdminMediaFinanceLine,
  AdminMediaFinanceMetric,
} from '@/lib/admin/contracts'

export type AdminFinanceMediaSource = {
  mediaType: 'image' | 'video'
  settledJobs: number
  chargedJobs: number
  chargedCredits: number
  providerCharges: number
  providerCostUsd: number
}

export type AdminFinanceMediaLineSource = Omit<
  AdminMediaFinanceLine,
  'landedCostGhs' | 'referenceBilledGhs' | 'grossProfitGhs' | 'grossMarginPercent'
>

function money(value: number) {
  return Number(value.toFixed(2))
}

function precise(value: number) {
  return Number(value.toFixed(4))
}

function percentage(profit: number, revenue: number) {
  return revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : null
}

function creditRates(): AdminCreditRate[] {
  const plans: AdminCreditRate[] = BILLING_PLANS.map((plan) => {
    const free = plan.monthlyPriceGhs === 0
    const fullUseCostGhs = plan.includedCredits * CREDIT_VALUE_GHS
    const grossProfitGhs = free ? null : plan.monthlyPriceGhs - fullUseCostGhs
    return {
      id: plan.slug,
      name: plan.name,
      kind: free ? 'free' : 'plan',
      priceGhs: plan.monthlyPriceGhs,
      credits: plan.includedCredits,
      pricePerCreditGhs: free ? null : precise(plan.monthlyPriceGhs / plan.includedCredits),
      fullUseCostGhs: money(fullUseCostGhs),
      grossProfitGhs: grossProfitGhs === null ? null : money(grossProfitGhs),
      grossMarginPercent: grossProfitGhs === null ? null : percentage(grossProfitGhs, plan.monthlyPriceGhs),
    }
  })
  const topUps: AdminCreditRate[] = CREDIT_TOP_UPS.map((topUp) => {
    const fullUseCostGhs = topUp.credits * CREDIT_VALUE_GHS
    const grossProfitGhs = topUp.priceGhs - fullUseCostGhs
    return {
      id: topUp.slug,
      name: `${topUp.credits} credit top-up`,
      kind: 'top_up',
      priceGhs: topUp.priceGhs,
      credits: topUp.credits,
      pricePerCreditGhs: precise(topUp.priceGhs / topUp.credits),
      fullUseCostGhs: money(fullUseCostGhs),
      grossProfitGhs: money(grossProfitGhs),
      grossMarginPercent: percentage(grossProfitGhs, topUp.priceGhs),
    }
  })
  return [...plans, ...topUps]
}

export function buildAdminFinance(input: {
  cashCollectedGhs: number
  approvedPayments: number
  chargedCredits: number
  providerCostUsd: number
  media: AdminFinanceMediaSource[]
  recentMedia: AdminFinanceMediaLineSource[]
}): AdminFinance {
  const referencePlan = BILLING_PLANS.find((plan) => plan.slug === 'everyday') ?? BILLING_PLANS[0]
  const referenceCreditPriceGhs = referencePlan.monthlyPriceGhs / referencePlan.includedCredits
  const landedCost = landedCostGhs(input.providerCostUsd)
  const referenceBilled = input.chargedCredits * referenceCreditPriceGhs
  const grossProfit = referenceBilled - landedCost
  const cashGrossProfit = input.cashCollectedGhs - landedCost

  const media: AdminMediaFinanceMetric[] = input.media.map((item) => {
    const itemLandedCost = landedCostGhs(item.providerCostUsd)
    const itemReferenceBilled = item.chargedCredits * referenceCreditPriceGhs
    const itemGrossProfit = itemReferenceBilled - itemLandedCost
    return {
      ...item,
      averageCreditsCharged: item.settledJobs > 0 ? precise(item.chargedCredits / item.settledJobs) : 0,
      averageProviderCostUsd: item.providerCharges > 0 ? precise(item.providerCostUsd / item.providerCharges) : 0,
      landedCostGhs: money(itemLandedCost),
      averageLandedCostGhs: item.providerCharges > 0 ? money(itemLandedCost / item.providerCharges) : 0,
      referenceBilledGhs: money(itemReferenceBilled),
      grossProfitGhs: money(itemGrossProfit),
      grossMarginPercent: percentage(itemGrossProfit, itemReferenceBilled),
    }
  })
  const unitGrossProfit = referenceCreditPriceGhs - CREDIT_VALUE_GHS
  const recentMedia: AdminMediaFinanceLine[] = input.recentMedia.map((item) => {
    const itemLandedCost = landedCostGhs(item.providerCostUsd)
    const itemReferenceBilled = item.chargedCredits * referenceCreditPriceGhs
    const itemGrossProfit = itemReferenceBilled - itemLandedCost
    return {
      ...item,
      landedCostGhs: money(itemLandedCost),
      referenceBilledGhs: money(itemReferenceBilled),
      grossProfitGhs: money(itemGrossProfit),
      grossMarginPercent: percentage(itemGrossProfit, itemReferenceBilled),
    }
  })

  return {
    cashCollectedGhs: money(input.cashCollectedGhs),
    approvedPayments: input.approvedPayments,
    chargedCredits: input.chargedCredits,
    providerCostUsd: Number(input.providerCostUsd.toFixed(6)),
    landedCostGhs: money(landedCost),
    referenceBilledGhs: money(referenceBilled),
    grossProfitGhs: money(grossProfit),
    grossMarginPercent: percentage(grossProfit, referenceBilled),
    cashGrossProfitGhs: money(cashGrossProfit),
    cashGrossMarginPercent: percentage(cashGrossProfit, input.cashCollectedGhs),
    media,
    recentMedia,
    creditRates: creditRates(),
    calculation: {
      referencePlanName: referencePlan.name,
      referencePlanPriceGhs: referencePlan.monthlyPriceGhs,
      referencePlanCredits: referencePlan.includedCredits,
      referenceCreditPriceGhs: precise(referenceCreditPriceGhs),
      costBudgetPerCreditGhs: CREDIT_VALUE_GHS,
      unitGrossProfitGhs: precise(unitGrossProfit),
      unitGrossMarginPercent: percentage(unitGrossProfit, referenceCreditPriceGhs) ?? 0,
      targetProviderCostPercent: AI_COST_TARGET_RATIO * 100,
      usdToGhs: usdToGhs(),
      providerFeePercent: providerFeeRate() * 100,
      fxBufferPercent: FX_BUFFER_RATE * 100,
      imageFloorCredits: FEATURE_WEIGHTS.image.floor,
      videoFloorCredits: FEATURE_WEIGHTS.video.floor,
    },
  }
}
