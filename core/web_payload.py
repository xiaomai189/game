from __future__ import annotations

from typing import Any

from core.action_engine import ActionState
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


def build_web_payload(
    *,
    now: float,
    frame_width: int,
    frame_height: int,
    fps: float,
    source: str,
    snapshot: GameSnapshot,
    action_state: ActionState,
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
    if pipeline is not None:
        payload["pipeline"] = pipeline
    return payload
