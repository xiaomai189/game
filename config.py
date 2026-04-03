from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    camera_index: int = 0
    frame_width: int = 1280
    frame_height: int = 720
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
    inference_stride_frames: int = 1
    drop_stale_frames: bool = True
    adaptive_resolution_enabled: bool = True
    adaptive_min_scale: float = 0.7
    adaptive_scale_step: float = 0.1
    adaptive_max_stride_frames: int = 3
    adaptive_low_health_threshold: float = 58.0
    adaptive_high_health_threshold: float = 78.0
    adaptive_adjust_interval_frames: int = 20
    health_target_render_fps: float = 28.0
    health_max_drop_rate: float = 0.12
    latency_budget_ms: float = 180.0
    inference_downscale_ratio: float = 0.75
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
