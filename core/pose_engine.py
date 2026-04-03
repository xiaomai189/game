from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - handled at runtime
    YOLO = None


@dataclass
class PoseOutput:
    keypoints: np.ndarray | None
    persons: list["PosePerson"] = field(default_factory=list)
    primary_track_id: int | None = None
    warning: str | None = None


@dataclass
class PosePerson:
    track_id: int | None
    keypoints: np.ndarray
    bbox: tuple[float, float, float, float]
    score: float


class PoseEngine:
    def __init__(
        self,
        model_path: Path,
        device: str = "cpu",
        conf: float = 0.5,
        track_stickiness: float = 0.65,
        track_memory_frames: int = 10,
        max_persons: int = 2,
        person_select_policy: str = "conf_area",
    ) -> None:
        self.model_path = model_path
        self.device = device
        self.conf = conf
        self.track_stickiness = float(max(0.0, min(1.0, track_stickiness)))
        self.track_memory_frames = max(0, int(track_memory_frames))
        self.max_persons = max(1, int(max_persons))
        self.person_select_policy = person_select_policy
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
        box_conf_np = (
            result.boxes.conf.cpu().numpy()
            if getattr(result.boxes, "conf", None) is not None
            else np.zeros((boxes_np.shape[0],), dtype=float)
        )
        if getattr(result.boxes, "id", None) is not None:
            ids_np = result.boxes.id.cpu().numpy().astype(int)
        else:
            ids_np = np.array([-(i + 1) for i in range(boxes_np.shape[0])], dtype=int)

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
        top_indices = self._select_top_person_indices(
            boxes_np=boxes_np,
            box_conf_np=box_conf_np,
            keypoint_conf_np=conf_np,
            max_persons=self.max_persons,
        )
        if idx not in top_indices:
            if len(top_indices) >= self.max_persons:
                top_indices = top_indices[: self.max_persons - 1]
            top_indices.append(idx)

        persons: list[PosePerson] = []
        for person_idx in top_indices:
            kp_xy = xy_np[person_idx]
            kp_conf = conf_np[person_idx].reshape(-1, 1)
            kp = np.hstack((kp_xy, kp_conf))
            box = boxes_np[person_idx]
            persons.append(
                PosePerson(
                    track_id=int(ids_np[person_idx]),
                    keypoints=kp,
                    bbox=(float(box[0]), float(box[1]), float(box[2]), float(box[3])),
                    score=float(box_conf_np[person_idx]),
                )
            )
        persons.sort(key=lambda p: p.score, reverse=True)
        return PoseOutput(
            keypoints=keypoints,
            persons=persons,
            primary_track_id=int(ids_np[idx]),
            warning=None,
        )

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

    @staticmethod
    def _select_top_person_indices(
        boxes_np: np.ndarray,
        box_conf_np: np.ndarray,
        keypoint_conf_np: np.ndarray,
        max_persons: int,
    ) -> list[int]:
        if boxes_np.shape[0] == 0:
            return []
        max_persons = max(1, int(max_persons))
        widths = np.maximum(1.0, boxes_np[:, 2] - boxes_np[:, 0])
        heights = np.maximum(1.0, boxes_np[:, 3] - boxes_np[:, 1])
        areas = widths * heights
        area_scores = areas / max(1e-6, float(np.max(areas)))
        if keypoint_conf_np.size > 0:
            kp_scores = np.mean(keypoint_conf_np, axis=1)
        else:
            kp_scores = np.zeros((boxes_np.shape[0],), dtype=float)
        det_scores = box_conf_np if box_conf_np.size == boxes_np.shape[0] else np.zeros((boxes_np.shape[0],), dtype=float)
        combined = det_scores * 0.55 + area_scores * 0.3 + kp_scores * 0.15
        ranked = np.argsort(-combined)
        return [int(i) for i in ranked[:max_persons]]
