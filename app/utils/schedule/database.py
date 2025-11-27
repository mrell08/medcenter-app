import datetime
import uuid

from sqlalchemy import select, and_, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Schedule
from app.schemas.schedule import ScheduleCreateRequest, ScheduleUpdateRequest


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


async def dal_update_schedule(
        session: AsyncSession,
        schedule_id: uuid.UUID,
        schedule: ScheduleUpdateRequest,
) -> Schedule:
    values = schedule.model_dump(exclude_none=True)
    new_schedule = await session.scalar(
        update(Schedule)
        .where(Schedule.id == schedule_id)
        .values(**values)
        .returning(Schedule)
    )
    await session.commit()
    return new_schedule  # noqa


async def dal_delete_schedule(
        session: AsyncSession,
        schedule_id: uuid.UUID,
) -> None:
    await session.execute(
        delete(Schedule).where(Schedule.id == schedule_id)
    )
    await session.commit()
