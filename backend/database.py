"""
PostgreSQL connection pool management using asyncpg.

Reads connection parameters from environment variables:
  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

Provides:
  - get_pool(): returns the active connection pool
  - lifespan(): FastAPI lifespan context manager for pool lifecycle
"""

import os
from contextlib import asynccontextmanager

import asyncpg
from dotenv import load_dotenv

load_dotenv()

_pool: asyncpg.Pool | None = None


def _dsn() -> dict:
    """Return database connection parameters from environment variables."""
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "database": os.getenv("DB_NAME", "maximo"),
        "user": os.getenv("DB_USER", "maximo"),
        "password": os.getenv("DB_PASSWORD", "maximo"),
    }


async def _create_pool() -> asyncpg.Pool:
    """Create and return a new asyncpg connection pool."""
    params = _dsn()
    pool = await asyncpg.create_pool(
        host=params["host"],
        port=params["port"],
        database=params["database"],
        user=params["user"],
        password=params["password"],
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    return pool


def get_pool() -> asyncpg.Pool:
    """Return the active connection pool.

    Raises RuntimeError if the pool has not been initialised yet
    (i.e. the application lifespan has not started).
    """
    if _pool is None:
        raise RuntimeError(
            "Database pool is not initialised. "
            "Ensure the application lifespan has started."
        )
    return _pool


@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan context manager — creates and tears down the pool."""
    global _pool
    _pool = await _create_pool()
    try:
        yield
    finally:
        if _pool is not None:
            await _pool.close()
            _pool = None
