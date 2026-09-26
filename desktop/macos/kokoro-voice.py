#!/usr/bin/env python3
"""Private local Kokoro speech daemon and client for the macOS wrapper."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
from pathlib import Path
import signal
import socket
import sys
import time
from typing import Any

APPLICATION_SUPPORT = Path.home() / "Library/Application Support/DeepSeek Harness"
SOCKET_PATH = APPLICATION_SUPPORT / "kokoro-voice.sock"
MODEL_CACHE = APPLICATION_SUPPORT / "kokoro-model-cache"
VOICE = "zm_yunxi"
SAMPLE_RATE = 24_000


def load_pipeline() -> Any:
    """Load the local Mandarin model without writing protocol noise to stdout."""
    os.environ.setdefault("HF_HOME", str(MODEL_CACHE))
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    from kokoro import KPipeline

    with contextlib.redirect_stdout(sys.stderr):
        return KPipeline(lang_code="z", device="mps", repo_id="hexgrad/Kokoro-82M")


def synthesize(pipeline: Any, text: str, output: Path) -> None:
    """Generate one continuous 24 kHz WAV file from cleaned Chinese prose."""
    import numpy as np
    import soundfile as sf

    pieces = []
    with contextlib.redirect_stdout(sys.stderr):
        for _, _, audio in pipeline(text, voice=VOICE, speed=1.06, split_pattern=r"\n+"):
            pieces.append(audio)
    if not pieces:
        raise RuntimeError("Kokoro returned no audio")
    gap = np.zeros(int(SAMPLE_RATE * 0.018), dtype=np.float32)
    joined = pieces[0]
    for piece in pieces[1:]:
        joined = np.concatenate((joined, gap, piece))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, joined, SAMPLE_RATE, subtype="PCM_16")


def read_request(connection: socket.socket) -> dict[str, Any]:
    """Read one bounded JSON-line request from a private Unix socket."""
    chunks = bytearray()
    while len(chunks) <= 16_384:
        block = connection.recv(4_096)
        if not block:
            break
        chunks.extend(block)
        if b"\n" in block:
            break
    if len(chunks) > 16_384:
        raise ValueError("request exceeds 16 KiB")
    return json.loads(bytes(chunks).split(b"\n", 1)[0])


def serve(parent_pid: int) -> int:
    """Serve synthesis requests until the owning desktop process exits."""
    APPLICATION_SUPPORT.mkdir(parents=True, exist_ok=True)
    try:
        SOCKET_PATH.unlink()
    except FileNotFoundError:
        pass
    pipeline = load_pipeline()
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(SOCKET_PATH))
    os.chmod(SOCKET_PATH, 0o600)
    server.listen(8)
    server.settimeout(1)
    running = True

    def stop(_signum: int, _frame: Any) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while running and os.getppid() == parent_pid:
            try:
                connection, _ = server.accept()
            except TimeoutError:
                continue
            with connection:
                try:
                    request = read_request(connection)
                    text = request.get("text")
                    output = request.get("output")
                    if not isinstance(text, str) or not text.strip() or not isinstance(output, str):
                        raise ValueError("text and output are required")
                    synthesize(pipeline, text, Path(output))
                    response = {"ok": True}
                except Exception as error:
                    response = {"ok": False, "error": str(error)[:500]}
                connection.sendall(json.dumps(response, ensure_ascii=False).encode("utf-8") + b"\n")
    finally:
        server.close()
        try:
            SOCKET_PATH.unlink()
        except FileNotFoundError:
            pass
    return 0


def request_synthesis(input_path: Path, output_path: Path) -> int:
    """Send one synthesis request to the app-owned local daemon."""
    request = {
        "text": input_path.read_text(encoding="utf-8"),
        "output": str(output_path),
    }
    deadline = time.monotonic() + 35
    while True:
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            client.connect(str(SOCKET_PATH))
            break
        except (FileNotFoundError, ConnectionRefusedError):
            client.close()
            if time.monotonic() >= deadline:
                return 2
            time.sleep(0.1)
    with client:
        client.sendall(json.dumps(request, ensure_ascii=False).encode("utf-8") + b"\n")
        response = read_request(client)
    return 0 if response.get("ok") is True and output_path.exists() else 3


def preload() -> int:
    """Download model and voice weights and run one silent warm-up inference."""
    pipeline = load_pipeline()
    with contextlib.redirect_stdout(sys.stderr):
        next(iter(pipeline("本地语音核心准备完成。", voice=VOICE, speed=1.06)))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--daemon", action="store_true")
    parser.add_argument("--parent-pid", type=int)
    parser.add_argument("--preload", action="store_true")
    parser.add_argument("--file", type=Path)
    parser.add_argument("--write-media", type=Path)
    parser.add_argument("--version", action="store_true")
    arguments, _ = parser.parse_known_args()
    if arguments.version:
        print("deepseek-harness-kokoro 1")
        return 0
    if arguments.preload:
        return preload()
    if arguments.daemon:
        if arguments.parent_pid is None:
            parser.error("--daemon requires --parent-pid")
        return serve(arguments.parent_pid)
    if arguments.file is None or arguments.write_media is None:
        parser.error("--file and --write-media are required")
    return request_synthesis(arguments.file, arguments.write_media)


if __name__ == "__main__":
    raise SystemExit(main())
