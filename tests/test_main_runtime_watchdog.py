from __future__ import annotations

import cv2
import numpy as np

from main import _detect_black_frame


def test_detect_black_frame_for_dark_low_variance_frame() -> None:
    frame = np.zeros((24, 24, 3), dtype=np.uint8)
    is_black, mean, std = _detect_black_frame(
        frame,
        mean_threshold=8.0,
        std_threshold=2.0,
        cv2=cv2,
    )
    assert is_black is True
    assert mean == 0.0
    assert std == 0.0


def test_detect_black_frame_for_bright_frame() -> None:
    frame = np.full((24, 24, 3), 120, dtype=np.uint8)
    is_black, mean, std = _detect_black_frame(
        frame,
        mean_threshold=8.0,
        std_threshold=2.0,
        cv2=cv2,
    )
    assert is_black is False
    assert mean > 8.0
    assert std == 0.0
