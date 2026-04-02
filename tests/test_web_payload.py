from core.action_engine import ActionState
from core.game_engine import GameSnapshot
from core.web_payload import build_web_payload


def test_build_web_payload_contains_normalized_points() -> None:
    snapshot = GameSnapshot(
        status="RUNNING",
        score=3,
        hits=2,
        target=(320, 180),
        target_radius=60,
        countdown_sec=12.34,
        last_hit_ts=None,
    )
    action = ActionState(
        left_hand_up=False,
        right_hand_up=True,
        both_hands_up=False,
        squat=False,
        move_left=True,
        move_right=False,
        body_center=(200, 100),
        left_hand=(64, 72),
        right_hand=(320, 200),
    )

    payload = build_web_payload(
        now=123.456,
        frame_width=640,
        frame_height=360,
        fps=28.3,
        source="camera",
        snapshot=snapshot,
        action_state=action,
    )

    assert payload["type"] == "frame"
    assert payload["status"] == "RUNNING"
    assert payload["target"]["x"] == 320
    assert payload["hands"]["leftNorm"] == {"x": 0.1, "y": 0.2}
    assert payload["body"]["centerNorm"] == {"x": 0.3125, "y": 0.2778}
