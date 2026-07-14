'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function HashScrollRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    let frame = 0;
    let observer: MutationObserver | null = null;
    let interrupted = false;
    const timers: number[] = [];

    function alignTarget() {
      if (interrupted) return true;
      const hash = window.location.hash.slice(1);
      if (!hash) return true;

      let id: string;
      try {
        id = decodeURIComponent(hash);
      } catch {
        return true;
      }

      const target = document.getElementById(id);
      if (!target) return false;
      frame = window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'auto' }));
      return true;
    }

    function handleHashChange() {
      interrupted = false;
      scheduleAlignment();
    }

    function interruptAlignment() {
      interrupted = true;
    }

    function scheduleAlignment() {
      for (const delay of [0, 150, 500, 1_000]) {
        timers.push(window.setTimeout(alignTarget, delay));
      }
    }

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('wheel', interruptAlignment, { passive: true });
    window.addEventListener('touchstart', interruptAlignment, { passive: true });
    window.addEventListener('pointerdown', interruptAlignment, { passive: true });
    window.addEventListener('keydown', interruptAlignment);
    scheduleAlignment();
    if (!alignTarget()) {
      observer = new MutationObserver(() => {
        if (alignTarget()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const timeout = window.setTimeout(() => observer?.disconnect(), 5_000);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('wheel', interruptAlignment);
      window.removeEventListener('touchstart', interruptAlignment);
      window.removeEventListener('pointerdown', interruptAlignment);
      window.removeEventListener('keydown', interruptAlignment);
      window.clearTimeout(timeout);
      for (const timer of timers) window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
