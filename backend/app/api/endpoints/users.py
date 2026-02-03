from fastapi import APIRouter, Depends

from app.api import deps
from app.models.user import User

router = APIRouter()


@router.get("/me")
def read_user_me(current_user: User = Depends(deps.get_current_user)):
    return {"id": str(current_user.id), "email": current_user.email, "profile_data": current_user.profile_data}
