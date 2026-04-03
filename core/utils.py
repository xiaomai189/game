from __future__ import annotations

from collections import deque
from dataclasses import dataclass
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

    def health_score(
        self,
        *,
        tracking_quality: float = 1.0,
        calibration_progress: float = 1.0,
        target_render_fps: float = 28.0,
        latency_budget_ms: float = 180.0,
        max_drop_rate: float = 0.12,
    ) -> float:
        render_fps = max(0.0, float(self._render_fps))
        p95_ms = self.p95_latency_ms()
        drop_rate = self.frame_drop_rate()

        fps_score = _clamp(render_fps / max(1e-6, target_render_fps), 0.0, 1.0) * 100.0
        if p95_ms <= latency_budget_ms:
            latency_score = 100.0
        else:
            latency_score = _clamp(1.0 - ((p95_ms - latency_budget_ms) / max(1e-6, latency_budget_ms)), 0.0, 1.0) * 100.0
        if drop_rate <= max_drop_rate:
            drop_score = 100.0
        else:
            drop_score = _clamp(1.0 - ((drop_rate - max_drop_rate) / max(1e-6, max_drop_rate)), 0.0, 1.0) * 100.0

        tracking_score = _clamp(tracking_quality, 0.0, 1.0) * 100.0
        calibration_score = _clamp(calibration_progress, 0.0, 1.0) * 100.0

        health = (
            fps_score * 0.30
            + latency_score * 0.24
            + drop_score * 0.16
            + tracking_score * 0.20
            + calibration_score * 0.10
        )
        return round(_clamp(health, 0.0, 100.0), 2)

    def snapshot(self, extra: dict[str, float] | None = None) -> dict[str, float]:
        base = {
            "captureFps": round(self._capture_fps, 2),
            "inferFps": round(self._infer_fps, 2),
            "renderFps": round(self._render_fps, 2),
            "p95LatencyMs": round(self.p95_latency_ms(), 2),
            "frameDropRate": round(self.frame_drop_rate(), 4),
        }
        if extra:
            for key, value in extra.items():
                base[key] = round(float(value), 4)
        return base


@dataclass
class RuntimeQualityController:
    base_inference_stride: int
    min_scale: float
    max_stride: int
    scale_step: float
    low_health_threshold: float
    high_health_threshold: float
    adjust_interval_frames: int
    target_render_fps: float
    latency_budget_ms: float
    max_drop_rate: float
    inference_stride: int
    infer_scale: float
    _low_streak: int = 0
    _high_streak: int = 0

    @classmethod
    def create(
        cls,
        *,
        base_inference_stride: int,
        min_scale: float,
        max_stride: int,
        scale_step: float,
        low_health_threshold: float,
        high_health_threshold: float,
        adjust_interval_frames: int,
        target_render_fps: float,
        latency_budget_ms: float,
        max_drop_rate: float,
    ) -> "RuntimeQualityController":
        base_stride = max(1, int(base_inference_stride))
        return cls(
            base_inference_stride=base_stride,
            min_scale=_clamp(float(min_scale), 0.4, 1.0),
            max_stride=max(base_stride, int(max_stride)),
            scale_step=_clamp(float(scale_step), 0.02, 0.25),
            low_health_threshold=float(low_health_threshold),
            high_health_threshold=float(high_health_threshold),
            adjust_interval_frames=max(1, int(adjust_interval_frames)),
            target_render_fps=max(5.0, float(target_render_fps)),
            latency_budget_ms=max(30.0, float(latency_budget_ms)),
            max_drop_rate=_clamp(float(max_drop_rate), 0.01, 0.9),
            inference_stride=base_stride,
            infer_scale=1.0,
        )

    def update(
        self,
        *,
        pipeline_stats: PipelineStats,
        tracking_quality: float,
        calibration_progress: float,
    ) -> float:
        health = pipeline_stats.health_score(
            tracking_quality=tracking_quality,
            calibration_progress=calibration_progress,
            target_render_fps=self.target_render_fps,
            latency_budget_ms=self.latency_budget_ms,
            max_drop_rate=self.max_drop_rate,
        )

        if health < self.low_health_threshold:
            self._low_streak += 1
            self._high_streak = 0
        elif health > self.high_health_threshold:
            self._high_streak += 1
            self._low_streak = 0
        else:
            self._low_streak = 0
            self._high_streak = 0

        if self._low_streak >= self.adjust_interval_frames:
            self._low_streak = 0
            self._high_streak = 0
            if self.infer_scale > self.min_scale + 1e-6:
                self.infer_scale = max(self.min_scale, self.infer_scale - self.scale_step)
            elif self.inference_stride < self.max_stride:
                self.inference_stride += 1
        elif self._high_streak >= self.adjust_interval_frames:
            self._low_streak = 0
            self._high_streak = 0
            if self.inference_stride > self.base_inference_stride:
                self.inference_stride -= 1
            elif self.infer_scale < 1.0 - 1e-6:
                self.infer_scale = min(1.0, self.infer_scale + self.scale_step)

        return health


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))
