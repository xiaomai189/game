from core.game_engine import GameSnapshot
from main import _build_demo_action


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
