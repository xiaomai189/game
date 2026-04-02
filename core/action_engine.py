from __future__ import annotations

from dataclasses import dataclass

import numpy as np


NOSE = 0
LEFT_SHOULDER = 5
RIGHT_SHOULDER = 6
LEFT_WRIST = 9
RIGHT_WRIST = 10
LEFT_HIP = 11
RIGHT_HIP = 12
LEFT_KNEE = 13
RIGHT_KNEE = 14


@dataclass
class ActionState:
    left_hand_up: bool = False
    right_hand_up: bool = False
    both_hands_up: bool = False
    squat: bool = False
    move_left: bool = False
    move_right: bool = False
    body_center: tuple[int, int] | None = None
    left_hand: tuple[int, int] | None = None
    right_hand: tuple[int, int] | None = None


class ActionEngine:
    def __init__(
        self,
        keypoint_confidence: float = 0.35,
        arm_raise_ratio: float = 0.08,
        move_dead_zone_ratio: float = 0.12,
        squat_ratio: float = 0.06,
        swap_left_right: bool = False,
    ) -> None:
        self.keypoint_confidence = keypoint_confidence
        self.arm_raise_ratio = arm_raise_ratio
        self.move_dead_zone_ratio = move_dead_zone_ratio
        self.squat_ratio = squat_ratio
        self.swap_left_right = swap_left_right

    def infer(self, keypoints: np.ndarray | None, frame_shape: tuple[int, int, int]) -> ActionState:
        state = ActionState()
        if keypoints is None or keypoints.shape[0] < 15:
            return state

        height, width = frame_shape[:2]
        arm_threshold = height * self.arm_raise_ratio
        move_threshold = width * self.move_dead_zone_ratio
        squat_threshold = height * self.squat_ratio

        def point(index: int) -> tuple[float, float] | None:
            x, y, conf = keypoints[index]
            if conf < self.keypoint_confidence:
                return None
            return float(x), float(y)

        left_wrist = point(LEFT_WRIST)
        right_wrist = point(RIGHT_WRIST)
        left_shoulder = point(LEFT_SHOULDER)
        right_shoulder = point(RIGHT_SHOULDER)
        left_hip = point(LEFT_HIP)
        right_hip = point(RIGHT_HIP)
        left_knee = point(LEFT_KNEE)
        right_knee = point(RIGHT_KNEE)

        if self.swap_left_right:
            left_wrist, right_wrist = right_wrist, left_wrist
            left_shoulder, right_shoulder = right_shoulder, left_shoulder
            left_hip, right_hip = right_hip, left_hip
            left_knee, right_knee = right_knee, left_knee

        if left_wrist:
            state.left_hand = (int(left_wrist[0]), int(left_wrist[1]))
        if right_wrist:
            state.right_hand = (int(right_wrist[0]), int(right_wrist[1]))

        if left_wrist and left_shoulder:
            state.left_hand_up = left_wrist[1] < left_shoulder[1] - arm_threshold
        if right_wrist and right_shoulder:
            state.right_hand_up = right_wrist[1] < right_shoulder[1] - arm_threshold

        state.both_hands_up = state.left_hand_up and state.right_hand_up

        centers: list[tuple[float, float]] = [
            p
            for p in [left_shoulder, right_shoulder, left_hip, right_hip]
            if p is not None
        ]
        if centers:
            cx = float(sum(p[0] for p in centers) / len(centers))
            cy = float(sum(p[1] for p in centers) / len(centers))
            state.body_center = (int(cx), int(cy))
            frame_center = width / 2.0
            state.move_left = cx < frame_center - move_threshold
            state.move_right = cx > frame_center + move_threshold

        if left_hip and right_hip and left_knee and right_knee:
            hip_y = (left_hip[1] + right_hip[1]) / 2.0
            knee_y = (left_knee[1] + right_knee[1]) / 2.0
            state.squat = hip_y > knee_y - squat_threshold

        return state
