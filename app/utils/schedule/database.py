import datetime
import uuid

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Schedule
from app.schemas.schedule import ScheduleCreateRequest


async def dal_get_schedule(
        session: AsyncSession,
        date: datetime.date,
        doctor_id: uuid.UUID,
) -> Schedule | None:
    schedule = await session.scalar(
        select(Schedule)
        .where(
            and_(
                Schedule.doctor_id == doctor_id,
                Schedule.date == date,
            )
        )
    )
    return schedule


async def dal_create_schedule(
        session: AsyncSession,
        schedule: ScheduleCreateRequest,
) -> Schedule:
    schedule = Schedule(**schedule.model_dump())
    session.add(schedule)

    await session.commit()
    await session.refresh(schedule)
    return schedule
