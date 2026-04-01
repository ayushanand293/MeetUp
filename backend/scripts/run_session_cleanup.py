"""Run stale session cleanup job once."""

from __future__ import annotations

import argparse
import asyncio

from app.worker.session_cleanup import expire_stale_sessions


def main() -> None:
    parser = argparse.ArgumentParser(description="Expire stale active sessions and cleanup Redis keys")
    parser.add_argument(
        "--stale-after-minutes",
        type=int,
        default=5,
        help="Expire sessions when latest location is older than this many minutes",
    )
    args = parser.parse_args()

    result = asyncio.run(expire_stale_sessions(stale_after_minutes=args.stale_after_minutes))
    print(result)


if __name__ == "__main__":
    main()
