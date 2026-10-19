"use client";

import { t, getLocale } from "../src/i18n";
import { useEffect, useRef, useState } from "react";

export default function GameClient() {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.documentElement.lang = getLocale();
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let mount: ((root: HTMLElement) => () => void) | undefined;
    const start = () => {
      if (!cancelled && root.current && mount) {
        dispose?.();
        dispose = mount(root.current);
      }
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) start();
    };
    window.addEventListener("pageshow", restore);
    // Phaser reads browser globals during import, so load it after hydration.
    void import("../src/main")
      .then(({ mountBlacksite }) => {
        mount = mountBlacksite;
        start();
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", restore);
      dispose?.();
    };
  }, []);

  return (
    <>
      <div id="app" ref={root} />
      {error && <p role="alert">{t("実験を読み込めませんでした。ページを再読み込みしてください。")}</p>}
    </>
  );
}
