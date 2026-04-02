from __future__ import annotations

from dataclasses import dataclass
import math
import random
import time
from typing import Literal

from core.action_engine import ActionState

GameStatus = Literal["READY", "RUNNING", "GAME_OVER"]


@dataclass
class GameSnapshot:
    status: GameStatus
    score: int
    hits: int
    target: tuple[int, int]
    target_radius: int
    countdown_sec: float
    last_hit_ts: float | None


class GameEngine:
    def __init__(
        self,
        frame_width: int,
        frame_height: int,
        target_radius: int = 60,
        target_spawn_interval_sec: float = 2.5,
        game_duration_sec: float = 60.0,
        hit_cooldown_sec: float = 0.45,
        require_hand_up_for_hit: bool = False,
        target_spawn_x_range: tuple[float, float] = (0.25, 0.9),
        target_spawn_y_range: tuple[float, float] = (0.2, 0.82),
    ) -> None:
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.target_radius = target_radius
        self.target_spawn_interval_sec = target_spawn_interval_sec
        self.game_duration_sec = game_duration_sec
        self.hit_cooldown_sec = hit_cooldown_sec
        self.require_hand_up_for_hit = require_hand_up_for_hit
        self.target_spawn_x_range = target_spawn_x_range
        self.target_spawn_y_range = target_spawn_y_range
        self.status: GameStatus = "READY"
        self.score = 0
        self.hits = 0
        self.last_hit_ts: float | None = None
        self._end_ts: float | None = None
        self._target = self._spawn_target()
        self._target_expire_ts = time.monotonic() + self.target_spawn_interval_sec

    def _spawn_target(self) -> tuple[int, int]:
        margin = self.target_radius + 20
        x_min = max(margin, int(self.frame_width * self.target_spawn_x_range[0]))
        x_max = max(x_min, min(self.frame_width - margin, int(self.frame_width * self.target_spawn_x_range[1])))
        y_min = max(margin, int(self.frame_height * self.target_spawn_y_range[0]))
        y_max = max(y_min, min(self.frame_height - margin, int(self.frame_height * self.target_spawn_y_range[1])))
        x = random.randint(x_min, x_max)
        y = random.randint(y_min, y_max)
        return (x, y)

    @staticmethod
    def _inside(point: tuple[int, int], center: tuple[int, int], radius: int) -> bool:
        return math.dist(point, center) <= radius

    def reset(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        self.status = "READY"
        self.score = 0
        self.hits = 0
        self.last_hit_ts = None
        self._end_ts = None
        self._target = self._spawn_target()
        self._target_expire_ts = now + self.target_spawn_interval_sec

    def start(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        if self.status == "RUNNING":
            return
        if self.status == "GAME_OVER":
            self.reset(now)
        self.status = "RUNNING"
        self._end_ts = now + self.game_duration_sec
        self._target_expire_ts = now + self.target_spawn_interval_sec

    def update(self, action_state: ActionState, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        if self.status != "RUNNING":
            return
        if self._end_ts is not None and now >= self._end_ts:
            self.status = "GAME_OVER"
            return
        if now >= self._target_expire_ts:
            self._target = self._spawn_target()
            self._target_expire_ts = now + self.target_spawn_interval_sec

        candidates: list[tuple[int, int]] = []
        if self.require_hand_up_for_hit:
            if action_state.left_hand_up and action_state.left_hand is not None:
                candidates.append(action_state.left_hand)
            if action_state.right_hand_up and action_state.right_hand is not None:
                candidates.append(action_state.right_hand)
        else:
            if action_state.left_hand is not None:
                candidates.append(action_state.left_hand)
            if action_state.right_hand is not None:
                candidates.append(action_state.right_hand)

        if (
            self.last_hit_ts is not None
            and now - self.last_hit_ts < self.hit_cooldown_sec
        ):
            return

        if candidates and any(self._inside(point, self._target, self.target_radius) for point in candidates):
            self.score += 1
            self.hits += 1
            self.last_hit_ts = now
            self._target = self._spawn_target()
            self._target_expire_ts = now + self.target_spawn_interval_sec

    def snapshot(self, now: float | None = None) -> GameSnapshot:
        now = time.monotonic() if now is None else now
        if self.status == "RUNNING" and self._end_ts is not None:
            countdown = max(0.0, self._end_ts - now)
        elif self.status == "READY":
            countdown = self.game_duration_sec
        else:
            countdown = 0.0
        return GameSnapshot(
            status=self.status,
            score=self.score,
            hits=self.hits,
            target=self._target,
            target_radius=self.target_radius,
            countdown_sec=countdown,
            last_hit_ts=self.last_hit_ts,
        )
