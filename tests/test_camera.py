from __future__ import annotations

import pytest

from core import camera as camera_module
from core.camera import CameraConfig, CameraManager


class _FakeCapture:
    def __init__(self, opened: bool) -> None:
        self._opened = opened
        self.released = False
        self.set_calls: list[tuple[int, float]] = []

    def isOpened(self) -> bool:
        return self._opened

    def set(self, key: int, value: float) -> None:
        self.set_calls.append((key, value))

    def read(self):
        return False, None

    def release(self) -> None:
        self.released = True


def test_camera_open_fallback_from_dshow_to_msmf(monkeypatch):
    monkeypatch.setattr(camera_module.cv2, "CAP_DSHOW", 700, raising=False)
    monkeypatch.setattr(camera_module.cv2, "CAP_MSMF", 1400, raising=False)

    calls: list[str] = []

    def fake_video_capture(source, backend=None):
        if backend == 700:
            calls.append("DSHOW")
            return _FakeCapture(False)
        if backend == 1400:
            calls.append("MSMF")
            return _FakeCapture(True)
        calls.append("DEFAULT")
        return _FakeCapture(False)

    monkeypatch.setattr(camera_module.cv2, "VideoCapture", fake_video_capture)

    manager = CameraManager(CameraConfig(source=1))
    manager.open()

    assert calls == ["DSHOW", "MSMF"]
    assert manager.open_attempts == ["DSHOW", "MSMF"]
    assert manager.last_backend_name == "MSMF"


def test_camera_open_raises_when_all_backends_fail(monkeypatch):
    monkeypatch.setattr(camera_module.cv2, "CAP_DSHOW", 700, raising=False)
    monkeypatch.setattr(camera_module.cv2, "CAP_MSMF", 1400, raising=False)

    def fake_video_capture(source, backend=None):
        return _FakeCapture(False)

    monkeypatch.setattr(camera_module.cv2, "VideoCapture", fake_video_capture)

    manager = CameraManager(CameraConfig(source=1))
    with pytest.raises(RuntimeError, match="Tried backends: DSHOW -> MSMF -> DEFAULT"):
        manager.open()


def test_camera_string_source_uses_default_only(monkeypatch):
    calls: list[str] = []

    def fake_video_capture(source, backend=None):
        if backend is None:
            calls.append("DEFAULT")
            return _FakeCapture(True)
        calls.append("OTHER")
        return _FakeCapture(False)

    monkeypatch.setattr(camera_module.cv2, "VideoCapture", fake_video_capture)

    manager = CameraManager(CameraConfig(source="rtsp://demo"))
    manager.open()

    assert calls == ["DEFAULT"]
    assert manager.open_attempts == ["DEFAULT"]
    assert manager.last_backend_name == "DEFAULT"

