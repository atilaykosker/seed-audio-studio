/** WebAudio helpers: decode → trim/concat → 16-bit PCM WAV blob. No ffmpeg in the browser. */

let ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export async function fetchToBlob(url: string): Promise<Blob> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Failed to fetch audio (${r.status})`)
  return r.blob()
}

async function decode(blob: Blob): Promise<AudioBuffer> {
  const buf = await blob.arrayBuffer()
  return audioCtx().decodeAudioData(buf)
}

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels
  const sr = buffer.sampleRate
  const frames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = frames * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numCh, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c))
  let off = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i]
      s = Math.max(-1, Math.min(1, s))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

/** Get a clip's duration (seconds) without trimming. */
export async function audioDuration(blob: Blob): Promise<number> {
  return (await decode(blob)).duration
}

/**
 * Trim a clip to at most `maxSec` seconds. Returns the original blob if already short
 * enough; otherwise decodes, slices the head, and re-encodes to WAV.
 */
export async function trimTo(blob: Blob, maxSec = 28): Promise<Blob> {
  const decoded = await decode(blob)
  if (decoded.duration <= maxSec) return blob
  const sr = decoded.sampleRate
  const frames = Math.floor(maxSec * sr)
  const out = audioCtx().createBuffer(decoded.numberOfChannels, frames, sr)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    out.copyToChannel(decoded.getChannelData(c).subarray(0, frames), c)
  }
  return encodeWav(out)
}

/** Fetch a URL and ensure the result is <=maxSec; returns a WAV/blob ready to upload. */
export async function fetchAndTrim(url: string, maxSec = 28): Promise<Blob> {
  return trimTo(await fetchToBlob(url), maxSec)
}
