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
