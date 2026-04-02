from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from config import load_settings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Windows local YOLO pose game prototype")
    parser.add_argument("--camera-index", type=int, default=None)
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
    return parser.parse_args()


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


def _build_demo_action(snapshot, frame_count: int):
    from core.action_engine import ActionState

    state = ActionState()
    if snapshot.status != "RUNNING":
        return state

    # Every 24 frames, simulate a short raised-right-hand hit at current target.
    burst = frame_count % 24
    if burst < 2:
        state.right_hand_up = True
        state.right_hand = snapshot.target
    else:
        state.right_hand_up = False
        state.right_hand = (snapshot.target[0], min(snapshot.target[1] + 120, 9999))

    # Alternate a visible left/right body shift for HUD feedback.
    if (frame_count // 30) % 2 == 0:
        state.move_left = True
    else:
        state.move_right = True
    return state


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

    from core.action_engine import ActionEngine
    from core.camera import CameraConfig, CameraManager
    from core.game_engine import GameEngine
    from core.pose_engine import PoseEngine
    from core.web_bridge import WebGameBridge
    from core.web_payload import build_web_payload
    from core.renderer import RenderInput, Renderer
    from core.utils import FpsCounter

    settings = load_settings()

    camera_config = CameraConfig(
        camera_index=settings.camera_index if args.camera_index is None else args.camera_index,
        width=settings.frame_width,
        height=settings.frame_height,
        mirror=settings.mirror,
    )
    camera = CameraManager(camera_config)

    model_path = settings.model_path if args.model is None else Path(args.model)
    model_device = settings.model_device if args.device is None else args.device
    game_duration = settings.game_duration_sec if args.duration_sec <= 0 else args.duration_sec

    pose_engine = None if args.demo else PoseEngine(model_path=model_path, device=model_device, conf=settings.model_confidence)
    action_engine = ActionEngine(
        keypoint_confidence=settings.keypoint_confidence,
        arm_raise_ratio=settings.arm_raise_ratio,
        move_dead_zone_ratio=settings.move_dead_zone_ratio,
        squat_ratio=settings.squat_ratio,
        swap_left_right=settings.mirror,
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
    fps_counter = FpsCounter()
    frame_count = 0
    last_screen = None
    ws_bridge: WebGameBridge | None = None

    if not args.disable_websocket:
        try:
            ws_bridge = WebGameBridge(port=args.websocket_port)
            ws_bridge.start()
            print(f"Web bridge ready: ws://127.0.0.1:{args.websocket_port}")
        except Exception as exc:
            print(f"Web bridge disabled due to startup error: {exc}", file=sys.stderr)
            ws_bridge = None

    try:
        if not args.demo:
            try:
                camera.open()
            except RuntimeError as exc:
                print(f"Camera initialization failed: {exc}", file=sys.stderr)
                return 2

        game_engine.start(now=time.monotonic())

        while True:
            now = time.monotonic()
            if args.demo:
                frame = _build_demo_frame(settings.frame_width, settings.frame_height, frame_count, cv2)
                snapshot_for_action = game_engine.snapshot(now=now)
                action_state = _build_demo_action(snapshot_for_action, frame_count)
                keypoints = None
                warning = "Demo mode: synthetic actions are feeding the game loop."
            else:
                ok, frame = camera.read()
                if not ok or frame is None:
                    continue
                pose_output = pose_engine.infer(frame)
                keypoints = pose_output.keypoints
                warning = pose_output.warning
                action_state = action_engine.infer(keypoints, frame.shape)

            game_engine.update(action_state, now=now)
            snapshot = game_engine.snapshot(now=now)
            fps = fps_counter.tick()

            if ws_bridge is not None:
                ws_bridge.publish(
                    build_web_payload(
                        now=now,
                        frame_width=frame.shape[1],
                        frame_height=frame.shape[0],
                        fps=fps,
                        source="demo" if args.demo else "camera",
                        snapshot=snapshot,
                        action_state=action_state,
                    )
                )

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
            last_screen = screen

            if not args.no_display:
                cv2.imshow("YOLO Pose Game Prototype", screen)
                key = cv2.waitKey(1) & 0xFF
                if key in (27, ord("q")):
                    break
                if key == ord("r") and snapshot.status == "GAME_OVER":
                    game_engine.start(now=time.monotonic())
                if key == ord(" "):
                    game_engine.start(now=time.monotonic())
            elif snapshot.status == "GAME_OVER" and args.max_frames == 0:
                break

            frame_count += 1
            if args.max_frames > 0 and frame_count >= args.max_frames:
                break
    except KeyboardInterrupt:
        return 0
    finally:
        if ws_bridge is not None:
            ws_bridge.stop()
        if not args.demo:
            camera.release()
        if args.save_preview and last_screen is not None:
            output_path = Path(args.save_preview)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(output_path), last_screen)
            print(f"Preview saved to: {output_path}")
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
