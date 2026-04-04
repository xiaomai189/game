from core.utils import PipelineStats, RuntimeQualityController


def test_pipeline_stats_snapshot_and_percentiles() -> None:
    stats = PipelineStats(window_size=10)
    stats.record_capture_fps(30.0)
    stats.record_infer_fps(18.0)
    stats.record_render_fps(32.0)
    for value in [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]:
        stats.record_latency_ms(value)
    stats.mark_dropped_frame()
    stats.mark_dropped_frame()

    snapshot = stats.snapshot()

    assert snapshot["captureFps"] == 30.0
    assert snapshot["inferFps"] == 18.0
    assert snapshot["renderFps"] == 32.0
    assert snapshot["p95LatencyMs"] == 26.0
    # 2 dropped / (10 processed + 2 dropped) = 0.1667
    assert snapshot["frameDropRate"] == 0.1667


def test_pipeline_health_score_reflects_tracking_and_latency() -> None:
    stats = PipelineStats(window_size=20)
    stats.record_render_fps(28.0)
    for _ in range(12):
        stats.record_latency_ms(95.0)

    high_health = stats.health_score(
        tracking_quality=0.95,
        calibration_progress=1.0,
        target_render_fps=28.0,
        latency_budget_ms=180.0,
        max_drop_rate=0.12,
    )
    low_health = stats.health_score(
        tracking_quality=0.25,
        calibration_progress=0.3,
        target_render_fps=28.0,
        latency_budget_ms=180.0,
        max_drop_rate=0.12,
    )

    assert high_health > low_health
    assert high_health > 80.0


def test_runtime_quality_controller_degrades_and_recovers() -> None:
    stats = PipelineStats(window_size=30)
    controller = RuntimeQualityController.create(
        base_inference_stride=1,
        min_scale=0.7,
        initial_scale=1.0,
        max_stride=3,
        scale_step=0.1,
        low_health_threshold=58.0,
        high_health_threshold=78.0,
        adjust_interval_frames=2,
        target_render_fps=28.0,
        latency_budget_ms=180.0,
        max_drop_rate=0.12,
    )

    # Force low health (high latency + low fps + low tracking).
    stats.record_render_fps(8.0)
    for _ in range(10):
        stats.record_latency_ms(380.0)
    controller.update(pipeline_stats=stats, tracking_quality=0.2, calibration_progress=0.2)
    controller.update(pipeline_stats=stats, tracking_quality=0.2, calibration_progress=0.2)

    assert controller.infer_scale < 1.0

    # Now feed healthy signals for recovery.
    for _ in range(10):
        stats.record_latency_ms(90.0)
    stats.record_render_fps(35.0)
    controller.update(pipeline_stats=stats, tracking_quality=1.0, calibration_progress=1.0)
    controller.update(pipeline_stats=stats, tracking_quality=1.0, calibration_progress=1.0)

    assert controller.infer_scale >= 0.9
