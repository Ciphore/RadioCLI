'use client';

import { useEffect, useRef, useState } from 'react';

export function ProductDemo({ src, poster, label, width = 1280, height = 760 }: {
  src: string; poster: string; label: string; width?: number; height?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = false;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (visible && !document.hidden && (paused === null ? !preference.matches : !paused)) {
        void video.play().catch(() => setPlaying(false));
      } else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.15 });
    observer.observe(video);
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      video.pause();
    };
  }, [paused]);

  return <figure className="rc-demo">
    <video ref={ref} src={src} poster={poster} width={width} height={height}
      muted loop playsInline preload="none" aria-label={label}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    <button className="rc-demo-toggle" type="button" onClick={() => setPaused(playing)}
      aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">{playing
        ? <path d="M3 2h4v12H3zm6 0h4v12H9z" />
        : <path d="m4 2 10 6-10 6z" />}</svg>
    </button>
  </figure>;
}
