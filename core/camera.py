from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class CameraConfig:
    camera_index: int = 0
    width: int = 1280
    height: int = 720
    mirror: bool = True


class CameraManager:
    def __init__(self, config: CameraConfig) -> None:
        self.config = config
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> None:
        self._cap = cv2.VideoCapture(self.config.camera_index, cv2.CAP_DSHOW)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.height)
        if not self._cap.isOpened():
            raise RuntimeError(
                f"Cannot open camera index={self.config.camera_index}. "
                "Check device connection and permissions."
            )

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
