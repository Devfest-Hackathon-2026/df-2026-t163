"""1 日あたりの利用回数の上限（Vertex AI のクレジットを使い切らないため）。

メモリで数えるのでインスタンスごとの上限になる。合計の最大は「上限 × Cloud Run の最大インスタンス数」。
"""
from __future__ import annotations

import threading
from collections.abc import Callable
from datetime import date


class DailyQuota:
    def __init__(self, limit: Callable[[], int]):
        self._limit = limit
        self._lock = threading.Lock()
        self._day: date | None = None
        self._used = 0

    def take(self) -> bool:
        """1 回分を確保する。今日の上限に達していたら False。"""
        with self._lock:
            today = date.today()
            if today != self._day:
                self._day, self._used = today, 0
            if self._used >= self._limit():
                return False
            self._used += 1
            return True
