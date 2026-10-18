/** Presentation-only playback: cancellation never advances a game run. */
export function createCinematics(root: HTMLElement, onActiveChange: () => void) {
  let current: { cancel: () => void; video: HTMLVideoElement } | null = null;
  let disposed = false;
  let fullscreenRevision = 0;
  return {
    get active() { return current !== null; },
    play(src: string, label: string, muted: boolean, fullscreen = false): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      current?.cancel();
      return new Promise((resolve) => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const layer = document.createElement('section');
        layer.className = 'cinematic';
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-label', label);
        layer.innerHTML = '<video class="cinematic-video" playsinline preload="auto"></video><div class="cinematic-controls"><span class="cinematic-status" role="status"></span><button class="cinematic-play" hidden>映像を再生</button><button class="cinematic-skip">スキップ</button></div>';
        const video = layer.querySelector('video')!;
        const play = layer.querySelector<HTMLButtonElement>('.cinematic-play')!;
        const skip = layer.querySelector<HTMLButtonElement>('.cinematic-skip')!;
        const status = layer.querySelector<HTMLElement>('.cinematic-status')!;
        video.src = src;
        video.muted = muted;
        video.loop = false;
        const events = new AbortController();
        const background = Array.from(root.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
        const inertBefore = background.map((child) => child.inert);
        for (const child of background) child.inert = true;
        root.append(layer);
        let finished = false;
        let ownsFullscreen = false;
        const leaveFullscreen = () => {
          if (ownsFullscreen && document.fullscreenElement === root) {
            ownsFullscreen = false;
            void document.exitFullscreen().catch(() => {});
          }
        };
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
          leaveFullscreen();
          if (opener?.isConnected && !disposed) opener.focus({ preventScroll: true });
          onActiveChange();
          resolve(advance);
        };
        current = { cancel: () => finish(false), video };
        const retry = () => {
          if (finished || document.hidden) return;
          play.hidden = true;
          status.textContent = '';
          void video.play().catch(() => {
            if (finished) return;
            play.hidden = false;
            status.textContent = '再生ボタンを押すか、スキップして続けてください。';
          });
        };
        video.addEventListener('ended', () => finish(true), { signal: events.signal });
        video.addEventListener('error', () => {
          status.textContent = '映像を読み込めませんでした。スキップして続けられます。';
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
        document.addEventListener('fullscreenchange', () => {
          if (ownsFullscreen && document.fullscreenElement !== root) {
            ownsFullscreen = false;
            finish(true);
          }
        }, { signal: events.signal });
        if (fullscreen && !document.fullscreenElement && root.requestFullscreen && document.fullscreenEnabled !== false) {
          // Invoke synchronously in the start click; automatic endings have no user activation.
          const revision = ++fullscreenRevision;
          void root.requestFullscreen().then(() => {
            if (revision !== fullscreenRevision) return;
            ownsFullscreen = document.fullscreenElement === root;
            if (finished) leaveFullscreen();
          }).catch(() => {});
        }
        skip.focus({ preventScroll: true });
        onActiveChange();
        retry();
      });
    },
    cancel() { current?.cancel(); },
    dispose() { disposed = true; current?.cancel(); },
  };
}
