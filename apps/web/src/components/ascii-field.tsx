"use client";

import { useEffect, useRef } from "react";

/**
 * ASCII geometric field.
 *
 * A monospace character grid driven by a folded hexagonal lattice crossed with
 * two slow plane waves. The lattice keeps the pattern geometric and repeating
 * rather than noisy; the waves drift it at a walking pace so the page feels
 * alive without pulling attention off the data.
 *
 * Cost control: one canvas, capped device pixel ratio, ~20fps, glyphs batched
 * by colour bucket, paused when the tab is hidden or the pointer is idle-free.
 * With prefers-reduced-motion it paints a single static frame.
 */

/**
 * Sparse to dense. Open glyphs only: no solid blocks, so the field stays a
 * texture rather than a pattern of holes. Most of the ramp is empty on purpose,
 * which is what keeps it calm.
 */
const RAMP = [" ", " ", " ", " ", " ", "·", "·", "˙", "+", "◇", "△", "◆"];
const CELL = 17;
const FPS = 20;

export function AsciiField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let stopped = false;
    // Pointer influence, eased. Adds a gentle swell near the cursor.
    let px = 0.5;
    let py = 0.5;
    let cx = 0.5;
    let cy = 0.5;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < 2 || h < 2) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${CELL - 3}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
      ctx.textBaseline = "top";
    };

    /**
     * Field value in [0,1]. Hexagonal fold gives repeating geometry; the two
     * rotating waves make it breathe. Everything is slow on purpose.
     */
    const field = (x: number, y: number, t: number): number => {
      // Skew square grid into a hex lattice.
      const hx = x + y * 0.5;
      const hy = y * 0.866;
      const fx = hx - Math.floor(hx) - 0.5;
      const fy = hy - Math.floor(hy) - 0.5;
      const cellDist = Math.sqrt(fx * fx + fy * fy) * 2;

      // Slow, long-wavelength motion. Nothing here moves faster than a drift.
      const wave1 = Math.sin(x * 0.32 + y * 0.18 - t * 0.22);
      const wave2 = Math.sin(x * -0.16 + y * 0.34 + t * 0.16);
      const ring = Math.sin(cellDist * 3.2 - t * 0.32);

      // Weight the lattice most so the result stays structured.
      const v = ring * 0.52 + wave1 * 0.26 + wave2 * 0.22;
      return (v + 1) * 0.5;
    };

    const draw = (t: number) => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      cx += (px - cx) * 0.06;
      cy += (py - cy) * 0.06;
      const pcx = cx * cols;
      const pcy = cy * rows;

      // Bucket glyphs by opacity so we set fillStyle a handful of times.
      const buckets: string[][][] = Array.from({ length: 5 }, () => []);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * 0.14;
          const y = r * 0.14;
          let v = field(x, y, t);

          // Gentle swell around the pointer.
          const dx = (c - pcx) / cols;
          const dy = (r - pcy) / rows;
          const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.6);
          v += near * 0.14;

          // Ease off just under the sticky header so navigation stays legible.
          v *= Math.min(1, (r / rows) * 6 + 0.55);

          const idx = Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))));
          const ch = RAMP[idx]!;
          if (ch === " ") continue;

          const bucket = idx >= 10 ? 4 : idx >= 8 ? 3 : idx >= 6 ? 2 : idx >= 4 ? 1 : 0;
          (buckets[bucket] ??= []).push([ch, String(c * CELL), String(r * CELL)]);
        }
      }

      // Dim white for structure; the densest cells pick up the accent so the
      // lime green reads as current moving through the lattice.
      const styles = [
        "rgba(255,255,255,0.14)",
        "rgba(255,255,255,0.20)",
        "rgba(255,255,255,0.28)",
        "rgba(204,255,0,0.34)",
        "rgba(204,255,0,0.60)",
      ];
      for (let b = 0; b < buckets.length; b++) {
        const items = buckets[b];
        if (!items || items.length === 0) continue;
        ctx.fillStyle = styles[b]!;
        for (const [ch, x, y] of items) ctx.fillText(ch!, Number(x), Number(y));
      }
    };

    const loop = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      draw(now / 1000);
    };

    const onPointer = (e: PointerEvent) => {
      px = e.clientX / window.innerWidth;
      py = e.clientY / window.innerHeight;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopped = true;
        cancelAnimationFrame(raf);
      } else if (stopped && !reduced) {
        stopped = false;
        raf = requestAnimationFrame(loop);
      }
    };

    let resizeTimer: number | undefined;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        draw(reduced ? 0 : performance.now() / 1000);
      }, 150);
    };

    resize();
    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    }
    window.addEventListener("resize", onResize);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 12% -8%, rgba(204,255,0,0.08), transparent 62%), radial-gradient(760px 460px at 92% 108%, rgba(204,255,0,0.06), transparent 62%)",
        }}
      />
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}
