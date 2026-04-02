import numpy as np

from core.action_engine import (
    ActionEngine,
    LEFT_HIP,
    LEFT_KNEE,
    LEFT_SHOULDER,
    LEFT_WRIST,
    RIGHT_HIP,
    RIGHT_KNEE,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
)


def make_keypoints() -> np.ndarray:
    keypoints = np.zeros((17, 3), dtype=float)
    keypoints[:, 2] = 0.9
    return keypoints


def test_hand_raise_detection() -> None:
    engine = ActionEngine(keypoint_confidence=0.2, arm_raise_ratio=0.05)
    keypoints = make_keypoints()

    keypoints[LEFT_SHOULDER] = [200, 240, 0.9]
    keypoints[RIGHT_SHOULDER] = [440, 240, 0.9]
    keypoints[LEFT_WRIST] = [200, 130, 0.9]
    keypoints[RIGHT_WRIST] = [440, 120, 0.9]

    state = engine.infer(keypoints, frame_shape=(480, 640, 3))
    assert state.left_hand_up is True
    assert state.right_hand_up is True
    assert state.both_hands_up is True


def test_move_and_squat_detection() -> None:
    engine = ActionEngine(
        keypoint_confidence=0.2,
        arm_raise_ratio=0.05,
        move_dead_zone_ratio=0.08,
        squat_ratio=0.03,
    )
    keypoints = make_keypoints()

    keypoints[LEFT_SHOULDER] = [100, 170, 0.9]
    keypoints[RIGHT_SHOULDER] = [200, 170, 0.9]
    keypoints[LEFT_HIP] = [110, 310, 0.9]
    keypoints[RIGHT_HIP] = [190, 310, 0.9]
    keypoints[LEFT_KNEE] = [120, 315, 0.9]
    keypoints[RIGHT_KNEE] = [180, 315, 0.9]
    keypoints[LEFT_WRIST] = [0, 0, 0.0]
    keypoints[RIGHT_WRIST] = [0, 0, 0.0]

    state = engine.infer(keypoints, frame_shape=(480, 640, 3))
    assert state.move_left is True
    assert state.move_right is False
    assert state.squat is True


def test_hand_coordinates_available_without_shoulder() -> None:
    engine = ActionEngine(keypoint_confidence=0.2)
    keypoints = make_keypoints()
    keypoints[LEFT_WRIST] = [123, 234, 0.9]
    keypoints[RIGHT_WRIST] = [345, 210, 0.9]
    keypoints[LEFT_SHOULDER] = [0, 0, 0.0]
    keypoints[RIGHT_SHOULDER] = [0, 0, 0.0]

    state = engine.infer(keypoints, frame_shape=(480, 640, 3))
    assert state.left_hand == (123, 234)
    assert state.right_hand == (345, 210)
