from core.action_engine import ActionState
from core.game_engine import GameEngine


def test_hit_target_increments_score() -> None:
    engine = GameEngine(
        frame_width=640,
        frame_height=480,
        target_radius=40,
        target_spawn_interval_sec=10.0,
        game_duration_sec=30.0,
        hit_cooldown_sec=0.2,
    )
    engine.start(now=0.0)
    engine._target = (120, 140)  # noqa: SLF001

    state = ActionState(left_hand_up=True, left_hand=(120, 140))
    engine.update(state, now=5.0)

    snapshot = engine.snapshot(now=5.0)
    assert snapshot.score == 1
    assert snapshot.hits == 1
    assert snapshot.last_hit_ts == 5.0


def test_no_hit_keeps_score() -> None:
    engine = GameEngine(
        frame_width=640,
        frame_height=480,
        target_radius=40,
        target_spawn_interval_sec=10.0,
        game_duration_sec=30.0,
    )
    engine.start(now=0.0)
    engine._target = (120, 140)  # noqa: SLF001

    state = ActionState(left_hand_up=True, left_hand=(500, 420))
    engine.update(state, now=10.0)

    snapshot = engine.snapshot(now=10.0)
    assert snapshot.score == 0
    assert snapshot.last_hit_ts is None


def test_target_expires_and_respawns() -> None:
    engine = GameEngine(
        frame_width=640,
        frame_height=480,
        target_radius=40,
        target_spawn_interval_sec=5.0,
        game_duration_sec=30.0,
    )
    engine.start(now=0.0)
    engine._target = (100, 100)  # noqa: SLF001
    engine._target_expire_ts = 1.0  # noqa: SLF001
    engine._spawn_target = lambda: (222, 233)  # type: ignore[method-assign]  # noqa: SLF001

    engine.update(ActionState(), now=2.0)
    snapshot = engine.snapshot(now=2.0)

    assert snapshot.target == (222, 233)


def test_hit_cooldown_blocks_repeat_score() -> None:
    engine = GameEngine(
        frame_width=640,
        frame_height=480,
        target_radius=40,
        target_spawn_interval_sec=10.0,
        game_duration_sec=30.0,
        hit_cooldown_sec=1.0,
    )
    engine.start(now=0.0)
    engine._target = (120, 140)  # noqa: SLF001

    state = ActionState(right_hand_up=True, right_hand=(120, 140))
    engine.update(state, now=1.0)
    first_score = engine.snapshot(now=1.0).score
    current_target = engine.snapshot(now=1.0).target
    engine._target = current_target  # noqa: SLF001
    engine.update(state, now=1.3)
    second_score = engine.snapshot(now=1.3).score

    assert first_score == 1
    assert second_score == 1


def test_countdown_reaches_game_over() -> None:
    engine = GameEngine(
        frame_width=640,
        frame_height=480,
        target_radius=40,
        target_spawn_interval_sec=5.0,
        game_duration_sec=3.0,
    )
    engine.start(now=0.0)

    engine.update(ActionState(), now=3.5)
    snapshot = engine.snapshot(now=3.5)

    assert snapshot.status == "GAME_OVER"
    assert snapshot.countdown_sec == 0.0


def test_hit_without_handup_when_gate_disabled() -> None:
    engine = GameEngine(
        frame_width=640,
        frame_height=480,
        target_radius=40,
        target_spawn_interval_sec=10.0,
        game_duration_sec=30.0,
        require_hand_up_for_hit=False,
    )
    engine.start(now=0.0)
    engine._target = (200, 210)  # noqa: SLF001

    state = ActionState(right_hand_up=False, right_hand=(200, 210))
    engine.update(state, now=1.0)
    snapshot = engine.snapshot(now=1.0)

    assert snapshot.score == 1
