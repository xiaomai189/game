from core.utils import PipelineStats


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
