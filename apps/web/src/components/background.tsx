"use client";

import { useEffect, useRef } from "react";

/**
 * Computational environment: a faint distorted grid, restrained radial
 * illumination and near-invisible grain. Drawn once to a canvas; parallax is a
 * cheap CSS transform driven by pointer position. Disabled motion for
 * prefers-reduced-motion.
 */
export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < 2 || h < 2) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Grid with a gentle sinusoidal distortion.
      const step = 56;
      ctx.lineWidth = 1;
      for (let x = -step; x <= w + step; x += step) {
        ctx.beginPath();
        for (let y = 0; y <= h; y += 8) {
          const dx = Math.sin(y / 240 + x / 900) * 6;
          if (y === 0) ctx.moveTo(x + dx, y);
          else ctx.lineTo(x + dx, y);
        }
        const alpha = 0.028 + 0.012 * Math.sin(x / 300);
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.stroke();
      }
      for (let y = -step; y <= h + step; y += step) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const dy = Math.cos(x / 260 + y / 800) * 5;
          if (x === 0) ctx.moveTo(x, y + dy);
          else ctx.lineTo(x, y + dy);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.024)";
        ctx.stroke();
      }

      // Grain
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4 * 7) {
        const n = (Math.random() * 12) | 0;
        d[i] = Math.min(255, (d[i] ?? 0) + n);
        d[i + 1] = Math.min(255, (d[i + 1] ?? 0) + n);
        d[i + 2] = Math.min(255, (d[i + 2] ?? 0) + n);
        d[i + 3] = Math.max(d[i + 3] ?? 0, n > 9 ? 7 : 0);
      }
      ctx.putImageData(img, 0, 0);
    };

    draw();
    let t: number | undefined;
    const onResize = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(draw, 160);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (reduce) return;
      const x = (e.clientX / window.innerWidth - 0.5) * -10;
      const y = (e.clientY / window.innerHeight - 0.5) * -10;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        wrap.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 15% -10%, rgba(255,255,255,0.045), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(204,255,0,0.035), transparent 60%)",
        }}
      />
      <div ref={wrapRef} className="absolute -inset-4 transition-transform duration-700 ease-out will-change-transform">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,5,5,0) 0%, rgba(5,5,5,0.35) 100%)" }} />
    </div>
  );
}
