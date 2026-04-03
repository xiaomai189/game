from pathlib import Path

import numpy as np

from core.pose_engine import PoseEngine


def test_pose_engine_fallback_when_model_missing() -> None:
    engine = PoseEngine(model_path=Path("models/not-exists.pt"), device="cpu", conf=0.5)
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    output = engine.infer(frame)

    assert engine.enabled is False
    assert output.keypoints is None
    assert output.warning is not None


def test_primary_selection_prefers_largest_area_without_history() -> None:
    boxes = np.array(
        [
            [10.0, 10.0, 80.0, 80.0],    # area 4900
            [200.0, 40.0, 340.0, 220.0],  # area 25200
        ]
    )
    idx = PoseEngine._select_primary_index(
        boxes_np=boxes,
        previous_center=None,
        stickiness=0.65,
    )
    assert idx == 1


def test_primary_selection_uses_stickiness_with_history() -> None:
    boxes = np.array(
        [
            [10.0, 10.0, 120.0, 180.0],   # larger but far away
            [280.0, 120.0, 360.0, 260.0],  # slightly smaller and near previous center
        ]
    )
    idx = PoseEngine._select_primary_index(
        boxes_np=boxes,
        previous_center=(320.0, 190.0),
        stickiness=0.85,
    )
    assert idx == 1
