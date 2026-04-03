from core.action_engine import ActionState, PersonActionState
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
        pipeline={
            "captureFps": 29.1,
            "inferFps": 19.2,
            "renderFps": 30.4,
            "p95LatencyMs": 142.7,
            "frameDropRate": 0.0312,
        },
    )

    assert payload["type"] == "frame"
    assert payload["status"] == "RUNNING"
    assert payload["target"]["x"] == 320
    assert payload["hands"]["leftNorm"] == {"x": 0.1, "y": 0.2}
    assert payload["body"]["centerNorm"] == {"x": 0.3125, "y": 0.2778}
    assert payload["pipeline"]["inferFps"] == 19.2


def test_build_web_payload_includes_multi_person_extension() -> None:
    snapshot = GameSnapshot(
        status="RUNNING",
        score=1,
        hits=1,
        target=(300, 200),
        target_radius=60,
        countdown_sec=33.3,
        last_hit_ts=None,
    )
    primary = ActionState(
        right_hand_up=True,
        right_hand=(320, 210),
        body_center=(300, 240),
        tracking_quality=0.9,
        calibrated=True,
        calibration_progress=1.0,
    )
    p1 = PersonActionState(
        track_id=11,
        role="P1",
        action=ActionState(left_hand=(100, 160), body_center=(110, 230)),
        score=0.88,
        bbox=(60.0, 90.0, 170.0, 340.0),
        is_primary=False,
    )
    p2 = PersonActionState(
        track_id=22,
        role="P2",
        action=primary,
        score=0.93,
        bbox=(250.0, 95.0, 370.0, 345.0),
        is_primary=True,
    )

    payload = build_web_payload(
        now=1.0,
        frame_width=640,
        frame_height=360,
        fps=30.0,
        source="camera",
        snapshot=snapshot,
        action_state=primary,
        persons=[p1, p2],
        roles={"p1": p1, "p2": p2},
        pipeline=None,
    )

    assert len(payload["persons"]) == 2
    assert payload["persons"][0]["trackId"] == 11
    assert payload["persons"][1]["trackId"] == 22
    assert payload["roles"]["p1"]["role"] == "P1"
    assert payload["roles"]["p2"]["isPrimary"] is True
