from __future__ import annotations

import argparse
import asyncio
import json
import time
from dataclasses import dataclass, field

import websockets


@dataclass
class CameraStats:
    frames: int = 0
    connected_frames: int = 0
    last_source: str = "unknown"
    last_seen_at: float | None = None


@dataclass
class VerifyResult:
    ok: bool
    reason: str
    stats: dict[int, CameraStats] = field(default_factory=dict)


def parse_camera_ids(text: str) -> list[int]:
    out: list[int] = []
    for raw in (part.strip() for part in text.split(",")):
        if not raw:
            continue
        out.append(int(raw))
    if not out:
        raise ValueError("required camera ids must not be empty")
    return out


async def verify_stream(
    ws_url: str,
    required_camera_ids: list[int],
    timeout_sec: float,
    min_frames_per_camera: int,
) -> VerifyResult:
    started = time.monotonic()
    deadline = started + timeout_sec
    stats = {camera_id: CameraStats() for camera_id in required_camera_ids}

    try:
        async with websockets.connect(ws_url, max_size=8 * 1024 * 1024) as ws:
            while time.monotonic() < deadline:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    message = await asyncio.wait_for(ws.recv(), timeout=min(1.0, remaining))
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed as exc:
                    return VerifyResult(ok=False, reason=f"websocket closed early: code={exc.code}", stats=stats)

                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    continue
                if payload.get("type") != "frame":
                    continue

                cameras = payload.get("cameras") or []
                index = {int(item.get("cameraId")): item for item in cameras if isinstance(item, dict)}
                now = time.monotonic()
                for camera_id in required_camera_ids:
                    camera_payload = index.get(camera_id)
                    if camera_payload is None:
                        continue
                    stat = stats[camera_id]
                    stat.frames += 1
                    if bool(camera_payload.get("connected")):
                        stat.connected_frames += 1
                    stat.last_source = str(camera_payload.get("source") or stat.last_source)
                    stat.last_seen_at = now

                if all(stats[camera_id].connected_frames >= min_frames_per_camera for camera_id in required_camera_ids):
                    return VerifyResult(ok=True, reason="all required cameras reached frame threshold", stats=stats)
    except OSError as exc:
        return VerifyResult(ok=False, reason=f"failed to connect websocket: {exc}", stats=stats)

    missing = [
        f"cam{camera_id}={stats[camera_id].connected_frames}/{min_frames_per_camera}"
        for camera_id in required_camera_ids
        if stats[camera_id].connected_frames < min_frames_per_camera
    ]
    reason = "timeout waiting required camera frames"
    if missing:
        reason = f"{reason}; " + ", ".join(missing)
    return VerifyResult(ok=False, reason=reason, stats=stats)


def format_stats(stats: dict[int, CameraStats]) -> str:
    ordered_ids = sorted(stats.keys())
    lines: list[str] = []
    for camera_id in ordered_ids:
        stat = stats[camera_id]
        last_seen = "never" if stat.last_seen_at is None else f"{stat.last_seen_at:.1f}"
        lines.append(
            f"cam{camera_id}: frames={stat.frames}, connected_frames={stat.connected_frames}, "
            f"source={stat.last_source}, last_seen={last_seen}"
        )
    return "\n".join(lines)


async def async_main() -> int:
    parser = argparse.ArgumentParser(description="Verify dual-camera websocket stream from YOLO backend.")
    parser.add_argument("--ws-url", default="ws://127.0.0.1:8765", help="Websocket URL from YOLO backend.")
    parser.add_argument(
        "--required-cameras",
        default="0,1",
        help="Comma-separated required camera IDs. Default: 0,1",
    )
    parser.add_argument("--timeout-sec", type=float, default=12.0, help="Verification timeout in seconds.")
    parser.add_argument(
        "--min-frames-per-camera",
        type=int,
        default=5,
        help="Minimum connected frames required per camera.",
    )
    args = parser.parse_args()

    required_camera_ids = parse_camera_ids(args.required_cameras)
    result = await verify_stream(
        ws_url=args.ws_url,
        required_camera_ids=required_camera_ids,
        timeout_sec=max(1.0, float(args.timeout_sec)),
        min_frames_per_camera=max(1, int(args.min_frames_per_camera)),
    )
    print(format_stats(result.stats))
    print(result.reason)
    return 0 if result.ok else 2


def main() -> int:
    return asyncio.run(async_main())


if __name__ == "__main__":
    raise SystemExit(main())
