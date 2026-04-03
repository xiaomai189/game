from __future__ import annotations

from typing import Any

from core.action_engine import ActionState, PersonActionState
from core.game_engine import GameSnapshot


def _point(point: tuple[int, int] | None) -> dict[str, int] | None:
    if point is None:
        return None
    return {"x": int(point[0]), "y": int(point[1])}


def _norm(point: tuple[int, int] | None, frame_width: int, frame_height: int) -> dict[str, float] | None:
    if point is None:
        return None
    if frame_width <= 0 or frame_height <= 0:
        return None
    return {
        "x": round(point[0] / frame_width, 4),
        "y": round(point[1] / frame_height, 4),
    }


def _person_payload(
    person: PersonActionState,
    frame_width: int,
    frame_height: int,
) -> dict[str, Any]:
    action = person.action
    return {
        "trackId": person.track_id,
        "role": person.role,
        "isPrimary": person.is_primary,
        "score": round(float(person.score), 4),
        "bbox": (
            {
                "x1": round(float(person.bbox[0]), 2),
                "y1": round(float(person.bbox[1]), 2),
                "x2": round(float(person.bbox[2]), 2),
                "y2": round(float(person.bbox[3]), 2),
            }
            if person.bbox is not None
            else None
        ),
        "actions": {
            "leftHandUp": action.left_hand_up,
            "rightHandUp": action.right_hand_up,
            "bothHandsUp": action.both_hands_up,
            "squat": action.squat,
            "moveLeft": action.move_left,
            "moveRight": action.move_right,
        },
        "hands": {
            "left": _point(action.left_hand),
            "right": _point(action.right_hand),
            "leftNorm": _norm(action.left_hand, frame_width, frame_height),
            "rightNorm": _norm(action.right_hand, frame_width, frame_height),
        },
        "body": {
            "center": _point(action.body_center),
            "centerNorm": _norm(action.body_center, frame_width, frame_height),
        },
        "quality": {
            "trackingQuality": round(float(action.tracking_quality), 4),
            "calibrated": bool(action.calibrated),
            "calibrationProgress": round(float(action.calibration_progress), 4),
        },
    }


def build_web_payload(
    *,
    now: float,
    frame_width: int,
    frame_height: int,
    fps: float,
    source: str,
    snapshot: GameSnapshot,
    action_state: ActionState,
    persons: list[PersonActionState] | None = None,
    roles: dict[str, PersonActionState | None] | None = None,
    pipeline: dict[str, float] | None = None,
) -> dict[str, Any]:
    left = _point(action_state.left_hand)
    right = _point(action_state.right_hand)
    body = _point(action_state.body_center)
    payload: dict[str, Any] = {
        "type": "frame",
        "ts": round(now, 4),
        "source": source,
        "frame": {"width": frame_width, "height": frame_height},
        "status": snapshot.status,
        "score": snapshot.score,
        "hits": snapshot.hits,
        "countdownSec": round(snapshot.countdown_sec, 2),
        "fps": round(fps, 2),
        "target": {
            "x": int(snapshot.target[0]),
            "y": int(snapshot.target[1]),
            "radius": int(snapshot.target_radius),
        },
        "actions": {
            "leftHandUp": action_state.left_hand_up,
            "rightHandUp": action_state.right_hand_up,
            "bothHandsUp": action_state.both_hands_up,
            "squat": action_state.squat,
            "moveLeft": action_state.move_left,
            "moveRight": action_state.move_right,
        },
        "hands": {
            "left": left,
            "right": right,
            "leftNorm": _norm(action_state.left_hand, frame_width, frame_height),
            "rightNorm": _norm(action_state.right_hand, frame_width, frame_height),
        },
        "body": {
            "center": body,
            "centerNorm": _norm(action_state.body_center, frame_width, frame_height),
        },
    }
    serialized_persons: list[dict[str, Any]] = []
    if persons is not None:
        serialized_persons = [
            _person_payload(person, frame_width, frame_height)
            for person in persons
        ]
    payload["persons"] = serialized_persons
    payload["roles"] = {
        "p1": (
            _person_payload(roles["p1"], frame_width, frame_height)
            if roles is not None and roles.get("p1") is not None
            else None
        ),
        "p2": (
            _person_payload(roles["p2"], frame_width, frame_height)
            if roles is not None and roles.get("p2") is not None
            else None
        ),
    }
    if pipeline is not None:
        payload["pipeline"] = pipeline
    return payload
