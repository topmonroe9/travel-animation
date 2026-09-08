// Экспорт в MP4 (H.264) прямо в браузере: WebCodecs VideoEncoder + mp4-muxer.
// Кадры отдаются по одному через getFrame(i) — рендер полностью детерминированный.

import { t } from './i18n.js';

const CODECS = ['avc1.640034', 'avc1.64002A', 'avc1.640028', 'avc1.4D0034', 'avc1.42E034'];

async function pickCodec(width, height, bitrate, framerate) {
  for (const codec of CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
      if (r.supported) return codec;
    } catch {}
  }
  throw new Error(t('err.codec'));
}

/**
 * @param {{frames:number, fps:number, width:number, height:number, bitrate:number,
 *          getFrame:(i:number)=>Promise<HTMLCanvasElement>, onProgress?:(i:number,n:number)=>void,
 *          isCancelled?:()=>boolean}} p
 * @returns {Promise<Blob|null>} null, если отменили
 */
export async function exportVideo(p) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(t('err.webcodecs'));
  }
  if (typeof Mp4Muxer === 'undefined') throw new Error(t('err.muxer'));
  if (p.width % 2 || p.height % 2) throw new Error(t('err.even'));

  const codec = await pickCodec(p.width, p.height, p.bitrate, p.fps);
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: p.width, height: p.height, frameRate: p.fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encErr = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e; },
  });
  encoder.configure({
    codec, width: p.width, height: p.height, bitrate: p.bitrate, framerate: p.fps,
    latencyMode: 'quality', avc: { format: 'avc' },
  });

  const usPerFrame = 1e6 / p.fps;
  for (let i = 0; i < p.frames; i++) {
    if (p.isCancelled?.()) { encoder.close(); return null; }
    if (encErr) throw encErr;
    const canvas = await p.getFrame(i);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
    encoder.encode(frame, { keyFrame: i % (p.fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 4));
    p.onProgress?.(i + 1, p.frames);
  }
  await encoder.flush();
  encoder.close();
  if (encErr) throw encErr;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10_000);
}
