/**
 * Glue between an activated payment and its receipt email.
 *
 * Kept out of the repository so the data layer has no email dependency, and out
 * of the email module so email has no payment dependency. A caller invokes this
 * only when `applyVerifiedPayment` reports `activated: true`, which happens
 * exactly once per order across the notify, return and reconciliation paths, so
 * a customer receives a single receipt no matter which path settled first.
 */

import { deliverEmailSafe } from '@/lib/email/dispatch'
import { readPaymentReceipt } from '@/lib/payments/payment-repository'
import { errorDetails, logEvent } from '@/lib/observability'

export async function sendPaymentReceipt(orderId: string) {
  try {
    const receipt = await readPaymentReceipt(orderId)
    if (!receipt) {
      logEvent('info', 'email.skipped', { kind: 'payment_receipt', reason: 'no_recipient', orderId: orderId.slice(0, 64) })
      return
    }
    await deliverEmailSafe('payment_receipt', {
      to: receipt.email,
      data: {
        name: receipt.name,
        planName: receipt.planName,
        amountGhs: receipt.amountGhs,
        credits: receipt.credits,
        orderId: receipt.orderId,
      },
    })
  } catch (error) {
    logEvent('error', 'email.payment_receipt_failed', { orderId: orderId.slice(0, 64), ...errorDetails(error) })
  }
}
