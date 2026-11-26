import logging
from typing import Any

import orjson
import structlog


def configure_logging(*, json_format: bool, log_level: str) -> None:
    """Set up structlog once, at startup.

    `merge_contextvars` is what makes request fields work: the middleware
    binds request_id, method and path once, and every log line inside that
    request carries them without anybody threading them through.
    """
    logging.basicConfig(format="%(message)s", level=getattr(logging, log_level))

    renderer: Any = (
        structlog.processors.JSONRenderer(serializer=_dumps)
        if json_format
        else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level)
        ),
        cache_logger_on_first_use=True,
    )


def _dumps(obj: Any, **_: Any) -> str:
    """orjson, forgiving: something that cannot be encoded is written as its
    repr, because a log line is not worth an exception mid-request."""
    return orjson.dumps(obj, default=repr).decode()
