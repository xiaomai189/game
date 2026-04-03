from core.game_engine import GameSnapshot
from main import _build_demo_action, _parse_camera_sources


def make_snapshot(status: str = "RUNNING") -> GameSnapshot:
    return GameSnapshot(
        status=status,  # type: ignore[arg-type]
        score=0,
        hits=0,
        target=(320, 180),
        target_radius=60,
        countdown_sec=30.0,
        last_hit_ts=None,
    )


def test_demo_action_defaults_to_neutral() -> None:
    snapshot = make_snapshot("RUNNING")
    state = _build_demo_action(snapshot, frame_count=0)
    assert state.left_hand_up is False
    assert state.right_hand_up is False
    assert state.move_left is False
    assert state.move_right is False


def test_demo_action_can_enable_auto_actions() -> None:
    snapshot = make_snapshot("RUNNING")
    state = _build_demo_action(snapshot, frame_count=0, auto_actions=True)
    assert state.right_hand_up is True
    assert state.right_hand == snapshot.target
    assert state.move_left is True


def test_parse_camera_sources_handles_mixed_values_and_dedup() -> None:
    parsed = _parse_camera_sources(
        "0, 1, rtsp://127.0.0.1/live,1,0",
        fallback_index=0,
        max_cameras=4,
    )
    assert parsed == [0, 1, "rtsp://127.0.0.1/live"]


def test_parse_camera_sources_falls_back_to_default() -> None:
    parsed = _parse_camera_sources("", fallback_index=3, max_cameras=2)
    assert parsed == [3]


def test_parse_camera_sources_respects_max_cameras() -> None:
    parsed = _parse_camera_sources("0,1,2,3", fallback_index=0, max_cameras=2)
    assert parsed == [0, 1]
