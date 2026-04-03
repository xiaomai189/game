from __future__ import annotations

from dataclasses import dataclass, field
import time
from typing import Any

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
    tracking_quality: float = 0.0
    calibrated: bool = False
    calibration_progress: float = 0.0


@dataclass
class PersonActionState:
    track_id: int | None
    role: str | None
    action: ActionState
    score: float = 0.0
    bbox: tuple[float, float, float, float] | None = None
    is_primary: bool = False


@dataclass
class MultiActionOutput:
    primary_action: ActionState
    persons: list[PersonActionState] = field(default_factory=list)
    roles: dict[str, PersonActionState | None] = field(default_factory=lambda: {"p1": None, "p2": None})


class DualRoleBinder:
    def __init__(self, grace_ms: float = 500.0) -> None:
        self.grace_ms = max(0.0, float(grace_ms))
        self._slots: dict[str, dict[str, float | int | None]] = {
            "p1": {"track_id": None, "last_seen_ms": 0.0},
            "p2": {"track_id": None, "last_seen_ms": 0.0},
        }

    @staticmethod
    def _person_center_x(person: PersonActionState) -> float:
        center = person.action.body_center
        if center is not None:
            return float(center[0])
        if person.bbox is not None:
            return float((person.bbox[0] + person.bbox[2]) * 0.5)
        return 0.0

    def assign(
        self,
        persons: list[PersonActionState],
        now_ms: float | None = None,
    ) -> dict[str, PersonActionState | None]:
        now_ms = (time.monotonic() * 1000.0) if now_ms is None else now_ms
        person_by_track: dict[int, PersonActionState] = {
            int(person.track_id): person for person in persons if person.track_id is not None
        }

        # Keep existing bindings while tracks are still visible, and expire after grace timeout.
        for role_name in ("p1", "p2"):
            slot = self._slots[role_name]
            track_id = slot["track_id"]
            if track_id is None:
                continue
            track_id_int = int(track_id)
            if track_id_int in person_by_track:
                slot["last_seen_ms"] = float(now_ms)
            elif float(now_ms) - float(slot["last_seen_ms"]) > self.grace_ms:
                slot["track_id"] = None

        assigned_tracks = {
            int(slot["track_id"])
            for slot in self._slots.values()
            if slot["track_id"] is not None
        }
        unassigned = [p for p in persons if p.track_id is not None and int(p.track_id) not in assigned_tracks]
        unassigned.sort(key=self._person_center_x)

        for role_name in ("p1", "p2"):
            slot = self._slots[role_name]
            if slot["track_id"] is not None:
                continue
            if not unassigned:
                break
            chosen = unassigned.pop(0)
            slot["track_id"] = int(chosen.track_id) if chosen.track_id is not None else None
            slot["last_seen_ms"] = float(now_ms)

        role_view: dict[str, PersonActionState | None] = {"p1": None, "p2": None}
        for role_name in ("p1", "p2"):
            track_id = self._slots[role_name]["track_id"]
            if track_id is None:
                continue
            bound = person_by_track.get(int(track_id))
            if bound is None:
                continue
            bound.role = role_name.upper()
            role_view[role_name] = bound
        return role_view


class ActionEngine:
    def __init__(
        self,
        keypoint_confidence: float = 0.35,
        arm_raise_ratio: float = 0.08,
        move_dead_zone_ratio: float = 0.12,
        squat_ratio: float = 0.06,
        swap_left_right: bool = False,
        keypoint_grace_frames: int = 2,
        pose_smoothing_alpha: float = 0.55,
        calibration_frames: int = 20,
        calibration_adapt_alpha: float = 0.08,
        arm_raise_torso_ratio: float = 0.22,
        move_dead_zone_shoulder_ratio: float = 0.45,
        move_exit_ratio: float = 0.72,
        action_enter_frames: int = 1,
        action_exit_frames: int = 1,
        dual_role_enabled: bool = True,
        role_bind_grace_ms: float = 500.0,
        enable_multi: bool = True,
    ) -> None:
        self.keypoint_confidence = keypoint_confidence
        self.arm_raise_ratio = arm_raise_ratio
        self.move_dead_zone_ratio = move_dead_zone_ratio
        self.squat_ratio = squat_ratio
        self.swap_left_right = swap_left_right
        self.keypoint_grace_frames = max(0, int(keypoint_grace_frames))
        self.pose_smoothing_alpha = float(max(0.0, min(1.0, pose_smoothing_alpha)))
        self.calibration_frames = max(1, int(calibration_frames))
        self.calibration_adapt_alpha = float(max(0.01, min(1.0, calibration_adapt_alpha)))
        self.arm_raise_torso_ratio = max(0.0, float(arm_raise_torso_ratio))
        self.move_dead_zone_shoulder_ratio = max(0.0, float(move_dead_zone_shoulder_ratio))
        self.move_exit_ratio = float(max(0.4, min(0.95, move_exit_ratio)))
        self.action_enter_frames = max(1, int(action_enter_frames))
        self.action_exit_frames = max(1, int(action_exit_frames))
        self.dual_role_enabled = bool(dual_role_enabled)
        self.role_bind_grace_ms = max(0.0, float(role_bind_grace_ms))
        self.enable_multi = bool(enable_multi)
        self._last_valid_points: dict[int, tuple[float, float] | None] = {}
        self._missing_counts: dict[int, int] = {}
        self._action_latches: dict[str, bool] = {
            "left_hand_up": False,
            "right_hand_up": False,
            "squat": False,
        }
        self._action_enter_counts: dict[str, int] = {}
        self._action_exit_counts: dict[str, int] = {}
        self._movement_state: str = "neutral"
        self._calibration_samples = 0
        self._calibrated = False
        self._neutral_center_x: float | None = None
        self._shoulder_width: float | None = None
        self._torso_length: float | None = None
        self._child_kwargs = {
            "keypoint_confidence": self.keypoint_confidence,
            "arm_raise_ratio": self.arm_raise_ratio,
            "move_dead_zone_ratio": self.move_dead_zone_ratio,
            "squat_ratio": self.squat_ratio,
            "swap_left_right": self.swap_left_right,
            "keypoint_grace_frames": self.keypoint_grace_frames,
            "pose_smoothing_alpha": self.pose_smoothing_alpha,
            "calibration_frames": self.calibration_frames,
            "calibration_adapt_alpha": self.calibration_adapt_alpha,
            "arm_raise_torso_ratio": self.arm_raise_torso_ratio,
            "move_dead_zone_shoulder_ratio": self.move_dead_zone_shoulder_ratio,
            "move_exit_ratio": self.move_exit_ratio,
            "action_enter_frames": self.action_enter_frames,
            "action_exit_frames": self.action_exit_frames,
            "dual_role_enabled": False,
            "role_bind_grace_ms": self.role_bind_grace_ms,
            "enable_multi": False,
        }
        self._person_engines: dict[int, "ActionEngine"] = {}
        self._role_binder = DualRoleBinder(grace_ms=self.role_bind_grace_ms)

    def _point_with_grace(self, keypoints: np.ndarray | None, index: int) -> tuple[float, float] | None:
        if keypoints is not None and keypoints.shape[0] > index:
            x, y, conf = keypoints[index]
            if conf >= self.keypoint_confidence:
                raw_x, raw_y = float(x), float(y)
                previous = self._last_valid_points.get(index)
                if previous is not None and self.pose_smoothing_alpha < 0.999:
                    alpha = self.pose_smoothing_alpha
                    smoothed = (
                        previous[0] * (1.0 - alpha) + raw_x * alpha,
                        previous[1] * (1.0 - alpha) + raw_y * alpha,
                    )
                else:
                    smoothed = (raw_x, raw_y)
                self._last_valid_points[index] = smoothed
                self._missing_counts[index] = 0
                return smoothed

        miss = self._missing_counts.get(index, 0) + 1
        self._missing_counts[index] = miss
        previous = self._last_valid_points.get(index)
        if previous is not None and miss <= self.keypoint_grace_frames:
            return previous

        self._last_valid_points[index] = None
        return None

    def _apply_debounce(self, name: str, candidate: bool) -> bool:
        current = self._action_latches.get(name, False)
        if candidate == current:
            self._action_enter_counts[name] = 0
            self._action_exit_counts[name] = 0
            return current

        if candidate:
            enter_count = self._action_enter_counts.get(name, 0) + 1
            self._action_enter_counts[name] = enter_count
            self._action_exit_counts[name] = 0
            if enter_count >= self.action_enter_frames:
                self._action_latches[name] = True
                self._action_enter_counts[name] = 0
                self._action_exit_counts[name] = 0
        else:
            exit_count = self._action_exit_counts.get(name, 0) + 1
            self._action_exit_counts[name] = exit_count
            self._action_enter_counts[name] = 0
            if exit_count >= self.action_exit_frames:
                self._action_latches[name] = False
                self._action_enter_counts[name] = 0
                self._action_exit_counts[name] = 0

        return self._action_latches.get(name, False)

    def _update_calibration(
        self,
        left_shoulder: tuple[float, float] | None,
        right_shoulder: tuple[float, float] | None,
        left_hip: tuple[float, float] | None,
        right_hip: tuple[float, float] | None,
    ) -> None:
        if not (left_shoulder and right_shoulder and left_hip and right_hip):
            return

        center_x = (left_shoulder[0] + right_shoulder[0] + left_hip[0] + right_hip[0]) / 4.0
        shoulder_width = abs(right_shoulder[0] - left_shoulder[0])
        shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2.0
        hip_y = (left_hip[1] + right_hip[1]) / 2.0
        torso_length = max(1.0, abs(hip_y - shoulder_y))

        if self._neutral_center_x is None:
            self._neutral_center_x = center_x
            self._shoulder_width = shoulder_width
            self._torso_length = torso_length
        else:
            alpha = self.calibration_adapt_alpha
            self._neutral_center_x = self._neutral_center_x * (1.0 - alpha) + center_x * alpha
            self._shoulder_width = (self._shoulder_width or shoulder_width) * (1.0 - alpha) + shoulder_width * alpha
            self._torso_length = (self._torso_length or torso_length) * (1.0 - alpha) + torso_length * alpha

        self._calibration_samples += 1
        if self._calibration_samples >= self.calibration_frames:
            self._calibrated = True

    def infer(self, keypoints: np.ndarray | None, frame_shape: tuple[int, int, int]) -> ActionState:
        state = ActionState()

        height, width = frame_shape[:2]
        base_arm_threshold = height * self.arm_raise_ratio
        base_move_threshold = width * self.move_dead_zone_ratio
        squat_threshold = height * self.squat_ratio

        left_wrist = self._point_with_grace(keypoints, LEFT_WRIST)
        right_wrist = self._point_with_grace(keypoints, RIGHT_WRIST)
        left_shoulder = self._point_with_grace(keypoints, LEFT_SHOULDER)
        right_shoulder = self._point_with_grace(keypoints, RIGHT_SHOULDER)
        left_hip = self._point_with_grace(keypoints, LEFT_HIP)
        right_hip = self._point_with_grace(keypoints, RIGHT_HIP)
        left_knee = self._point_with_grace(keypoints, LEFT_KNEE)
        right_knee = self._point_with_grace(keypoints, RIGHT_KNEE)

        if self._torso_length is not None:
            base_arm_threshold = max(base_arm_threshold * 0.6, self._torso_length * self.arm_raise_torso_ratio)
        if self._shoulder_width is not None:
            base_move_threshold = max(base_move_threshold, self._shoulder_width * self.move_dead_zone_shoulder_ratio)

        if self.swap_left_right:
            left_wrist, right_wrist = right_wrist, left_wrist
            left_shoulder, right_shoulder = right_shoulder, left_shoulder
            left_hip, right_hip = right_hip, left_hip
            left_knee, right_knee = right_knee, left_knee

        if left_wrist:
            state.left_hand = (int(left_wrist[0]), int(left_wrist[1]))
        if right_wrist:
            state.right_hand = (int(right_wrist[0]), int(right_wrist[1]))

        arm_hysteresis = max(2.0, base_arm_threshold * 0.3)
        if left_wrist and left_shoulder:
            left_margin = left_shoulder[1] - left_wrist[1]
            left_candidate = left_margin >= base_arm_threshold
            if self._action_latches.get("left_hand_up", False):
                left_candidate = left_margin >= (base_arm_threshold - arm_hysteresis)
            state.left_hand_up = self._apply_debounce("left_hand_up", left_candidate)
        else:
            state.left_hand_up = self._apply_debounce("left_hand_up", False)

        if right_wrist and right_shoulder:
            right_margin = right_shoulder[1] - right_wrist[1]
            right_candidate = right_margin >= base_arm_threshold
            if self._action_latches.get("right_hand_up", False):
                right_candidate = right_margin >= (base_arm_threshold - arm_hysteresis)
            state.right_hand_up = self._apply_debounce("right_hand_up", right_candidate)
        else:
            state.right_hand_up = self._apply_debounce("right_hand_up", False)

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
            neutral_center = self._neutral_center_x if (self._calibrated and self._neutral_center_x is not None) else width / 2.0
            enter_threshold = base_move_threshold
            exit_threshold = base_move_threshold * self.move_exit_ratio
            offset = cx - neutral_center
            if self._movement_state == "neutral":
                if offset <= -enter_threshold:
                    self._movement_state = "left"
                elif offset >= enter_threshold:
                    self._movement_state = "right"
            elif self._movement_state == "left":
                if offset >= -exit_threshold:
                    self._movement_state = "neutral"
            else:
                if offset <= exit_threshold:
                    self._movement_state = "neutral"
            state.move_left = self._movement_state == "left"
            state.move_right = self._movement_state == "right"
        else:
            self._movement_state = "neutral"

        if left_hip and right_hip and left_knee and right_knee:
            hip_y = (left_hip[1] + right_hip[1]) / 2.0
            knee_y = (left_knee[1] + right_knee[1]) / 2.0
            squat_metric = hip_y - knee_y
            squat_enter = -squat_threshold
            squat_hysteresis = max(2.0, squat_threshold * 0.35)
            squat_candidate = squat_metric >= squat_enter
            if self._action_latches.get("squat", False):
                squat_candidate = squat_metric >= (squat_enter - squat_hysteresis)
            state.squat = self._apply_debounce("squat", squat_candidate)
        else:
            state.squat = self._apply_debounce("squat", False)

        if keypoints is not None and keypoints.shape[0] > RIGHT_KNEE:
            tracked_indexes = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE]
            visible = 0
            for index in tracked_indexes:
                conf = float(keypoints[index][2])
                if conf >= self.keypoint_confidence:
                    visible += 1
            state.tracking_quality = visible / len(tracked_indexes)
        else:
            state.tracking_quality = 0.0
        self._update_calibration(left_shoulder, right_shoulder, left_hip, right_hip)
        state.calibrated = self._calibrated
        state.calibration_progress = min(1.0, self._calibration_samples / self.calibration_frames)

        return state

    def _engine_for_track(self, track_id: int) -> "ActionEngine":
        child = self._person_engines.get(track_id)
        if child is None:
            child = ActionEngine(**self._child_kwargs)
            self._person_engines[track_id] = child
        return child

    @staticmethod
    def _extract_track_id(person: Any, fallback_idx: int) -> int:
        track_id = getattr(person, "track_id", None)
        if track_id is None:
            return -(fallback_idx + 1)
        return int(track_id)

    @staticmethod
    def _extract_keypoints(person: Any) -> np.ndarray | None:
        return getattr(person, "keypoints", None)

    @staticmethod
    def _extract_bbox(person: Any) -> tuple[float, float, float, float] | None:
        bbox = getattr(person, "bbox", None)
        if bbox is None:
            return None
        if isinstance(bbox, tuple) and len(bbox) == 4:
            return tuple(float(v) for v in bbox)
        return None

    @staticmethod
    def _extract_score(person: Any) -> float:
        score = getattr(person, "score", 0.0)
        try:
            return float(score)
        except Exception:
            return 0.0

    @staticmethod
    def _copy_action_state(state: ActionState) -> ActionState:
        return ActionState(
            left_hand_up=state.left_hand_up,
            right_hand_up=state.right_hand_up,
            both_hands_up=state.both_hands_up,
            squat=state.squat,
            move_left=state.move_left,
            move_right=state.move_right,
            body_center=state.body_center,
            left_hand=state.left_hand,
            right_hand=state.right_hand,
            tracking_quality=state.tracking_quality,
            calibrated=state.calibrated,
            calibration_progress=state.calibration_progress,
        )

    def infer_multi(
        self,
        persons: list[Any] | None,
        frame_shape: tuple[int, int, int],
        *,
        now: float | None = None,
        primary_track_id: int | None = None,
    ) -> MultiActionOutput:
        if persons is None:
            persons = []
        person_states: list[PersonActionState] = []
        for idx, person in enumerate(persons):
            track_id = self._extract_track_id(person, idx)
            keypoints = self._extract_keypoints(person)
            bbox = self._extract_bbox(person)
            score = self._extract_score(person)
            engine = self._engine_for_track(track_id)
            action = engine.infer(keypoints, frame_shape)
            person_states.append(
                PersonActionState(
                    track_id=track_id,
                    role=None,
                    action=action,
                    score=score,
                    bbox=bbox,
                    is_primary=False,
                )
            )

        role_view: dict[str, PersonActionState | None]
        if self.dual_role_enabled and self.enable_multi:
            now_ms = (time.monotonic() * 1000.0) if now is None else (float(now) * 1000.0)
            role_view = self._role_binder.assign(person_states, now_ms=now_ms)
        else:
            role_view = {"p1": None, "p2": None}

        primary_state: ActionState | None = None
        if primary_track_id is not None:
            for person in person_states:
                if person.track_id == int(primary_track_id):
                    person.is_primary = True
                    primary_state = self._copy_action_state(person.action)
                    break
        if primary_state is None and person_states:
            person_states[0].is_primary = True
            primary_state = self._copy_action_state(person_states[0].action)

        if primary_state is None:
            primary_state = ActionState()

        return MultiActionOutput(
            primary_action=primary_state,
            persons=person_states,
            roles=role_view,
        )
