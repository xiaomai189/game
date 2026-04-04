from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    camera_index: int = 0
    camera_sources: tuple[str, ...] = ("0",)
    active_camera_id: int = 0
    max_cameras: int = 2
    frame_width: int = 640
    frame_height: int = 480
    camera_fps: int = 30
    camera_buffer_size: int = 1
    camera_fourcc: str = "MJPG"
    camera_validation_frames: int = 8
    camera_black_frame_mean_threshold: float = 8.0
    camera_black_frame_std_threshold: float = 2.0
    camera_black_streak_frames: int = 12
    camera_reconnect_cooldown_sec: float = 2.0
    camera_warmup_sec: float = 2.0
    mirror: bool = True
    model_path: Path = Path("models/yolo11n-pose.pt")
    model_device: str = "cpu"
    model_confidence: float = 0.5
    keypoint_confidence: float = 0.35
    keypoint_grace_frames: int = 2
    pose_smoothing_alpha: float = 0.55
    calibration_frames: int = 20
    calibration_adapt_alpha: float = 0.08
    arm_raise_torso_ratio: float = 0.22
    move_dead_zone_shoulder_ratio: float = 0.45
    move_exit_ratio: float = 0.72
    action_enter_frames: int = 2
    action_exit_frames: int = 2
    pose_track_stickiness: float = 0.65
    pose_track_memory_frames: int = 10
    max_persons: int = 2
    person_select_policy: str = "conf_area"
    dual_role_enabled: bool = True
    role_bind_grace_ms: float = 500.0
    inference_stride_frames: int = 2
    drop_stale_frames: bool = True
    adaptive_resolution_enabled: bool = True
    adaptive_min_scale: float = 0.5
    adaptive_scale_step: float = 0.1
    adaptive_max_stride_frames: int = 5
    adaptive_low_health_threshold: float = 58.0
    adaptive_high_health_threshold: float = 78.0
    adaptive_adjust_interval_frames: int = 4
    health_target_render_fps: float = 28.0
    health_max_drop_rate: float = 0.12
    latency_budget_ms: float = 180.0
    startup_self_check_sec: float = 8.0
    dual_min_render_fps: float = 6.0
    dual_min_infer_fps: float = 4.0
    dual_max_p95_latency_ms: float = 450.0
    dual_min_health_score: float = 55.0
    auto_degrade_enabled: bool = True
    degrade_trigger_sec: float = 2.0
    degrade_recovery_sec: float = 6.0
    max_input_age_ms: float = 1200.0
    inference_downscale_ratio: float = 0.6
    debug: bool = True
    target_radius: int = 60
    target_spawn_interval_sec: float = 2.5
    target_spawn_x_min_ratio: float = 0.25
    target_spawn_x_max_ratio: float = 0.9
    target_spawn_y_min_ratio: float = 0.2
    target_spawn_y_max_ratio: float = 0.82
    game_duration_sec: float = 45.0
    hit_cooldown_sec: float = 0.45
    require_hand_up_for_hit: bool = False
    move_dead_zone_ratio: float = 0.12
    arm_raise_ratio: float = 0.08
    squat_ratio: float = 0.06
    show_camera_game_overlay: bool = False


def load_settings() -> Settings:
    return Settings()
