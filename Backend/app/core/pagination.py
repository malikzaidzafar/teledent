"""
core/pagination.py — Reusable paginated response wrapper.
"""
import math


def _serialize(item, schema):
    """Serialize a SQLAlchemy model to dict or Pydantic schema."""
    if schema is not None:
        return schema.model_validate(item)
    # Fallback: convert SQLAlchemy row to dict
    d = {}
    for col in item.__table__.columns:
        val = getattr(item, col.name)
        # Convert UUID, date, datetime to string for JSON serialization
        if val is not None and not isinstance(val, (str, int, float, bool, list, dict)):
            val = str(val)
        d[col.name] = val
    return d


def paginate(query, page: int, limit: int, schema):
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "data": [_serialize(item, schema) for item in items],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit) if total else 0,
    }
