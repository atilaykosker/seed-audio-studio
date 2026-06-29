import { ApiError, ValidationError } from '@fal-ai/client'

export type FalErrorKind =
  | 'auth'
  | 'rate'
  | 'validation'
  | 'safety'
  | 'network'
  | 'unknown'

export interface FriendlyError {
  kind: FalErrorKind
  title: string
  message: string
  /** Whether retrying the same request might succeed. */
  retryable: boolean
}

/** Translate any thrown fal error into a user-facing, actionable message. */
export function mapFalError(e: unknown): FriendlyError {
  if (e instanceof ValidationError) {
    const detail = e.fieldErrors?.map((f) => f.msg).join('; ') || e.message
    const isSafety = /safety|nsfw|moderat|blocked/i.test(detail)
    return isSafety
      ? {
          kind: 'safety',
          title: 'Blocked by the safety filter',
          message: 'The prompt or image was flagged. Try a different scene style or image.',
          retryable: true,
        }
      : {
          kind: 'validation',
          title: 'Invalid request',
          message: detail,
          retryable: false,
        }
  }

  if (e instanceof ApiError) {
    const status = e.status
    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        title: 'API key rejected',
        message: 'Your fal.ai key was rejected. Check it in Settings and try again.',
        retryable: false,
      }
    }
    if (status === 429) {
      return {
        kind: 'rate',
        title: 'Rate limited',
        message: 'fal.ai is throttling requests. Wait a moment and retry.',
        retryable: true,
      }
    }
    if (status === 402) {
      return {
        kind: 'auth',
        title: 'Out of credits',
        message: 'Your fal.ai account is out of credits. Top up and retry.',
        retryable: false,
      }
    }
    if (status >= 500) {
      return {
        kind: 'network',
        title: 'fal.ai server error',
        message: 'A temporary server error occurred. Please retry.',
        retryable: true,
      }
    }
  }

  // CORS / network failures surface as TypeError "Failed to fetch".
  if (e instanceof TypeError && /fetch/i.test(e.message)) {
    return {
      kind: 'network',
      title: 'Network error',
      message: 'Could not reach fal.ai. Check your connection and try again.',
      retryable: true,
    }
  }

  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: e instanceof Error ? e.message : String(e),
    retryable: true,
  }
}
