import { encodeWav, fetchToBlob } from './trim'

let ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Concatenate several audio URLs into one WAV blob, with a small gap between clips. */
export async function concatUrls(urls: string[], gapSec = 0.3): Promise<Blob> {
  const buffers = await Promise.all(
    urls.map(async (u) => audioCtx().decodeAudioData(await (await fetchToBlob(u)).arrayBuffer())),
  )
  if (!buffers.length) throw new Error('Nothing to concatenate.')
  const sr = buffers[0].sampleRate
  const numCh = Math.max(...buffers.map((b) => b.numberOfChannels))
  const gapFrames = Math.floor(gapSec * sr)
  const totalFrames = buffers.reduce((n, b) => n + b.length, 0) + gapFrames * (buffers.length - 1)
  const out = audioCtx().createBuffer(numCh, totalFrames, sr)
  let offset = 0
  for (const b of buffers) {
    for (let c = 0; c < numCh; c++) {
      const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1))
      out.copyToChannel(src, c, offset)
    }
    offset += b.length + gapFrames
  }
  return encodeWav(out)
}
