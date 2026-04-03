from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class CameraConfig:
    camera_index: int = 0
    source: int | str | None = None
    width: int = 1280
    height: int = 720
    mirror: bool = True


class CameraManager:
    def __init__(self, config: CameraConfig) -> None:
        self.config = config
        self._cap: cv2.VideoCapture | None = None
        self.last_backend_name: str | None = None
        self.open_attempts: list[str] = []

    @staticmethod
    def _build_backend_attempts(source: int | str) -> list[tuple[str, int | None]]:
        if isinstance(source, int):
            attempts: list[tuple[str, int | None]] = [("DSHOW", cv2.CAP_DSHOW)]
            cap_msmf = getattr(cv2, "CAP_MSMF", None)
            if isinstance(cap_msmf, int):
                attempts.append(("MSMF", cap_msmf))
            attempts.append(("DEFAULT", None))
            return attempts
        return [("DEFAULT", None)]

    def open(self) -> None:
        source = self.config.source if self.config.source is not None else self.config.camera_index
        self._cap = None
        self.last_backend_name = None
        self.open_attempts = []
        for backend_name, backend in self._build_backend_attempts(source):
            cap = cv2.VideoCapture(source) if backend is None else cv2.VideoCapture(source, backend)
            self.open_attempts.append(backend_name)
            if cap.isOpened():
                self._cap = cap
                self.last_backend_name = backend_name
                break
            cap.release()
        if self._cap is None:
            tried = " -> ".join(self.open_attempts) if self.open_attempts else "none"
            raise RuntimeError(
                f"Cannot open camera source={source!r}. "
                f"Tried backends: {tried}. Check device connection and permissions."
            )
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.height)

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._cap is None:
            raise RuntimeError("Camera is not opened.")

        ok, frame = self._cap.read()
        if not ok:
            return False, None
        if self.config.mirror:
            frame = cv2.flip(frame, 1)
        return True, frame

    def release(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
