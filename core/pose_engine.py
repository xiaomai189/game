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
    def __init__(
        self,
        model_path: Path,
        device: str = "cpu",
        conf: float = 0.5,
        track_stickiness: float = 0.65,
        track_memory_frames: int = 10,
    ) -> None:
        self.model_path = model_path
        self.device = device
        self.conf = conf
        self.track_stickiness = float(max(0.0, min(1.0, track_stickiness)))
        self.track_memory_frames = max(0, int(track_memory_frames))
        self._model = None
        self._warning: str | None = None
        self._last_primary_center: tuple[float, float] | None = None
        self._frames_since_primary_seen = 0
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
            self._frames_since_primary_seen += 1
            if self._frames_since_primary_seen > self.track_memory_frames:
                self._last_primary_center = None
            return PoseOutput(keypoints=None, warning=None)

        xy = result.keypoints.xy
        conf = result.keypoints.conf
        boxes = result.boxes.xyxy
        if xy is None or conf is None or boxes is None:
            self._frames_since_primary_seen += 1
            if self._frames_since_primary_seen > self.track_memory_frames:
                self._last_primary_center = None
            return PoseOutput(keypoints=None, warning=None)
        if len(xy) == 0:
            self._frames_since_primary_seen += 1
            if self._frames_since_primary_seen > self.track_memory_frames:
                self._last_primary_center = None
            return PoseOutput(keypoints=None, warning=None)

        xy_np = xy.cpu().numpy()
        conf_np = conf.cpu().numpy()
        boxes_np = boxes.cpu().numpy()

        idx = self._select_primary_index(
            boxes_np=boxes_np,
            previous_center=self._last_primary_center,
            stickiness=self.track_stickiness,
        )
        picked = boxes_np[idx]
        self._last_primary_center = (
            float((picked[0] + picked[2]) * 0.5),
            float((picked[1] + picked[3]) * 0.5),
        )
        self._frames_since_primary_seen = 0

        selected_xy = xy_np[idx]
        selected_conf = conf_np[idx].reshape(-1, 1)
        keypoints = np.hstack((selected_xy, selected_conf))
        return PoseOutput(keypoints=keypoints, warning=None)

    @staticmethod
    def _select_primary_index(
        boxes_np: np.ndarray,
        previous_center: tuple[float, float] | None,
        stickiness: float,
    ) -> int:
        if boxes_np.shape[0] == 1:
            return 0

        widths = np.maximum(1.0, boxes_np[:, 2] - boxes_np[:, 0])
        heights = np.maximum(1.0, boxes_np[:, 3] - boxes_np[:, 1])
        areas = widths * heights
        area_max = float(np.max(areas))
        area_scores = areas / max(1e-6, area_max)

        if previous_center is None or stickiness <= 0.0:
            return int(np.argmax(area_scores))

        centers_x = (boxes_np[:, 0] + boxes_np[:, 2]) * 0.5
        centers_y = (boxes_np[:, 1] + boxes_np[:, 3]) * 0.5
        dx = centers_x - previous_center[0]
        dy = centers_y - previous_center[1]
        distances = np.sqrt(dx * dx + dy * dy)
        diag_ref = float(np.mean(np.sqrt(widths * widths + heights * heights)))
        distance_scores = 1.0 / (1.0 + (distances / max(1e-6, diag_ref)))

        combined = (1.0 - stickiness) * area_scores + stickiness * distance_scores
        return int(np.argmax(combined))
