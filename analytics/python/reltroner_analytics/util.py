"""Numeric hygiene shared by all analyses: rounding for cross-platform stability and canonical JSON."""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

SIGNIFICANT_DIGITS = 10


def r(value: float | None, digits: int = SIGNIFICANT_DIGITS) -> float | None:
    """Round to significant digits so BLAS/libm last-bit differences cannot leak into artifacts."""
    if value is None:
        return None
    v = float(value)
    if not math.isfinite(v):
        return None
    if v == 0:
        return 0.0
    out = float(f"{v:.{digits}g}")
    return 0.0 if out == 0 else out


def r_list(values) -> list[float | None]:
    return [r(v) for v in values]


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
