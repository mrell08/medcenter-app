import logging
import uuid
import datetime

from fastapi import APIRouter, Request, HTTPException, Body
from fastapi.params import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from app.db.connection import get_session
from app.schemas.schedule import ScheduleResponse, ScheduleCreateRequest
from app.utils.schedule import dal_get_schedule, dal_create_schedule

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/schedules", tags=["schedule"])


@router.get(
    "/{date}/{doctor_id}",
    status_code=status.HTTP_200_OK,
    response_model=ScheduleResponse,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Schedule not found"},
    }
)
async def get_schedule(
        _: Request,
        date: datetime.date,
        doctor_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
):
    db_schedule = await dal_get_schedule(session, date, doctor_id)
    if not db_schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return ScheduleResponse.model_validate(db_schedule)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ScheduleResponse,
    responses={
        status.HTTP_409_CONFLICT: {"description": "Schedule already exists"},
    }
)
async def create_schedule(
        _: Request,
        schedule: ScheduleCreateRequest = Body(...),
        session: AsyncSession = Depends(get_session),
):
    try:
        db_schedule = await dal_create_schedule(session, schedule)
        return ScheduleResponse.model_validate(db_schedule)
    except IntegrityError as e:
        logger.error(e)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT)
    except Exception as e:
        logger.error(e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
