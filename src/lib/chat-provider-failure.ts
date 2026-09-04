export type PdfParserEngine = 'cloudflare-ai' | 'native'

export function pdfParserFallback(input: {
  hasPdf: boolean
  status: number
  engine: PdfParserEngine
}): PdfParserEngine | null {
  return input.hasPdf && input.status === 400 && input.engine === 'cloudflare-ai'
    ? 'native'
    : null
}

export function chatProviderFailure(input: {
  status: number
  hasAttachments: boolean
  hasPdf: boolean
}) {
  if (input.status === 400 && input.hasAttachments) {
    return {
      code: 'attachment_rejected',
      message: input.hasPdf
        ? 'This PDF could not be read. Re-export it as a standard, unencrypted PDF or attach a different copy.'
        : 'This attachment could not be read. Attach a different copy or remove it and try again.',
      retryable: false,
      outcome: 'attachment_error',
    } as const
  }

  return {
    code: 'provider_unavailable',
    message: 'AI360 could not reach the AI service.',
    retryable: input.status === 408 || input.status === 429 || input.status >= 500,
    outcome: 'provider_error',
  } as const
}
