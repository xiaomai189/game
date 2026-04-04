from core.utils import (
    CameraHealthState,
    CameraHealthThresholds,
    DualRuntimeGuard,
    PipelineStats,
    assess_camera_health,
)


def _make_stats(*, render_fps: float, infer_fps: float, p95_latency_ms: float) -> PipelineStats:
    stats = PipelineStats(window_size=32)
    stats.record_render_fps(render_fps)
    stats.record_infer_fps(infer_fps)
    for _ in range(20):
        stats.record_latency_ms(p95_latency_ms)
    return stats


def test_assess_camera_health_returns_degraded_when_fps_low() -> None:
    thresholds = CameraHealthThresholds(
        min_render_fps=6.0,
        min_infer_fps=4.0,
        max_p95_latency_ms=450.0,
        min_health_score=55.0,
    )
    stats = _make_stats(render_fps=2.5, infer_fps=1.8, p95_latency_ms=120.0)

    state = assess_camera_health(
        connected=True,
        pipeline_stats=stats,
        health_score=40.0,
        thresholds=thresholds,
    )

    assert state.level == "degraded"
    assert "render-fps<6.0" in state.reason
    assert "infer-fps<4.0" in state.reason


def test_assess_camera_health_returns_offline_when_disconnected() -> None:
    thresholds = CameraHealthThresholds(
        min_render_fps=6.0,
        min_infer_fps=4.0,
        max_p95_latency_ms=450.0,
        min_health_score=55.0,
    )
    stats = _make_stats(render_fps=20.0, infer_fps=15.0, p95_latency_ms=90.0)

    state = assess_camera_health(
        connected=False,
        pipeline_stats=stats,
        health_score=100.0,
        thresholds=thresholds,
    )

    assert state.level == "offline"
    assert state.reason == "camera-disconnected"


def test_dual_runtime_guard_degrades_and_recovers() -> None:
    guard = DualRuntimeGuard.create(
        camera_count=2,
        auto_degrade=True,
        self_check_seconds=0.0,
        bad_hold_seconds=1.5,
        recovery_seconds=2.0,
    )
    now = 100.0
    guard.start(now)
    guard.self_check_status = "ok"
    guard.dual_ready = True

    healthy = {
        0: CameraHealthState(level="ok", reason="ok", metrics={}),
        1: CameraHealthState(level="ok", reason="ok", metrics={}),
    }
    degraded = {
        0: CameraHealthState(level="ok", reason="ok", metrics={}),
        1: CameraHealthState(level="degraded", reason="render-fps<6.0", metrics={}),
    }

    guard.update_runtime(now, degraded)
    assert guard.dual_ready is True

    guard.update_runtime(now + 2.0, degraded)
    assert guard.dual_ready is False
    assert guard.reason == "runtime-degraded"
    assert guard.degraded_camera_ids == [1]

    guard.update_runtime(now + 2.5, healthy)
    assert guard.dual_ready is False

    guard.update_runtime(now + 4.8, healthy)
    assert guard.dual_ready is True
    assert guard.reason == "runtime-recovered"

