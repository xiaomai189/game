from __future__ import annotations

from collections import deque
import time


class FpsCounter:
    def __init__(self, smoothing: float = 0.9) -> None:
        self.smoothing = smoothing
        self._last_ts = time.perf_counter()
        self._fps = 0.0

    def tick(self) -> float:
        now = time.perf_counter()
        dt = max(1e-6, now - self._last_ts)
        instant = 1.0 / dt
        if self._fps == 0.0:
            self._fps = instant
        else:
            self._fps = self.smoothing * self._fps + (1.0 - self.smoothing) * instant
        self._last_ts = now
        return self._fps


class PipelineStats:
    def __init__(self, window_size: int = 240) -> None:
        self._latencies_ms: deque[float] = deque(maxlen=window_size)
        self._capture_fps = 0.0
        self._infer_fps = 0.0
        self._render_fps = 0.0
        self._dropped_frames = 0
        self._processed_frames = 0

    def record_capture_fps(self, fps: float) -> None:
        self._capture_fps = max(0.0, float(fps))

    def record_infer_fps(self, fps: float) -> None:
        self._infer_fps = max(0.0, float(fps))

    def record_render_fps(self, fps: float) -> None:
        self._render_fps = max(0.0, float(fps))

    def record_latency_ms(self, latency_ms: float) -> None:
        self._latencies_ms.append(max(0.0, float(latency_ms)))
        self._processed_frames += 1

    def mark_dropped_frame(self) -> None:
        self._dropped_frames += 1

    def p95_latency_ms(self) -> float:
        if not self._latencies_ms:
            return 0.0
        values = sorted(self._latencies_ms)
        index = int(0.95 * (len(values) - 1))
        return float(values[index])

    def frame_drop_rate(self) -> float:
        total = self._processed_frames + self._dropped_frames
        if total <= 0:
            return 0.0
        return float(self._dropped_frames / total)

    def snapshot(self) -> dict[str, float]:
        return {
            "captureFps": round(self._capture_fps, 2),
            "inferFps": round(self._infer_fps, 2),
            "renderFps": round(self._render_fps, 2),
            "p95LatencyMs": round(self.p95_latency_ms(), 2),
            "frameDropRate": round(self.frame_drop_rate(), 4),
        }
