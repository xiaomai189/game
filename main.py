from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from config import load_settings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Windows local YOLO pose game prototype")
    parser.add_argument("--camera-index", type=int, default=None)
    parser.add_argument(
        "--camera-sources",
        type=str,
        default=None,
        help="Comma separated camera sources, e.g. '0,1' or '0,rtsp://...'.",
    )
    parser.add_argument(
        "--active-camera-id",
        type=int,
        default=None,
        help="Camera ID used for root payload/game control. Defaults to config value.",
    )
    parser.add_argument("--device", type=str, default=None, help="cpu / cuda:0")
    parser.add_argument("--model", type=str, default=None)
    parser.add_argument(
        "--duration-sec",
        type=float,
        default=0.0,
        help="Override game duration in seconds. 0 means use config value.",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Process at most N frames and exit. 0 means no limit.",
    )
    parser.add_argument(
        "--no-display",
        action="store_true",
        help="Disable OpenCV window for headless smoke testing.",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run synthetic demo mode without camera/model dependency.",
    )
    parser.add_argument(
        "--demo-auto-actions",
        action="store_true",
        help="Enable automatic synthetic lane/hand actions when --demo is set.",
    )
    parser.add_argument(
        "--save-preview",
        type=str,
        default=None,
        help="Save the last rendered frame to an image path.",
    )
    parser.add_argument(
        "--websocket-port",
        type=int,
        default=8765,
        help="WebSocket port for web game bridge.",
    )
    parser.add_argument(
        "--disable-websocket",
        action="store_true",
        help="Disable WebSocket bridge output.",
    )
    parser.add_argument(
        "--show-camera-game-overlay",
        action="store_true",
        help="Show game overlay (target/HUD) in camera window.",
    )
    parser.add_argument(
        "--max-persons",
        type=int,
        default=0,
        help="Maximum persons exported by pose engine. 0 means use config value.",
    )
    parser.add_argument(
        "--role-bind-grace-ms",
        type=float,
        default=0.0,
        help="Dual-role binder grace window in ms. 0 means use config value.",
    )
    parser.add_argument(
        "--disable-dual-role",
        action="store_true",
        help="Disable P1/P2 dual-role assignment in multi-person output.",
    )
    parser.add_argument(
        "--perf-report",
        type=str,
        default=None,
        help="Write runtime performance summary JSON to this path.",
    )
    parser.add_argument(
        "--self-check-sec",
        type=float,
        default=0.0,
        help="Startup dual-camera health self-check window in seconds. 0 means use config value.",
    )
    parser.add_argument(
        "--dual-min-fps",
        type=float,
        default=0.0,
        help="Minimum render/infer FPS threshold for dual readiness. 0 means use config value.",
    )
    parser.add_argument(
        "--max-input-age-ms",
        type=float,
        default=0.0,
        help="Maximum acceptable latency/age in milliseconds for dual readiness. 0 means use config value.",
    )
    parser.add_argument(
        "--auto-degrade",
        type=str,
        choices=["true", "false"],
        default=None,
        help="Enable or disable automatic dual-camera degrade/recover.",
    )
    return parser.parse_args()


def _parse_camera_sources(
    raw: str | None,
    *,
    fallback_index: int,
    max_cameras: int,
) -> list[int | str]:
    if raw is None or raw.strip() == "":
        return [int(fallback_index)]
    max_cameras = max(1, int(max_cameras))
    out: list[int | str] = []
    seen: set[str] = set()
    for token in raw.split(","):
        part = token.strip()
        if not part:
            continue
        if part.lstrip("-").isdigit():
            source: int | str = int(part)
        else:
            source = part
        key = str(source)
        if key in seen:
            continue
        seen.add(key)
        out.append(source)
        if len(out) >= max_cameras:
            break
    if not out:
        return [int(fallback_index)]
    return out


def _resolve_camera_sources(args: argparse.Namespace, settings) -> list[int | str]:
    if args.camera_sources is not None:
        return _parse_camera_sources(
            args.camera_sources,
            fallback_index=settings.camera_index,
            max_cameras=settings.max_cameras,
        )
    if args.camera_index is not None:
        return [int(args.camera_index)]
    configured = ",".join(str(v) for v in settings.camera_sources)
    return _parse_camera_sources(
        configured,
        fallback_index=settings.camera_index,
        max_cameras=settings.max_cameras,
    )


def _camera_source_label(source: int | str) -> str:
    if isinstance(source, int):
        return f"camera:{source}"
    return f"camera:{source}"


def _build_demo_frame(width: int, height: int, frame_count: int, cv2) -> "object":
    import numpy as np

    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:, :, 0] = 26
    frame[:, :, 1] = 38
    frame[:, :, 2] = 52

    band_y = int((frame_count * 3) % max(1, height))
    cv2.rectangle(frame, (0, max(0, band_y - 32)), (width, min(height, band_y + 32)), (40, 60, 85), -1)
    cv2.putText(
        frame,
        "DEMO MODE (Synthetic Input)",
        (32, height - 36),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (180, 220, 255),
        2,
        cv2.LINE_AA,
    )
    return frame


def _build_demo_action(snapshot, frame_count: int, auto_actions: bool = False):
    from core.action_engine import ActionState

    state = ActionState()
    if snapshot.status != "RUNNING" or not auto_actions:
        return state

    burst = frame_count % 24
    if burst < 2:
        state.right_hand_up = True
        state.right_hand = snapshot.target
    else:
        state.right_hand_up = False
        state.right_hand = (snapshot.target[0], min(snapshot.target[1] + 120, 9999))

    if (frame_count // 30) % 2 == 0:
        state.move_left = True
    else:
        state.move_right = True
    return state


def _resize_for_inference(frame, scale: float, cv2):
    if scale >= 0.999:
        return frame, 1.0
    height, width = frame.shape[:2]
    resized = cv2.resize(
        frame,
        (max(64, int(width * scale)), max(64, int(height * scale))),
        interpolation=cv2.INTER_LINEAR,
    )
    return resized, scale


def _rescale_keypoints(keypoints, applied_scale: float):
    if keypoints is None or applied_scale >= 0.999:
        return keypoints
    inv = 1.0 / applied_scale
    out = keypoints.copy()
    out[:, 0] *= inv
    out[:, 1] *= inv
    return out


def _build_action_engine(settings, *, dual_role_enabled: bool, role_bind_grace_ms: float):
    from core.action_engine import ActionEngine

    return ActionEngine(
        keypoint_confidence=settings.keypoint_confidence,
        arm_raise_ratio=settings.arm_raise_ratio,
        move_dead_zone_ratio=settings.move_dead_zone_ratio,
        squat_ratio=settings.squat_ratio,
        swap_left_right=settings.mirror,
        keypoint_grace_frames=settings.keypoint_grace_frames,
        pose_smoothing_alpha=settings.pose_smoothing_alpha,
        calibration_frames=settings.calibration_frames,
        calibration_adapt_alpha=settings.calibration_adapt_alpha,
        arm_raise_torso_ratio=settings.arm_raise_torso_ratio,
        move_dead_zone_shoulder_ratio=settings.move_dead_zone_shoulder_ratio,
        move_exit_ratio=settings.move_exit_ratio,
        action_enter_frames=settings.action_enter_frames,
        action_exit_frames=settings.action_exit_frames,
        dual_role_enabled=dual_role_enabled,
        role_bind_grace_ms=role_bind_grace_ms,
    )


def _build_quality_controller(
    settings,
    *,
    latency_budget_ms: float,
    inference_stride: int,
    adaptive_min_scale: float,
    initial_infer_scale: float,
):
    from core.utils import RuntimeQualityController

    if not settings.adaptive_resolution_enabled:
        return None
    return RuntimeQualityController.create(
        base_inference_stride=inference_stride,
        min_scale=adaptive_min_scale,
        initial_scale=initial_infer_scale,
        max_stride=settings.adaptive_max_stride_frames,
        scale_step=settings.adaptive_scale_step,
        low_health_threshold=settings.adaptive_low_health_threshold,
        high_health_threshold=settings.adaptive_high_health_threshold,
        adjust_interval_frames=settings.adaptive_adjust_interval_frames,
        target_render_fps=settings.health_target_render_fps,
        latency_budget_ms=latency_budget_ms,
        max_drop_rate=settings.health_max_drop_rate,
    )


def _select_fallback_camera(
    connected_ids: list[int],
    camera_runtime: dict[int, dict[str, Any]],
) -> int | None:
    if not connected_ids:
        return None
    ranked_ids = sorted(
        connected_ids,
        key=lambda camera_id: (
            0 if camera_runtime[camera_id].get("health_level") == "ok" else 1,
            -float(camera_runtime[camera_id].get("runtime_health_score", 0.0)),
        ),
    )
    return ranked_ids[0]


def _frame_luma_stats(frame, cv2) -> tuple[float, float]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(gray.mean()), float(gray.std())


def _detect_black_frame(
    frame,
    *,
    mean_threshold: float,
    std_threshold: float,
    cv2,
) -> tuple[bool, float, float]:
    mean, std = _frame_luma_stats(frame, cv2)
    is_black = mean < mean_threshold and std < std_threshold
    return is_black, mean, std


def _build_dual_display_screen(
    *,
    preview_renderer,
    camera_runtime: dict[int, dict[str, Any]],
    camera_source_labels: dict[int, str],
    snapshot,
    fps: float,
    active_camera_id: int,
    cv2,
):
    import numpy as np
    from core.renderer import RenderInput

    camera_ids = sorted(camera_runtime.keys())
    if len(camera_ids) < 2:
        return None

    frame_shapes = [
        runtime["last_frame"].shape[:2]
        for runtime in camera_runtime.values()
        if runtime.get("last_frame") is not None
    ]
    if not frame_shapes:
        return None
    base_h = max(shape[0] for shape in frame_shapes)
    base_w = max(shape[1] for shape in frame_shapes)

    panels: list[Any] = []
    for camera_id in camera_ids[:2]:
        runtime = camera_runtime[camera_id]
        frame = runtime.get("last_frame")
        if frame is None:
            panel_frame = np.zeros((base_h, base_w, 3), dtype=np.uint8)
        else:
            panel_frame = frame
            if panel_frame.shape[0] != base_h or panel_frame.shape[1] != base_w:
                panel_frame = cv2.resize(panel_frame, (base_w, base_h), interpolation=cv2.INTER_LINEAR)

        panel = preview_renderer.render(
            RenderInput(
                frame=panel_frame,
                keypoints=runtime.get("last_keypoints"),
                action_state=runtime["last_action_state"],
                snapshot=snapshot,
                fps=fps,
                warning=runtime.get("last_warning"),
            )
        )
        top_color = (40, 170, 70) if runtime.get("connected") else (80, 80, 80)
        cv2.rectangle(panel, (0, 0), (panel.shape[1], 52), top_color, -1)
        source_label = camera_source_labels.get(camera_id, f"camera:{camera_id}")
        cv2.putText(
            panel,
            f"P{camera_id} {source_label}",
            (14, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.68,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        pipeline = runtime["pipeline_stats"].snapshot()
        cv2.putText(
            panel,
            (
                f"{'online' if runtime.get('connected') else 'offline'} "
                f"{str(runtime.get('camera_status', 'unknown')).upper()} "
                f"h:{float(runtime.get('runtime_health_score', 0.0)):.0f} "
                f"rf:{float(pipeline.get('renderFps', 0.0)):.1f} "
                f"if:{float(pipeline.get('inferFps', 0.0)):.1f}"
            ),
            (14, 46),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (240, 240, 240),
            1,
            cv2.LINE_AA,
        )
        if camera_id == active_camera_id:
            cv2.rectangle(panel, (2, 2), (panel.shape[1] - 2, panel.shape[0] - 2), (20, 220, 255), 3)
        panels.append(panel)

    screen = cv2.hconcat(panels)
    summary_bar_h = 36
    summary = np.zeros((summary_bar_h, screen.shape[1], 3), dtype=np.uint8)
    summary[:, :, 0] = 24
    summary[:, :, 1] = 30
    summary[:, :, 2] = 42
    status_tokens = []
    for camera_id in camera_ids[:2]:
        status = str(camera_runtime[camera_id].get("camera_status", "unknown")).upper()
        status_tokens.append(f"cam{camera_id}:{status}")
    cv2.putText(
        summary,
        (
            f"Status:{snapshot.status} Time:{snapshot.countdown_sec:05.1f}s "
            f"Score:{snapshot.score} Hits:{snapshot.hits} FPS:{fps:.1f} "
            f"Active:cam{active_camera_id} {' '.join(status_tokens)}"
        ),
        (14, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.62,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    return cv2.vconcat([summary, screen])


def _fit_for_display(screen, *, max_width: int, max_height: int, cv2):
    h, w = screen.shape[:2]
    if h <= 0 or w <= 0:
        return screen
    scale = min(float(max_width) / float(w), float(max_height) / float(h), 1.0)
    if scale >= 0.999:
        return screen
    target_w = max(320, int(w * scale))
    target_h = max(240, int(h * scale))
    return cv2.resize(screen, (target_w, target_h), interpolation=cv2.INTER_AREA)


def main() -> int:
    args = parse_args()

    try:
        import cv2
    except ModuleNotFoundError:
        print(
            "Missing dependency: opencv-python. "
            "Run 'pip install -r requirements.txt' first.",
            file=sys.stderr,
        )
        return 1

    from core.action_engine import ActionState
    from core.camera import CameraConfig, CameraManager
    from core.game_engine import GameEngine
    from core.pose_engine import PoseEngine
    from core.renderer import RenderInput, Renderer
    from core.utils import (
        CameraHealthState,
        CameraHealthThresholds,
        DualRuntimeGuard,
        FpsCounter,
        PipelineStats,
        assess_camera_health,
    )
    from core.web_bridge import WebGameBridge
    from core.web_payload import build_web_payload

    settings = load_settings()
    camera_sources = _resolve_camera_sources(args, settings)
    active_camera_id_target = settings.active_camera_id if args.active_camera_id is None else int(args.active_camera_id)
    model_path = settings.model_path if args.model is None else Path(args.model)
    model_device = settings.model_device if args.device is None else args.device
    game_duration = settings.game_duration_sec if args.duration_sec <= 0 else args.duration_sec
    max_persons = settings.max_persons if args.max_persons <= 0 else args.max_persons
    role_bind_grace_ms = settings.role_bind_grace_ms if args.role_bind_grace_ms <= 0 else args.role_bind_grace_ms
    dual_role_enabled = settings.dual_role_enabled and (not args.disable_dual_role)

    inference_stride = max(1, int(settings.inference_stride_frames))
    latency_budget_ms = float(settings.latency_budget_ms)
    drop_stale_frames = bool(settings.drop_stale_frames)
    downscale_ratio = max(0.4, min(1.0, float(settings.inference_downscale_ratio)))
    adaptive_min_scale = max(0.4, min(1.0, min(downscale_ratio, float(settings.adaptive_min_scale))))
    self_check_sec = float(settings.startup_self_check_sec) if args.self_check_sec <= 0 else float(args.self_check_sec)
    if args.dual_min_fps > 0:
        dual_min_render_fps = float(args.dual_min_fps)
        dual_min_infer_fps = float(args.dual_min_fps)
    else:
        dual_min_render_fps = float(settings.dual_min_render_fps)
        dual_min_infer_fps = float(settings.dual_min_infer_fps)
    max_input_age_ms = float(settings.max_input_age_ms) if args.max_input_age_ms <= 0 else float(args.max_input_age_ms)
    auto_degrade = (
        bool(settings.auto_degrade_enabled)
        if args.auto_degrade is None
        else args.auto_degrade.strip().lower() == "true"
    )
    health_thresholds = CameraHealthThresholds(
        min_render_fps=max(1.0, dual_min_render_fps),
        min_infer_fps=max(1.0, dual_min_infer_fps),
        max_p95_latency_ms=max(50.0, max_input_age_ms),
        min_health_score=max(1.0, float(settings.dual_min_health_score)),
    )

    game_engine = GameEngine(
        frame_width=settings.frame_width,
        frame_height=settings.frame_height,
        target_radius=settings.target_radius,
        target_spawn_interval_sec=settings.target_spawn_interval_sec,
        game_duration_sec=game_duration,
        hit_cooldown_sec=settings.hit_cooldown_sec,
        require_hand_up_for_hit=settings.require_hand_up_for_hit,
        target_spawn_x_range=(settings.target_spawn_x_min_ratio, settings.target_spawn_x_max_ratio),
        target_spawn_y_range=(settings.target_spawn_y_min_ratio, settings.target_spawn_y_max_ratio),
    )
    renderer = Renderer(
        keypoint_confidence=settings.keypoint_confidence,
        show_game_overlay=(settings.show_camera_game_overlay or args.show_camera_game_overlay),
    )
    preview_renderer = Renderer(
        keypoint_confidence=settings.keypoint_confidence,
        show_game_overlay=False,
    )
    render_fps_counter = FpsCounter()

    camera_managers: dict[int, CameraManager] = {}
    camera_source_labels: dict[int, str] = {}
    camera_runtime: dict[int, dict[str, Any]] = {}

    if args.demo:
        camera_source_labels[0] = "demo:synthetic"
        camera_runtime[0] = {
            "connected": True,
            "last_frame": None,
            "last_keypoints": None,
            "last_warning": "Demo mode: synthetic actions are feeding the game loop.",
            "last_action_state": ActionState(),
            "last_persons": [],
            "last_roles": {"p1": None, "p2": None},
            "last_pose_persons": [],
            "last_primary_track_id": None,
            "capture_fps_counter": FpsCounter(),
            "infer_fps_counter": FpsCounter(),
            "process_fps_counter": FpsCounter(),
            "pipeline_stats": PipelineStats(),
            "quality_controller": None,
            "runtime_stride": inference_stride,
            "infer_scale": downscale_ratio,
            "health_level": "ok",
            "health_reason": "demo",
            "runtime_health_score": 100.0,
            "camera_status": "OK",
            "camera_status_reason": "demo",
            "black_frame_streak": 0,
            "last_frame_mean": 80.0,
            "last_frame_std": 20.0,
            "reconnect_attempts": 0,
            "last_reconnect_at": None,
            "started_at": time.monotonic(),
            "tracking_quality": 1.0,
            "calibration_progress": 1.0,
            "frame_count": 0,
            "action_engine": _build_action_engine(
                settings,
                dual_role_enabled=dual_role_enabled,
                role_bind_grace_ms=role_bind_grace_ms,
            ),
            "pose_engine": None,
        }
    else:
        for camera_id, source in enumerate(camera_sources):
            camera_config = CameraConfig(
                camera_index=settings.camera_index,
                source=source,
                width=settings.frame_width,
                height=settings.frame_height,
                mirror=settings.mirror,
                fps=settings.camera_fps,
                buffer_size=settings.camera_buffer_size,
                fourcc=settings.camera_fourcc,
                validation_frames=settings.camera_validation_frames,
                black_frame_mean_threshold=settings.camera_black_frame_mean_threshold,
                black_frame_std_threshold=settings.camera_black_frame_std_threshold,
            )
            camera = CameraManager(camera_config)
            try:
                camera.open()
            except RuntimeError as exc:
                print(f"Camera[{camera_id}] skipped: {exc}", file=sys.stderr)
                continue
            backend_name = camera.last_backend_name or "unknown"
            print(f"Camera[{camera_id}] ready: source={source!r} backend={backend_name}")
            camera_managers[camera_id] = camera
            camera_source_labels[camera_id] = _camera_source_label(source)
            camera_runtime[camera_id] = {
                "connected": True,
                "last_frame": None,
                "last_keypoints": None,
                "last_warning": None,
                "last_action_state": ActionState(),
                "last_persons": [],
                "last_roles": {"p1": None, "p2": None},
                "last_pose_persons": [],
                "last_primary_track_id": None,
                "capture_fps_counter": FpsCounter(),
                "infer_fps_counter": FpsCounter(),
                "process_fps_counter": FpsCounter(),
                "pipeline_stats": PipelineStats(),
                "quality_controller": _build_quality_controller(
                    settings,
                    latency_budget_ms=latency_budget_ms,
                    inference_stride=inference_stride,
                    adaptive_min_scale=adaptive_min_scale,
                    initial_infer_scale=downscale_ratio,
                ),
                "runtime_stride": inference_stride,
                "infer_scale": downscale_ratio,
                "health_level": "unknown",
                "health_reason": "warming-up",
                "runtime_health_score": 100.0,
                "camera_status": "WARMUP",
                "camera_status_reason": "startup",
                "black_frame_streak": 0,
                "last_frame_mean": 0.0,
                "last_frame_std": 0.0,
                "reconnect_attempts": 0,
                "last_reconnect_at": None,
                "started_at": time.monotonic(),
                "tracking_quality": 1.0,
                "calibration_progress": 1.0,
                "frame_count": 0,
                "action_engine": _build_action_engine(
                    settings,
                    dual_role_enabled=dual_role_enabled,
                    role_bind_grace_ms=role_bind_grace_ms,
                ),
                "pose_engine": PoseEngine(
                    model_path=model_path,
                    device=model_device,
                    conf=settings.model_confidence,
                    track_stickiness=settings.pose_track_stickiness,
                    track_memory_frames=settings.pose_track_memory_frames,
                    max_persons=max_persons,
                    person_select_policy=settings.person_select_policy,
                ),
            }
        if not camera_managers:
            print("Camera initialization failed: no available camera sources.", file=sys.stderr)
            return 2

    dual_guard = DualRuntimeGuard.create(
        camera_count=len(camera_runtime),
        auto_degrade=auto_degrade,
        self_check_seconds=max(0.0, self_check_sec),
        bad_hold_seconds=max(0.5, float(settings.degrade_trigger_sec)),
        recovery_seconds=max(0.5, float(settings.degrade_recovery_sec)),
    )
    camera_health_by_id: dict[int, Any] = {}
    if dual_guard.dual_requested:
        print(
            "Dual guard enabled: "
            f"self_check={self_check_sec:.1f}s min_render_fps={health_thresholds.min_render_fps:.1f} "
            f"min_infer_fps={health_thresholds.min_infer_fps:.1f} max_age={max_input_age_ms:.0f}ms "
            f"auto_degrade={auto_degrade}"
        )

    ws_bridge: WebGameBridge | None = None
    if not args.disable_websocket:
        try:
            ws_bridge = WebGameBridge(port=args.websocket_port)
            ws_bridge.start()
            print(f"Web bridge ready: ws://127.0.0.1:{args.websocket_port}")
        except Exception as exc:
            print(f"Web bridge disabled due to startup error: {exc}", file=sys.stderr)
            ws_bridge = None

    frame_count = 0
    last_screen = None
    active_camera_id = active_camera_id_target
    window_name = "YOLO Pose Game Prototype"
    display_max_width = 1280
    display_max_height = 760
    black_streak_limit = max(3, int(settings.camera_black_streak_frames))
    reconnect_cooldown_sec = max(0.5, float(settings.camera_reconnect_cooldown_sec))
    camera_warmup_sec = max(0.0, float(settings.camera_warmup_sec))
    black_mean_threshold = float(settings.camera_black_frame_mean_threshold)
    black_std_threshold = float(settings.camera_black_frame_std_threshold)

    try:
        game_engine.start(now=time.monotonic())
        dual_guard.start(now=time.monotonic())
        if not args.no_display:
            cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)

        while True:
            now = time.monotonic()
            connected_ids: list[int] = []

            if args.demo:
                runtime = camera_runtime[0]
                frame = _build_demo_frame(settings.frame_width, settings.frame_height, frame_count, cv2)
                runtime["last_frame"] = frame
                runtime["pipeline_stats"].record_capture_fps(runtime["capture_fps_counter"].tick())
                snapshot_for_action = game_engine.snapshot(now=now)
                action_state = _build_demo_action(
                    snapshot_for_action,
                    frame_count,
                    auto_actions=bool(args.demo_auto_actions),
                )
                runtime["last_action_state"] = action_state
                runtime["last_persons"] = []
                runtime["last_roles"] = {"p1": None, "p2": None}
                runtime["last_keypoints"] = None
                runtime["runtime_health_score"] = 100.0
                runtime["camera_status"] = "OK"
                runtime["camera_status_reason"] = "demo"
                runtime["tracking_quality"] = 1.0
                runtime["calibration_progress"] = 1.0
                runtime["pipeline_stats"].record_render_fps(runtime["process_fps_counter"].tick())
                runtime["pipeline_stats"].record_latency_ms(0.1)
                connected_ids = [0]
                active_camera_id = 0
            else:
                for camera_id, camera in camera_managers.items():
                    runtime = camera_runtime[camera_id]
                    camera_step_start = time.perf_counter()
                    ok, frame = camera.read()
                    if not ok or frame is None:
                        runtime["connected"] = False
                        runtime["camera_status"] = "BLACK"
                        runtime["camera_status_reason"] = "camera-read-failed"
                        runtime["black_frame_streak"] = int(runtime.get("black_frame_streak", 0)) + 1
                        runtime["health_level"] = "offline"
                        runtime["health_reason"] = "camera-read-failed"
                        last_reconnect_at = runtime.get("last_reconnect_at")
                        reconnect_cooldown_ok = (
                            last_reconnect_at is None
                            or (now - float(last_reconnect_at)) >= reconnect_cooldown_sec
                        )
                        if runtime["black_frame_streak"] >= black_streak_limit and reconnect_cooldown_ok:
                            runtime["camera_status"] = "RECONNECTING"
                            runtime["camera_status_reason"] = "read-failed-reconnect"
                            runtime["last_reconnect_at"] = now
                            runtime["reconnect_attempts"] = int(runtime.get("reconnect_attempts", 0)) + 1
                            try:
                                camera.reopen()
                                runtime["connected"] = True
                                runtime["camera_status"] = "WARMUP"
                                runtime["camera_status_reason"] = "reconnect-ok"
                                runtime["black_frame_streak"] = 0
                                runtime["last_warning"] = "camera reconnect ok (read failed path)"
                            except RuntimeError as exc:
                                runtime["camera_status"] = "BLACK"
                                runtime["camera_status_reason"] = "reconnect-failed"
                                runtime["last_warning"] = f"camera reconnect failed: {exc}"
                        continue

                    frame_is_black, frame_mean, frame_std = _detect_black_frame(
                        frame,
                        mean_threshold=black_mean_threshold,
                        std_threshold=black_std_threshold,
                        cv2=cv2,
                    )
                    runtime["last_frame_mean"] = frame_mean
                    runtime["last_frame_std"] = frame_std
                    runtime["pipeline_stats"].record_capture_fps(runtime["capture_fps_counter"].tick())
                    started_at = float(runtime.get("started_at", now))
                    warmup_active = (now - started_at) < camera_warmup_sec
                    if frame_is_black:
                        runtime["connected"] = True
                        runtime["last_frame"] = frame
                        runtime["black_frame_streak"] = int(runtime.get("black_frame_streak", 0)) + 1
                        runtime["camera_status"] = "WARMUP" if warmup_active else "BLACK"
                        runtime["camera_status_reason"] = f"mean:{frame_mean:.1f} std:{frame_std:.1f}"
                        runtime["last_warning"] = (
                            f"camera-frame-black mean={frame_mean:.1f} std={frame_std:.1f} "
                            f"streak={runtime['black_frame_streak']}"
                        )
                        runtime["pipeline_stats"].record_render_fps(runtime["process_fps_counter"].tick())
                        runtime["pipeline_stats"].record_latency_ms((time.perf_counter() - camera_step_start) * 1000.0)

                        last_reconnect_at = runtime.get("last_reconnect_at")
                        reconnect_cooldown_ok = (
                            last_reconnect_at is None
                            or (now - float(last_reconnect_at)) >= reconnect_cooldown_sec
                        )
                        should_reconnect = (
                            not warmup_active
                            and runtime["black_frame_streak"] >= black_streak_limit
                            and reconnect_cooldown_ok
                        )
                        if should_reconnect:
                            runtime["camera_status"] = "RECONNECTING"
                            runtime["camera_status_reason"] = "black-streak-reconnect"
                            runtime["last_reconnect_at"] = now
                            runtime["reconnect_attempts"] = int(runtime.get("reconnect_attempts", 0)) + 1
                            try:
                                camera.reopen()
                                runtime["connected"] = True
                                runtime["camera_status"] = "WARMUP"
                                runtime["camera_status_reason"] = "reconnect-ok"
                                runtime["black_frame_streak"] = 0
                                runtime["last_warning"] = "camera reconnect ok (black frame path)"
                            except RuntimeError as exc:
                                runtime["camera_status"] = "BLACK"
                                runtime["camera_status_reason"] = "reconnect-failed"
                                runtime["connected"] = False
                                runtime["health_level"] = "offline"
                                runtime["health_reason"] = "camera-reconnect-failed"
                                runtime["last_warning"] = f"camera reconnect failed: {exc}"
                        continue

                    runtime["connected"] = True
                    runtime["black_frame_streak"] = 0
                    runtime["camera_status"] = "WARMUP" if warmup_active else "OK"
                    runtime["camera_status_reason"] = f"mean:{frame_mean:.1f} std:{frame_std:.1f}"
                    connected_ids.append(camera_id)
                    if drop_stale_frames and runtime["pipeline_stats"].p95_latency_ms() > latency_budget_ms:
                        ok_latest, latest_frame = camera.read()
                        if ok_latest and latest_frame is not None:
                            frame = latest_frame
                            runtime["pipeline_stats"].mark_dropped_frame()

                    pose_engine = runtime["pose_engine"]
                    runtime_stride = int(runtime["runtime_stride"])
                    should_infer = pose_engine is not None and (
                        runtime["frame_count"] % runtime_stride == 0 or runtime["last_keypoints"] is None
                    )
                    if should_infer:
                        infer_frame, applied_scale = _resize_for_inference(frame, float(runtime["infer_scale"]), cv2)
                        infer_start = time.perf_counter()
                        pose_output = pose_engine.infer(infer_frame)
                        infer_elapsed_ms = (time.perf_counter() - infer_start) * 1000.0
                        runtime["pipeline_stats"].record_infer_fps(runtime["infer_fps_counter"].tick())
                        keypoints = _rescale_keypoints(pose_output.keypoints, applied_scale)
                        runtime["last_keypoints"] = keypoints
                        runtime["last_pose_persons"] = pose_output.persons
                        runtime["last_primary_track_id"] = pose_output.primary_track_id
                        runtime["last_warning"] = pose_output.warning
                        if pose_output.warning:
                            warning = f"{pose_output.warning} | infer_ms={infer_elapsed_ms:.1f} scale={runtime['infer_scale']:.2f}"
                        else:
                            warning = f"infer_ms={infer_elapsed_ms:.1f} scale={runtime['infer_scale']:.2f}"
                    else:
                        keypoints = runtime["last_keypoints"]
                        warning = runtime["last_warning"]

                    multi_output = runtime["action_engine"].infer_multi(
                        persons=runtime["last_pose_persons"],
                        frame_shape=frame.shape,
                        now=now,
                        primary_track_id=runtime["last_primary_track_id"],
                    )
                    action_state = multi_output.primary_action
                    runtime["last_action_state"] = action_state
                    runtime["last_persons"] = multi_output.persons
                    runtime["last_roles"] = multi_output.roles
                    runtime["tracking_quality"] = action_state.tracking_quality
                    runtime["calibration_progress"] = action_state.calibration_progress

                    quality_controller = runtime["quality_controller"]
                    if quality_controller is not None:
                        health = quality_controller.update(
                            pipeline_stats=runtime["pipeline_stats"],
                            tracking_quality=runtime["tracking_quality"],
                            calibration_progress=runtime["calibration_progress"],
                        )
                        runtime["runtime_stride"] = quality_controller.inference_stride
                        runtime["infer_scale"] = quality_controller.infer_scale
                    else:
                        health = runtime["pipeline_stats"].health_score(
                            tracking_quality=runtime["tracking_quality"],
                            calibration_progress=runtime["calibration_progress"],
                            target_render_fps=settings.health_target_render_fps,
                            latency_budget_ms=latency_budget_ms,
                            max_drop_rate=settings.health_max_drop_rate,
                        )
                    runtime["runtime_health_score"] = health

                    calibration_note = (
                        f"calibrating={int(action_state.calibration_progress * 100)}%"
                        if not action_state.calibrated
                        else f"tracking={int(action_state.tracking_quality * 100)}%"
                    )
                    warning_text = warning or ""
                    warning_text = f"{warning_text} | {calibration_note}" if warning_text else calibration_note
                    warning_text = (
                        f"{warning_text} | health={int(health)} stride={runtime['runtime_stride']} scale={runtime['infer_scale']:.2f}"
                    )
                    runtime["last_warning"] = warning_text
                    runtime["last_frame"] = frame
                    runtime["pipeline_stats"].record_render_fps(runtime["process_fps_counter"].tick())
                    runtime["pipeline_stats"].record_latency_ms((time.perf_counter() - camera_step_start) * 1000.0)
                    runtime["frame_count"] += 1

                camera_health_by_id = {}
                for camera_id, runtime in camera_runtime.items():
                    health_state = assess_camera_health(
                        connected=bool(runtime.get("connected", False)),
                        pipeline_stats=runtime["pipeline_stats"],
                        health_score=float(runtime.get("runtime_health_score", 0.0)),
                        thresholds=health_thresholds,
                    )
                    camera_status = str(runtime.get("camera_status", "UNKNOWN")).upper()
                    if camera_status == "BLACK":
                        health_state = CameraHealthState(
                            level="degraded",
                            reason="camera-black-frame",
                            metrics=health_state.metrics,
                        )
                    elif camera_status == "RECONNECTING":
                        health_state = CameraHealthState(
                            level="offline",
                            reason="camera-reconnecting",
                            metrics=health_state.metrics,
                        )
                    camera_health_by_id[camera_id] = health_state
                    runtime["health_level"] = health_state.level
                    runtime["health_reason"] = health_state.reason

                dual_guard.maybe_complete_self_check(now, camera_health_by_id)
                dual_guard.update_runtime(now, camera_health_by_id)

                if active_camera_id_target in connected_ids:
                    active_camera_id = active_camera_id_target
                elif connected_ids:
                    active_camera_id = connected_ids[0]

                if dual_guard.dual_requested and not dual_guard.dual_ready:
                    fallback_camera = _select_fallback_camera(connected_ids, camera_runtime)
                    if fallback_camera is not None:
                        active_camera_id = fallback_camera

            if active_camera_id not in camera_runtime:
                frame_count += 1
                if args.max_frames > 0 and frame_count >= args.max_frames:
                    break
                continue
            active_runtime = camera_runtime[active_camera_id]
            if active_runtime["last_frame"] is None:
                frame_count += 1
                if args.max_frames > 0 and frame_count >= args.max_frames:
                    break
                continue

            frame = active_runtime["last_frame"]
            keypoints = active_runtime["last_keypoints"]
            action_state = active_runtime["last_action_state"]
            warning = active_runtime["last_warning"]
            persons = active_runtime["last_persons"]
            roles = active_runtime["last_roles"]
            tracking_quality = active_runtime["tracking_quality"]
            calibration_progress = active_runtime["calibration_progress"]
            runtime_health_score = active_runtime["runtime_health_score"]

            game_engine.update(action_state, now=now)
            snapshot = game_engine.snapshot(now=now)
            fps = render_fps_counter.tick()

            screen = renderer.render(
                RenderInput(
                    frame=frame,
                    keypoints=keypoints,
                    action_state=action_state,
                    snapshot=snapshot,
                    fps=fps,
                    warning=warning,
                )
            )
            dual_screen = _build_dual_display_screen(
                preview_renderer=preview_renderer,
                camera_runtime=camera_runtime,
                camera_source_labels=camera_source_labels,
                snapshot=snapshot,
                fps=fps,
                active_camera_id=active_camera_id,
                cv2=cv2,
            )
            if dual_screen is not None:
                screen = dual_screen
            last_screen = screen

            if ws_bridge is not None:
                active_pipeline = active_runtime["pipeline_stats"].snapshot(
                    {
                        "healthScore": runtime_health_score,
                        "healthLevel": active_runtime.get("health_level", "unknown"),
                        "healthReason": active_runtime.get("health_reason", "unknown"),
                        "cameraStatus": active_runtime.get("camera_status", "UNKNOWN"),
                        "cameraStatusReason": active_runtime.get("camera_status_reason", "unknown"),
                        "inferenceStrideFrames": float(active_runtime["runtime_stride"]),
                        "inferenceScale": float(active_runtime["infer_scale"]),
                        "trackingQuality": tracking_quality,
                        "calibrationProgress": calibration_progress,
                    }
                )
                root_payload = build_web_payload(
                    now=now,
                    frame_width=frame.shape[1],
                    frame_height=frame.shape[0],
                    fps=fps,
                    source=camera_source_labels.get(active_camera_id, f"camera:{active_camera_id}"),
                    snapshot=snapshot,
                    action_state=action_state,
                    persons=persons,
                    roles=roles,
                    pipeline=active_pipeline,
                )
                root_payload["activeCameraId"] = active_camera_id
                runtime_snapshot = dual_guard.snapshot(now)
                runtime_snapshot["activeCameraId"] = active_camera_id
                runtime_snapshot["maxInputAgeMs"] = round(max_input_age_ms, 1)
                root_payload["runtime"] = runtime_snapshot
                camera_views: list[dict[str, Any]] = []
                for camera_id, runtime in camera_runtime.items():
                    camera_frame = runtime["last_frame"]
                    if camera_frame is None:
                        frame_width = settings.frame_width
                        frame_height = settings.frame_height
                    else:
                        frame_height, frame_width = camera_frame.shape[:2]
                    camera_pipeline = runtime["pipeline_stats"].snapshot(
                        {
                            "healthScore": runtime["runtime_health_score"],
                            "healthLevel": runtime.get("health_level", "unknown"),
                            "healthReason": runtime.get("health_reason", "unknown"),
                            "cameraStatus": runtime.get("camera_status", "UNKNOWN"),
                            "cameraStatusReason": runtime.get("camera_status_reason", "unknown"),
                            "inferenceStrideFrames": float(runtime["runtime_stride"]),
                            "inferenceScale": float(runtime["infer_scale"]),
                            "trackingQuality": runtime["tracking_quality"],
                            "calibrationProgress": runtime["calibration_progress"],
                        }
                    )
                    per_camera_payload = build_web_payload(
                        now=now,
                        frame_width=frame_width,
                        frame_height=frame_height,
                        fps=float(camera_pipeline.get("renderFps", 0.0)),
                        source=camera_source_labels.get(camera_id, f"camera:{camera_id}"),
                        snapshot=snapshot,
                        action_state=runtime["last_action_state"],
                        persons=runtime["last_persons"],
                        roles=runtime["last_roles"],
                        pipeline=camera_pipeline,
                    )
                    camera_views.append(
                        {
                            "cameraId": camera_id,
                            "source": camera_source_labels.get(camera_id, f"camera:{camera_id}"),
                            "connected": bool(runtime["connected"]),
                            "frame": per_camera_payload["frame"],
                            "fps": per_camera_payload["fps"],
                            "status": per_camera_payload["status"],
                            "actions": per_camera_payload["actions"],
                            "hands": per_camera_payload["hands"],
                            "body": per_camera_payload["body"],
                            "persons": per_camera_payload["persons"],
                            "roles": per_camera_payload["roles"],
                            "pipeline": camera_pipeline,
                            "healthLevel": runtime.get("health_level", "unknown"),
                            "healthReason": runtime.get("health_reason", "unknown"),
                            "cameraStatus": runtime.get("camera_status", "UNKNOWN"),
                            "cameraStatusReason": runtime.get("camera_status_reason", "unknown"),
                            "blackFrameStreak": int(runtime.get("black_frame_streak", 0)),
                            "reconnectAttempts": int(runtime.get("reconnect_attempts", 0)),
                        }
                    )
                root_payload["cameras"] = camera_views
                ws_bridge.publish(root_payload)

            if not args.no_display:
                display_screen = _fit_for_display(
                    screen,
                    max_width=display_max_width,
                    max_height=display_max_height,
                    cv2=cv2,
                )
                cv2.imshow(window_name, display_screen)
                key = cv2.waitKey(1) & 0xFF
                if key in (27, ord("q")):
                    break
                if key == ord("r") and snapshot.status == "GAME_OVER":
                    game_engine.start(now=time.monotonic())
                if key == ord(" "):
                    game_engine.start(now=time.monotonic())
            elif snapshot.status == "GAME_OVER" and args.max_frames == 0:
                game_engine.start(now=time.monotonic())

            frame_count += 1
            if args.max_frames > 0 and frame_count >= args.max_frames:
                break
    except KeyboardInterrupt:
        return 0
    finally:
        if ws_bridge is not None:
            ws_bridge.stop()
        for camera in camera_managers.values():
            camera.release()
        if args.save_preview and last_screen is not None:
            output_path = Path(args.save_preview)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(output_path), last_screen)
            print(f"Preview saved to: {output_path}")
        if args.perf_report:
            report_path = Path(args.perf_report)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            active_runtime = camera_runtime.get(active_camera_id, {})
            pipeline_stats = active_runtime.get("pipeline_stats")
            if pipeline_stats is not None:
                metrics = pipeline_stats.snapshot(
                    {
                        "healthScore": float(active_runtime.get("runtime_health_score", 0.0)),
                        "inferenceStrideFrames": float(active_runtime.get("runtime_stride", 1)),
                        "inferenceScale": float(active_runtime.get("infer_scale", 1.0)),
                        "trackingQuality": float(active_runtime.get("tracking_quality", 0.0)),
                        "calibrationProgress": float(active_runtime.get("calibration_progress", 0.0)),
                    }
                )
            else:
                metrics = {}
            report = {
                "source": "demo" if args.demo else "camera",
                "activeCameraId": active_camera_id,
                "cameraCount": len(camera_runtime),
                "framesProcessed": frame_count,
                "runtime": dual_guard.snapshot(time.monotonic()),
                "metrics": metrics,
            }
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Perf report saved to: {report_path}")
        if not args.no_display:
            cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
