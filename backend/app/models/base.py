# Re-export Base from core.database so that models/__init__.py can import it
from app.core.database import Base  # noqa: F401
