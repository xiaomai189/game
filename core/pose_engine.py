from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - handled at runtime
    YOLO = None


@dataclass
class PoseOutput:
    keypoints: np.ndarray | None
    warning: str | None = None


class PoseEngine:
    def __init__(self, model_path: Path, device: str = "cpu", conf: float = 0.5) -> None:
        self.model_path = model_path
        self.device = device
        self.conf = conf
        self._model = None
        self._warning: str | None = None
        self._load_model()

    @property
    def enabled(self) -> bool:
        return self._model is not None

    def _load_model(self) -> None:
        if YOLO is None:
            self._warning = "ultralytics is not available. Pose inference disabled."
            return
        if not self.model_path.exists():
            self._warning = f"Model file not found: {self.model_path}"
            return
        try:
            self._model = YOLO(str(self.model_path))
            self._warning = None
        except Exception as exc:  # pragma: no cover - depends on local runtime
            self._warning = f"Failed to load model: {exc}"
            self._model = None

    def infer(self, frame: np.ndarray) -> PoseOutput:
        if self._model is None:
            return PoseOutput(keypoints=None, warning=self._warning)

        try:
            results = self._model.predict(
                source=frame, conf=self.conf, device=self.device, verbose=False
            )
        except Exception as exc:  # pragma: no cover - depends on local runtime
            return PoseOutput(keypoints=None, warning=f"Inference error: {exc}")

        if not results:
            return PoseOutput(keypoints=None, warning="No inference result.")

        result = results[0]
        if result.keypoints is None or result.boxes is None:
            return PoseOutput(keypoints=None, warning=None)

        xy = result.keypoints.xy
        conf = result.keypoints.conf
        boxes = result.boxes.xyxy
        if xy is None or conf is None or boxes is None:
            return PoseOutput(keypoints=None, warning=None)
        if len(xy) == 0:
            return PoseOutput(keypoints=None, warning=None)

        xy_np = xy.cpu().numpy()
        conf_np = conf.cpu().numpy()
        boxes_np = boxes.cpu().numpy()

        areas = (boxes_np[:, 2] - boxes_np[:, 0]) * (boxes_np[:, 3] - boxes_np[:, 1])
        idx = int(np.argmax(areas))

        selected_xy = xy_np[idx]
        selected_conf = conf_np[idx].reshape(-1, 1)
        keypoints = np.hstack((selected_xy, selected_conf))
        return PoseOutput(keypoints=keypoints, warning=None)
