import { t } from "./i18n";

/** Presentation-only playback: cancellation never advances a game run. */
export function createCinematics(root: HTMLElement, onActiveChange: () => void) {
  let current: { cancel: () => void; video: HTMLVideoElement } | null = null;
  let disposed = false;
  const prepared = new Map<string, HTMLVideoElement>();
  function clearPrepared() {
    for (const video of prepared.values()) {
      video.removeAttribute('src');
      video.load();
    }
    prepared.clear();
  }
  return {
    get active() { return current !== null; },
    prepare(sources: string[]) {
      if (disposed) return;
      for (const src of sources) {
        if (!["/video/spawn.mp4", "/video/contact.mp4"].includes(src) || prepared.has(src)) continue;
        const video = document.createElement('video');
        video.preload = 'auto';
        video.playsInline = true;
        if (video.getAttribute('src') !== src) video.src = src;
        prepared.set(src, video);
        video.load();
      }
    },
    play(src: string, label: string, muted: boolean, notice = ""): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      current?.cancel();
      return new Promise((resolve) => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const layer = document.createElement('section');
        layer.className = 'cinematic';
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-label', t(label));
        layer.innerHTML = '<div class="cinematic-stage"><div class="cinematic-frame"><video class="cinematic-video" playsinline preload="auto"></video></div></div><div class="cinematic-controls"><span class="cinematic-status" role="status"></span><button class="cinematic-play" hidden></button><button class="cinematic-skip"></button></div>';
        const placeholder = layer.querySelector('video')!;
        const video = prepared.get(src) ?? placeholder;
        prepared.delete(src);
        if (video !== placeholder) {
          video.className = placeholder.className;
          placeholder.replaceWith(video);
        }
        const play = layer.querySelector<HTMLButtonElement>('.cinematic-play')!;
        const skip = layer.querySelector<HTMLButtonElement>('.cinematic-skip')!;
        const status = layer.querySelector<HTMLElement>('.cinematic-status')!;
        play.textContent = t('映像を再生');
        skip.textContent = t('スキップ');
        status.textContent = t(notice);
        if (video.getAttribute('src') !== src) video.src = src;
        video.muted = muted;
        video.loop = false;
        const events = new AbortController();
        const background = Array.from(root.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
        const inertBefore = background.map((child) => child.inert);
        for (const child of background) child.inert = true;
        root.append(layer);
        let finished = false;
        const finish = (advance: boolean) => {
          if (finished) return;
          finished = true;
          events.abort();
          video.pause();
          video.removeAttribute('src');
          video.load();
          layer.remove();
          background.forEach((child, i) => { child.inert = inertBefore[i]; });
          current = null;
          if (opener?.isConnected && !disposed) opener.focus({ preventScroll: true });
          onActiveChange();
          resolve(advance);
        };
        current = { cancel: () => finish(false), video };
        const retry = () => {
          if (finished || document.hidden) return;
          play.hidden = true;
          status.textContent = t(notice);
          void video.play().catch(() => {
            if (finished) return;
            play.hidden = false;
            status.textContent = `${t(notice)}${notice ? ' ' : ''}${t('再生ボタンを押すか、スキップして続けてください。')}`;
          });
        };
        video.addEventListener('ended', () => finish(true), { signal: events.signal });
        video.addEventListener('error', () => {
          status.textContent = `${t(notice)}${notice ? ' ' : ''}${t('映像を読み込めませんでした。スキップして続けられます。')}`;
        }, { signal: events.signal });
        play.addEventListener('click', retry, { signal: events.signal });
        skip.addEventListener('click', () => finish(true), { signal: events.signal });
        document.addEventListener('keydown', (event) => {
          event.stopImmediatePropagation();
          if (event.key === 'Escape') { event.preventDefault(); finish(true); }
          else if (event.key === 'Tab') {
            event.preventDefault();
            (document.activeElement === skip && !play.hidden ? play : skip).focus();
          } else if (event.target !== skip && event.target !== play) event.preventDefault();
        }, { capture: true, signal: events.signal });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) video.pause();
          else retry();
        }, { signal: events.signal });
        skip.focus({ preventScroll: true });
        onActiveChange();
        retry();
      });
    },
    cancel() { current?.cancel(); clearPrepared(); },
    dispose() { disposed = true; current?.cancel(); clearPrepared(); },
  };
}
