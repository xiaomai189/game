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


def test_right_hand_up_survives_short_wrist_dropout() -> None:
    engine = ActionEngine(keypoint_confidence=0.2, arm_raise_ratio=0.05, keypoint_grace_frames=2)
    frame_shape = (480, 640, 3)

    keypoints = make_keypoints()
    keypoints[RIGHT_SHOULDER] = [440, 240, 0.9]
    keypoints[RIGHT_WRIST] = [440, 120, 0.9]

    state_0 = engine.infer(keypoints, frame_shape=frame_shape)
    assert state_0.right_hand_up is True
    assert state_0.right_hand == (440, 120)

    # Simulate one-frame wrist dropout while shoulder is still visible.
    keypoints[RIGHT_WRIST] = [0, 0, 0.0]
    state_1 = engine.infer(keypoints, frame_shape=frame_shape)
    assert state_1.right_hand_up is True
    assert state_1.right_hand == (440, 120)


def test_wrist_dropout_clears_after_grace_frames() -> None:
    engine = ActionEngine(keypoint_confidence=0.2, arm_raise_ratio=0.05, keypoint_grace_frames=2)
    frame_shape = (480, 640, 3)

    keypoints = make_keypoints()
    keypoints[RIGHT_SHOULDER] = [440, 240, 0.9]
    keypoints[RIGHT_WRIST] = [440, 120, 0.9]
    engine.infer(keypoints, frame_shape=frame_shape)

    keypoints[RIGHT_WRIST] = [0, 0, 0.0]
    state_1 = engine.infer(keypoints, frame_shape=frame_shape)
    state_2 = engine.infer(keypoints, frame_shape=frame_shape)
    state_3 = engine.infer(keypoints, frame_shape=frame_shape)

    assert state_1.right_hand_up is True
    assert state_2.right_hand_up is True
    assert state_3.right_hand_up is False
    assert state_3.right_hand is None


def test_missing_person_for_short_time_uses_grace_then_recovers() -> None:
    engine = ActionEngine(keypoint_confidence=0.2, arm_raise_ratio=0.05, keypoint_grace_frames=2)
    frame_shape = (480, 640, 3)

    keypoints = make_keypoints()
    keypoints[RIGHT_SHOULDER] = [440, 240, 0.9]
    keypoints[RIGHT_WRIST] = [440, 120, 0.9]
    state_0 = engine.infer(keypoints, frame_shape=frame_shape)
    assert state_0.right_hand_up is True

    state_1 = engine.infer(None, frame_shape=frame_shape)
    state_2 = engine.infer(None, frame_shape=frame_shape)
    state_3 = engine.infer(None, frame_shape=frame_shape)

    assert state_1.right_hand_up is True
    assert state_2.right_hand_up is True
    assert state_3.right_hand_up is False


def test_hand_raise_debounce_requires_two_frames_for_toggle() -> None:
    engine = ActionEngine(
        keypoint_confidence=0.2,
        arm_raise_ratio=0.05,
        keypoint_grace_frames=0,
        action_enter_frames=2,
        action_exit_frames=2,
    )
    frame_shape = (480, 640, 3)
    keypoints = make_keypoints()
    keypoints[RIGHT_SHOULDER] = [440, 240, 0.9]
    keypoints[RIGHT_WRIST] = [440, 120, 0.9]

    first = engine.infer(keypoints, frame_shape=frame_shape)
    second = engine.infer(keypoints, frame_shape=frame_shape)
    assert first.right_hand_up is False
    assert second.right_hand_up is True

    keypoints[RIGHT_WRIST] = [440, 380, 0.9]
    third = engine.infer(keypoints, frame_shape=frame_shape)
    fourth = engine.infer(keypoints, frame_shape=frame_shape)
    assert third.right_hand_up is True
    assert fourth.right_hand_up is False


def test_movement_uses_calibrated_neutral_center() -> None:
    engine = ActionEngine(
        keypoint_confidence=0.2,
        move_dead_zone_ratio=0.01,
        move_dead_zone_shoulder_ratio=0.35,
        calibration_frames=3,
        calibration_adapt_alpha=0.5,
        pose_smoothing_alpha=1.0,
    )
    frame_shape = (480, 640, 3)

    def build_pose(center_x: float) -> np.ndarray:
        kps = make_keypoints()
        kps[LEFT_SHOULDER] = [center_x - 60, 180, 0.9]
        kps[RIGHT_SHOULDER] = [center_x + 60, 180, 0.9]
        kps[LEFT_HIP] = [center_x - 45, 300, 0.9]
        kps[RIGHT_HIP] = [center_x + 45, 300, 0.9]
        kps[LEFT_KNEE] = [center_x - 45, 390, 0.9]
        kps[RIGHT_KNEE] = [center_x + 45, 390, 0.9]
        return kps

    for _ in range(3):
        state = engine.infer(build_pose(320), frame_shape=frame_shape)
    assert state.calibrated is True
    assert state.calibration_progress == 1.0

    slight_shift = engine.infer(build_pose(345), frame_shape=frame_shape)
    assert slight_shift.move_left is False
    assert slight_shift.move_right is False

    strong_shift = engine.infer(build_pose(390), frame_shape=frame_shape)
    assert strong_shift.move_left is False
    assert strong_shift.move_right is True


def test_infer_multi_assigns_roles_and_primary_action() -> None:
    engine = ActionEngine(keypoint_confidence=0.2, dual_role_enabled=True, role_bind_grace_ms=500.0)
    frame_shape = (480, 640, 3)

    class Person:
        def __init__(self, track_id: int, keypoints: np.ndarray, bbox: tuple[float, float, float, float], score: float) -> None:
            self.track_id = track_id
            self.keypoints = keypoints
            self.bbox = bbox
            self.score = score

    p1 = make_keypoints()
    p1[LEFT_SHOULDER] = [130, 200, 0.9]
    p1[RIGHT_SHOULDER] = [180, 200, 0.9]
    p1[LEFT_HIP] = [140, 280, 0.9]
    p1[RIGHT_HIP] = [170, 280, 0.9]
    p1[LEFT_KNEE] = [140, 350, 0.9]
    p1[RIGHT_KNEE] = [170, 350, 0.9]

    p2 = make_keypoints()
    p2[LEFT_SHOULDER] = [450, 210, 0.9]
    p2[RIGHT_SHOULDER] = [510, 210, 0.9]
    p2[RIGHT_WRIST] = [510, 120, 0.9]
    p2[LEFT_HIP] = [455, 290, 0.9]
    p2[RIGHT_HIP] = [505, 290, 0.9]
    p2[LEFT_KNEE] = [455, 360, 0.9]
    p2[RIGHT_KNEE] = [505, 360, 0.9]

    output = engine.infer_multi(
        persons=[
            Person(101, p1, (100.0, 150.0, 210.0, 360.0), 0.78),
            Person(202, p2, (420.0, 150.0, 540.0, 360.0), 0.91),
        ],
        frame_shape=frame_shape,
        now=100.0,
        primary_track_id=202,
    )
    assert output.roles["p1"] is not None and output.roles["p1"].track_id == 101
    assert output.roles["p2"] is not None and output.roles["p2"].track_id == 202
    assert output.primary_action.right_hand_up is True

    # Swap x positions but keep same track IDs: roles should remain sticky by ID.
    p1_swapped = p1.copy()
    p1_swapped[:, 0] += 250
    p2_swapped = p2.copy()
    p2_swapped[:, 0] -= 250
    output_swapped = engine.infer_multi(
        persons=[
            Person(101, p1_swapped, (350.0, 150.0, 460.0, 360.0), 0.78),
            Person(202, p2_swapped, (170.0, 150.0, 290.0, 360.0), 0.91),
        ],
        frame_shape=frame_shape,
        now=100.1,
        primary_track_id=202,
    )
    assert output_swapped.roles["p1"] is not None and output_swapped.roles["p1"].track_id == 101
    assert output_swapped.roles["p2"] is not None and output_swapped.roles["p2"].track_id == 202


def test_infer_multi_role_grace_prevents_immediate_reassignment() -> None:
    engine = ActionEngine(keypoint_confidence=0.2, dual_role_enabled=True, role_bind_grace_ms=500.0)
    frame_shape = (480, 640, 3)

    class Person:
        def __init__(self, track_id: int, keypoints: np.ndarray, bbox: tuple[float, float, float, float], score: float) -> None:
            self.track_id = track_id
            self.keypoints = keypoints
            self.bbox = bbox
            self.score = score

    base = make_keypoints()
    base[LEFT_SHOULDER] = [120, 200, 0.9]
    base[RIGHT_SHOULDER] = [170, 200, 0.9]
    base[LEFT_HIP] = [130, 280, 0.9]
    base[RIGHT_HIP] = [160, 280, 0.9]
    base[LEFT_KNEE] = [130, 350, 0.9]
    base[RIGHT_KNEE] = [160, 350, 0.9]

    right = base.copy()
    right[:, 0] += 300

    newcomer = base.copy()
    newcomer[:, 0] += 220

    engine.infer_multi(
        persons=[
            Person(1, base, (90.0, 150.0, 190.0, 360.0), 0.8),
            Person(2, right, (390.0, 150.0, 490.0, 360.0), 0.8),
        ],
        frame_shape=frame_shape,
        now=200.0,
        primary_track_id=1,
    )
    short_gap = engine.infer_multi(
        persons=[
            Person(2, right, (390.0, 150.0, 490.0, 360.0), 0.8),
            Person(3, newcomer, (310.0, 150.0, 410.0, 360.0), 0.8),
        ],
        frame_shape=frame_shape,
        now=200.2,
        primary_track_id=2,
    )
    assert short_gap.roles["p1"] is None
    assert short_gap.roles["p2"] is not None and short_gap.roles["p2"].track_id == 2

    long_gap = engine.infer_multi(
        persons=[
            Person(2, right, (390.0, 150.0, 490.0, 360.0), 0.8),
            Person(3, newcomer, (310.0, 150.0, 410.0, 360.0), 0.8),
        ],
        frame_shape=frame_shape,
        now=201.0,
        primary_track_id=2,
    )
    assert long_gap.roles["p1"] is not None and long_gap.roles["p1"].track_id == 3
