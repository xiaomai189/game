from __future__ import annotations

import time


class FpsCounter:
    def __init__(self, smoothing: float = 0.9) -> None:
        self.smoothing = smoothing
        self._last_ts = time.perf_counter()
        self._fps = 0.0

    def tick(self) -> float:
        now = time.perf_counter()
        dt = max(1e-6, now - self._last_ts)
        instant = 1.0 / dt
        if self._fps == 0.0:
            self._fps = instant
        else:
            self._fps = self.smoothing * self._fps + (1.0 - self.smoothing) * instant
        self._last_ts = now
        return self._fps
