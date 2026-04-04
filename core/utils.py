from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
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

    def snapshot(self, extra: dict[str, float | str | bool] | None = None) -> dict[str, float | str | bool]:
        base: dict[str, float | str | bool] = {
            "captureFps": round(self._capture_fps, 2),
            "inferFps": round(self._infer_fps, 2),
            "renderFps": round(self._render_fps, 2),
            "p95LatencyMs": round(self.p95_latency_ms(), 2),
            "frameDropRate": round(self.frame_drop_rate(), 4),
        }
        if extra:
            for key, value in extra.items():
                if isinstance(value, (int, float)):
                    base[key] = round(float(value), 4)
                else:
                    base[key] = value
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
        initial_scale: float,
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
        min_scale_clamped = _clamp(float(min_scale), 0.4, 1.0)
        initial_scale_clamped = _clamp(float(initial_scale), min_scale_clamped, 1.0)
        return cls(
            base_inference_stride=base_stride,
            min_scale=min_scale_clamped,
            max_stride=max(base_stride, int(max_stride)),
            scale_step=_clamp(float(scale_step), 0.02, 0.25),
            low_health_threshold=float(low_health_threshold),
            high_health_threshold=float(high_health_threshold),
            adjust_interval_frames=max(1, int(adjust_interval_frames)),
            target_render_fps=max(5.0, float(target_render_fps)),
            latency_budget_ms=max(30.0, float(latency_budget_ms)),
            max_drop_rate=_clamp(float(max_drop_rate), 0.01, 0.9),
            inference_stride=base_stride,
            infer_scale=initial_scale_clamped,
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


@dataclass(frozen=True)
class CameraHealthThresholds:
    min_render_fps: float
    min_infer_fps: float
    max_p95_latency_ms: float
    min_health_score: float


@dataclass(frozen=True)
class CameraHealthState:
    level: str
    reason: str
    metrics: dict[str, float]


def assess_camera_health(
    *,
    connected: bool,
    pipeline_stats: PipelineStats,
    health_score: float,
    thresholds: CameraHealthThresholds,
) -> CameraHealthState:
    if not connected:
        return CameraHealthState(
            level="offline",
            reason="camera-disconnected",
            metrics={
                "renderFps": 0.0,
                "inferFps": 0.0,
                "p95LatencyMs": 0.0,
                "healthScore": 0.0,
            },
        )

    snapshot = pipeline_stats.snapshot({"healthScore": float(health_score)})
    render_fps = float(snapshot.get("renderFps", 0.0))
    infer_fps = float(snapshot.get("inferFps", 0.0))
    p95_latency = float(snapshot.get("p95LatencyMs", 0.0))
    score = float(snapshot.get("healthScore", 0.0))
    reasons: list[str] = []

    if render_fps < thresholds.min_render_fps:
        reasons.append(f"render-fps<{thresholds.min_render_fps:.1f}")
    if infer_fps < thresholds.min_infer_fps:
        reasons.append(f"infer-fps<{thresholds.min_infer_fps:.1f}")
    if p95_latency > thresholds.max_p95_latency_ms:
        reasons.append(f"latency>{thresholds.max_p95_latency_ms:.0f}ms")
    if score < thresholds.min_health_score:
        reasons.append(f"health<{thresholds.min_health_score:.0f}")

    return CameraHealthState(
        level="ok" if not reasons else "degraded",
        reason="ok" if not reasons else ",".join(reasons),
        metrics={
            "renderFps": round(render_fps, 2),
            "inferFps": round(infer_fps, 2),
            "p95LatencyMs": round(p95_latency, 2),
            "healthScore": round(score, 2),
        },
    )


@dataclass
class DualRuntimeGuard:
    dual_requested: bool
    auto_degrade: bool
    self_check_seconds: float
    bad_hold_seconds: float
    recovery_seconds: float
    dual_ready: bool = False
    reason: str = "init"
    degraded_camera_ids: list[int] = field(default_factory=list)
    self_check_status: str = "disabled"
    self_check_started_at: float | None = None
    self_check_completed_at: float | None = None
    _bad_since: float | None = None
    _good_since: float | None = None

    @classmethod
    def create(
        cls,
        *,
        camera_count: int,
        auto_degrade: bool,
        self_check_seconds: float,
        bad_hold_seconds: float,
        recovery_seconds: float,
    ) -> "DualRuntimeGuard":
        dual_requested = camera_count >= 2
        status = "pending" if dual_requested and self_check_seconds > 0 else "disabled"
        return cls(
            dual_requested=dual_requested,
            auto_degrade=auto_degrade,
            self_check_seconds=max(0.0, float(self_check_seconds)),
            bad_hold_seconds=max(0.1, float(bad_hold_seconds)),
            recovery_seconds=max(0.2, float(recovery_seconds)),
            dual_ready=dual_requested,
            reason="startup",
            self_check_status=status,
        )

    def start(self, now: float) -> None:
        if self.self_check_status != "pending":
            return
        if self.self_check_started_at is None:
            self.self_check_started_at = now

    def _degraded_ids(self, health_by_camera: dict[int, CameraHealthState]) -> list[int]:
        return sorted([camera_id for camera_id, state in health_by_camera.items() if state.level != "ok"])

    def maybe_complete_self_check(self, now: float, health_by_camera: dict[int, CameraHealthState]) -> None:
        if self.self_check_status != "pending":
            return
        if self.self_check_started_at is None:
            self.self_check_started_at = now
        assert self.self_check_started_at is not None
        if (now - self.self_check_started_at) < self.self_check_seconds:
            return
        degraded_ids = self._degraded_ids(health_by_camera)
        self.degraded_camera_ids = degraded_ids
        self.self_check_completed_at = now
        if degraded_ids:
            self.self_check_status = "degraded"
            self.reason = "startup-self-check-failed"
            if self.auto_degrade:
                self.dual_ready = False
        else:
            self.self_check_status = "ok"
            self.reason = "startup-self-check-ok"
            self.dual_ready = True

    def update_runtime(self, now: float, health_by_camera: dict[int, CameraHealthState]) -> None:
        if not self.dual_requested:
            self.dual_ready = False
            self.degraded_camera_ids = []
            self.reason = "single-camera"
            return

        degraded_ids = self._degraded_ids(health_by_camera)
        self.degraded_camera_ids = degraded_ids

        if not self.auto_degrade:
            self.dual_ready = True
            if degraded_ids:
                self.reason = "auto-degrade-disabled"
            return

        if self.dual_ready:
            if degraded_ids:
                if self._bad_since is None:
                    self._bad_since = now
                if (now - self._bad_since) >= self.bad_hold_seconds:
                    self.dual_ready = False
                    self.reason = "runtime-degraded"
                    self._good_since = None
            else:
                self._bad_since = None
        else:
            if degraded_ids:
                self._good_since = None
            else:
                if self._good_since is None:
                    self._good_since = now
                if (now - self._good_since) >= self.recovery_seconds:
                    self.dual_ready = True
                    self.reason = "runtime-recovered"
                    self._bad_since = None

    def snapshot(self, now: float) -> dict[str, float | int | bool | str | list[int] | None]:
        elapsed_sec: float | None = None
        if self.self_check_started_at is not None:
            ended_at = self.self_check_completed_at if self.self_check_completed_at is not None else now
            elapsed_sec = round(max(0.0, ended_at - self.self_check_started_at), 2)
        return {
            "dualRequested": self.dual_requested,
            "dualReady": self.dual_ready,
            "autoDegrade": self.auto_degrade,
            "reason": self.reason,
            "degradedCameraIds": list(self.degraded_camera_ids),
            "selfCheckStatus": self.self_check_status,
            "selfCheckElapsedSec": elapsed_sec,
            "selfCheckCompletedAt": (
                round(self.self_check_completed_at, 2)
                if self.self_check_completed_at is not None
                else None
            ),
        }
