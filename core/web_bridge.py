from __future__ import annotations

import asyncio
import contextlib
import json
import threading
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol


class WebGameBridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 8765) -> None:
        self.host = host
        self.port = port
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue[str] | None = None
        self._clients: set[WebSocketServerProtocol] = set()
        self._ready = threading.Event()
        self._shutdown = asyncio.Event()
        self._start_error: str | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="web-game-bridge", daemon=True)
        self._thread.start()
        ready = self._ready.wait(timeout=4.0)
        if not ready:
            raise RuntimeError("WebGameBridge startup timeout.")
        if self._start_error:
            raise RuntimeError(self._start_error)

    def stop(self) -> None:
        if not self._loop:
            return
        self._loop.call_soon_threadsafe(self._shutdown.set)
        if self._thread:
            self._thread.join(timeout=2.0)

    def publish(self, payload: dict[str, Any]) -> None:
        if not self._loop or not self._queue:
            return
        message = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)

        def _enqueue() -> None:
            if not self._queue:
                return
            if self._queue.full():
                try:
                    self._queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            self._queue.put_nowait(message)

        self._loop.call_soon_threadsafe(_enqueue)

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._queue = asyncio.Queue(maxsize=4)
        try:
            self._loop.run_until_complete(self._main())
        except Exception as exc:
            self._start_error = f"WebGameBridge failed: {exc}"
            self._ready.set()
        finally:
            self._loop.close()

    async def _main(self) -> None:
        async with websockets.serve(self._handler, self.host, self.port):
            broadcast_task = asyncio.create_task(self._broadcast_loop())
            self._ready.set()
            await self._shutdown.wait()
            broadcast_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await broadcast_task

    async def _handler(self, websocket: WebSocketServerProtocol) -> None:
        self._clients.add(websocket)
        try:
            async for _ in websocket:
                # Browser currently sends no commands; read loop keeps connection alive.
                pass
        finally:
            self._clients.discard(websocket)

    async def _broadcast_loop(self) -> None:
        assert self._queue is not None
        while True:
            message = await self._queue.get()
            if not self._clients:
                continue
            stale_clients: list[WebSocketServerProtocol] = []
            for ws in tuple(self._clients):
                try:
                    await ws.send(message)
                except Exception:
                    stale_clients.append(ws)
            for ws in stale_clients:
                self._clients.discard(ws)
