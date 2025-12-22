import uuid
from datetime import time
from typing import Any

from sqlalchemy import Date, Sequence, Time, asc, cast, desc, select, update, Select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Visit
from app.schemas.visit import VisitCreateRequest, VisitSearchRequest, VisitUpdateRequest


async def get_visit_by_id(
        session: AsyncSession,
        visit_id: uuid.UUID,
) -> Visit | None:
    visit = await session.scalar(
        select(Visit)
        .where(Visit.id == visit_id)
    )
    return visit


async def create_new_visit(
        session: AsyncSession,
        potential_visit: VisitCreateRequest
) -> Visit:
    visit = Visit(**potential_visit.model_dump())
    session.add(visit)
    await session.commit()
    await session.refresh(visit)
    return visit


async def update_visit(
        session: AsyncSession,
        visit_id: uuid.UUID,
        update_request: VisitUpdateRequest,
) -> Visit | None:
    values = update_request.model_dump(exclude_none=True)
    visit = await session.scalar(
        update(Visit)
        .where(Visit.id == visit_id)
        .values(**values)
        .returning(Visit)
    )
    await session.commit()
    return visit


async def delete_visit_by_id(
        session: AsyncSession,
        visit_id: uuid.UUID,
) -> None:
    visit = await session.scalar(
        select(Visit)
        .where(Visit.id == visit_id)
    )
    await session.delete(visit)
    await session.commit()


async def dal_get_visits_by_filter(
        session: AsyncSession,
        search: VisitSearchRequest,
        limit: int = 10,
        offset: int = 0,
) -> Sequence[Visit]:
    visits = await session.scalars(
        _search_stmt(search, select(Visit))
        .limit(limit).offset(offset)
    )
    return visits


async def dal_count_visits_by_filter(
        session: AsyncSession,
        search: VisitSearchRequest,
) -> Sequence[Visit]:
    result = await session.scalar(
        select(func.count()).select_from(
            _search_stmt(search, select(Visit)).subquery()
        )
    )
    return result or 0


async def dal_total_visits_cost_by_filter(
        session: AsyncSession,
        search: VisitSearchRequest,
) -> float:
    filtered_costs = _search_stmt(
        search,
        select(Visit.cost.label("cost")),
    ).subquery()

    result = await session.scalar(
        select(func.coalesce(func.sum(filtered_costs.c.cost), 0))
    )

    return float(result)


# --- HELPERS ---

def _search_stmt(search: VisitSearchRequest, stmt: Select[Any]) -> Select[Any]:
    midnight = time(0, 0)
    start_time = cast(Visit.start_date, Time)
    if search.reserve_list:
        stmt = stmt.where(start_time == midnight)
    else:
        stmt = stmt.where(start_time != midnight)

    if search.client_id:
        stmt = stmt.where(Visit.client_id == search.client_id)
    if search.doctor_id:
        stmt = stmt.where(Visit.doctor_id == search.doctor_id)
    if search.start_date:
        stmt = stmt.where(Visit.start_date >= search.start_date)
    if search.end_date:
        stmt = stmt.where(Visit.end_date <= search.end_date)
    if search.cabinet:
        stmt = stmt.where(Visit.cabinet == search.cabinet)
    if search.procedure:
        stmt = stmt.where(Visit.procedure == search.procedure)
    if search.status:
        stmt = stmt.where(Visit.status == search.status)

    stmt = stmt.order_by(
        desc(cast(Visit.start_date, Date)),
        asc(cast(Visit.start_date, Time))
    )
    return stmt
