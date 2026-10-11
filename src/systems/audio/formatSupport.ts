// 导入文件的格式判断：先按扩展名 / MIME 排除明显不是音频的文件，再真的加载一次元数据确认浏览器能播。

const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  webm: 'audio/webm',
  weba: 'audio/webm',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  caf: 'audio/x-caf',
  ape: 'audio/ape',
  wma: 'audio/x-ms-wma',
  alac: 'audio/mp4',
  mid: 'audio/midi',
  midi: 'audio/midi',
};

/** 文件选择框的 accept 值 */
export const AUDIO_ACCEPT = ['audio/*', ...Object.keys(EXT_MIME).map((e) => `.${e}`)].join(',');

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/** 去掉扩展名，作为歌名 */
export function titleOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i <= 0 ? name : name.slice(0, i);
}

export function looksLikeAudio(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  if (file.type === 'video/mp4' || file.type === 'video/webm') return true;
  return extOf(file.name) in EXT_MIME;
}

export type ProbeResult = { ok: true; duration: number } | { ok: false };

/** 用一个独立的 <audio> 读元数据，5 秒内没有结果视为不支持。 */
export function probe(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const el = new Audio();
    el.preload = 'metadata';
    let done = false;
    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false }), timeoutMs);
    el.addEventListener('loadedmetadata', () => {
      const d = el.duration;
      finish(Number.isFinite(d) && d > 0 ? { ok: true, duration: d } : { ok: false });
    });
    el.addEventListener('error', () => finish({ ok: false }));
    el.src = url;
  });
}
