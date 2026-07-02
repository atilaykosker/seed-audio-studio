// src/server/pipeline/advance.ts
import type { ClipRow } from '../db/rows'

export type ClipAction = 'submit-keyframe-pending' | 'poll-keyframe' | 'poll-video' | 'done'

export function nextClipAction(row: ClipRow): ClipAction {
  if (row.video_key) return 'done'
  if (row.image_key && row.request_id) return 'poll-video'
  if (row.request_id) return 'poll-keyframe'
  return 'submit-keyframe-pending'
}
