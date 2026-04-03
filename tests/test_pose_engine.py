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


def test_top_person_selection_prefers_conf_and_area() -> None:
    boxes = np.array(
        [
            [10.0, 10.0, 80.0, 80.0],      # small
            [100.0, 20.0, 320.0, 260.0],   # large + medium conf
            [340.0, 50.0, 430.0, 210.0],   # medium + high conf
        ]
    )
    box_conf = np.array([0.4, 0.75, 0.95], dtype=float)
    keypoint_conf = np.array(
        [
            [0.4] * 17,
            [0.8] * 17,
            [0.7] * 17,
        ],
        dtype=float,
    )
    selected = PoseEngine._select_top_person_indices(
        boxes_np=boxes,
        box_conf_np=box_conf,
        keypoint_conf_np=keypoint_conf,
        max_persons=2,
    )
    assert len(selected) == 2
    assert 1 in selected
    assert 2 in selected
