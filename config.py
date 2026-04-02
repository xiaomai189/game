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
