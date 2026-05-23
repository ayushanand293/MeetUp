from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.core.database import get_db
from app.models.user import User
from app.models.user_block import UserBlock
from pydantic import BaseModel

router = APIRouter()

class BlockCreate(BaseModel):
    blocked_user_id: UUID

class BlockRead(BaseModel):
    blocked_id: UUID
    created_at: str

@router.post("", status_code=status.HTTP_201_CREATED)
def block_user(
    body: BlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if body.blocked_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    
    # Check if user exists
    target = db.query(User).filter(User.id == body.blocked_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already blocked
    existing = db.query(UserBlock).filter(
        UserBlock.blocker_id == current_user.id,
        UserBlock.blocked_id == body.blocked_user_id
    ).first()
    
    if existing:
        return {"message": "User already blocked"}

    block = UserBlock(blocker_id=current_user.id, blocked_id=body.blocked_user_id)
    db.add(block)
    db.commit()
    return {"message": "User blocked"}

@router.delete("/{blocked_user_id}")
def unblock_user(
    blocked_user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    block = db.query(UserBlock).filter(
        UserBlock.blocker_id == current_user.id,
        UserBlock.blocked_id == blocked_user_id
    ).first()
    
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    db.delete(block)
    db.commit()
    return {"message": "User unblocked"}

@router.get("", response_model=List[UUID])
def get_blocked_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    blocks = db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    return [b.blocked_id for b in blocks]
