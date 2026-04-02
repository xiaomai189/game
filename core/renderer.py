from __future__ import annotations

from dataclasses import dataclass
import time

import cv2
import numpy as np

from core.action_engine import ActionState
from core.game_engine import GameSnapshot


SKELETON_EDGES = [
    (5, 6),
    (5, 7),
    (7, 9),
    (6, 8),
    (8, 10),
    (5, 11),
    (6, 12),
    (11, 12),
    (11, 13),
    (13, 15),
    (12, 14),
    (14, 16),
]


@dataclass
class RenderInput:
    frame: np.ndarray
    keypoints: np.ndarray | None
    action_state: ActionState
    snapshot: GameSnapshot
    fps: float
    warning: str | None = None


class Renderer:
    def __init__(self, keypoint_confidence: float = 0.35, show_game_overlay: bool = True) -> None:
        self.keypoint_confidence = keypoint_confidence
        self.show_game_overlay = show_game_overlay

    def _draw_target(self, frame: np.ndarray, snapshot: GameSnapshot) -> None:
        cv2.circle(frame, snapshot.target, snapshot.target_radius, (0, 255, 255), 3)
        cv2.circle(frame, snapshot.target, 8, (0, 255, 255), -1)

    def _draw_keypoints(self, frame: np.ndarray, keypoints: np.ndarray | None) -> None:
        if keypoints is None:
            return

        for x, y, conf in keypoints:
            if conf < self.keypoint_confidence:
                continue
            cv2.circle(frame, (int(x), int(y)), 4, (0, 200, 255), -1)

        for start, end in SKELETON_EDGES:
            x1, y1, c1 = keypoints[start]
            x2, y2, c2 = keypoints[end]
            if c1 < self.keypoint_confidence or c2 < self.keypoint_confidence:
                continue
            cv2.line(frame, (int(x1), int(y1)), (int(x2), int(y2)), (70, 220, 70), 2)

    @staticmethod
    def _draw_hands(frame: np.ndarray, action_state: ActionState) -> None:
        if action_state.left_hand is not None:
            cv2.circle(frame, action_state.left_hand, 12, (255, 120, 60), 2)
            cv2.putText(frame, "L", (action_state.left_hand[0] - 5, action_state.left_hand[1] - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 120, 60), 2, cv2.LINE_AA)
        if action_state.right_hand is not None:
            cv2.circle(frame, action_state.right_hand, 12, (80, 170, 255), 2)
            cv2.putText(frame, "R", (action_state.right_hand[0] - 5, action_state.right_hand[1] - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 170, 255), 2, cv2.LINE_AA)

    @staticmethod
    def _draw_hud(
        frame: np.ndarray,
        action_state: ActionState,
        snapshot: GameSnapshot,
        fps: float,
        warning: str | None,
    ) -> None:
        lines = [
            f"Status: {snapshot.status}",
            f"Time: {snapshot.countdown_sec:05.1f}s",
            f"Score: {snapshot.score}",
            f"Hits: {snapshot.hits}",
            f"FPS: {fps:.1f}",
            f"LeftHandUp: {action_state.left_hand_up}",
            f"RightHandUp: {action_state.right_hand_up}",
            f"Squat: {action_state.squat}",
        ]
        if snapshot.status == "READY":
            lines.append("Press SPACE to start")
        elif snapshot.status == "GAME_OVER":
            lines.append("Game Over - Press R to restart")
        lines.append("Move either hand into the target circle to score")
        lines.append("Press Q / ESC to quit")
        if warning:
            lines.insert(0, f"Warning: {warning}")

        y = 30
        for line in lines:
            cv2.putText(
                frame,
                line,
                (20, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.62,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            y += 28

    @staticmethod
    def _draw_hit_feedback(frame: np.ndarray, snapshot: GameSnapshot) -> None:
        if snapshot.last_hit_ts is None:
            return
        if time.monotonic() - snapshot.last_hit_ts > 0.45:
            return
        h, w = frame.shape[:2]
        cv2.putText(
            frame,
            "HIT!",
            (w // 2 - 58, 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.6,
            (20, 240, 255),
            4,
            cv2.LINE_AA,
        )

    def render(self, input_data: RenderInput) -> np.ndarray:
        canvas = input_data.frame.copy()
        self._draw_keypoints(canvas, input_data.keypoints)
        self._draw_hands(canvas, input_data.action_state)
        if self.show_game_overlay:
            self._draw_target(canvas, input_data.snapshot)
            self._draw_hit_feedback(canvas, input_data.snapshot)
            self._draw_hud(
                canvas,
                action_state=input_data.action_state,
                snapshot=input_data.snapshot,
                fps=input_data.fps,
                warning=input_data.warning,
            )
        return canvas
