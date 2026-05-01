import uuid

from sqlalchemy import Sequence, delete, exc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Client
from app.schemas import ClientCreateRequest
from app.schemas.client import ClientUpdateRequest


async def get_client_by_id(
        session: AsyncSession,
        client_id: uuid.UUID,
) -> Client | None:
    client = await session.scalar(
        select(Client)
        .where(Client.id == client_id)
    )
    return client


async def create_new_client(
        session: AsyncSession,
        potential_client: ClientCreateRequest
) -> tuple[Client | None, str]:
    client = Client(**potential_client.model_dump())
    session.add(client)

    try:
        await session.commit()
        await session.refresh(client)
        return client, "Successful registration!"
    except exc.IntegrityError:
        await session.rollback()
        return None, "User with this phone number already exists"


async def update_client(
        session: AsyncSession,
        client_id: uuid.UUID,
        update_request: ClientUpdateRequest,
) -> Client | None:
    values = update_request.model_dump(exclude_none=True)
    client = await session.scalar(
        update(Client)
        .where(Client.id == client_id)
        .values(**values)
        .returning(Client)
    )
    await session.commit()
    return client


async def delete_client_by_id(
        session: AsyncSession,
        client_id: uuid.UUID,
) -> bool:
    deleted_client_id = await session.scalar(
        delete(Client)
        .where(Client.id == client_id)
        .returning(Client.id)
    )
    await session.commit()
    return deleted_client_id is not None


async def find_client_by_substr(
        session: AsyncSession,
        client_substr: str
) -> Sequence[Client] | None:
    clients = await session.scalars(
        select(Client)
        .where(
            or_(
                func.lower(Client.full_name).ilike(f"%{client_substr.lower()}%"),
                Client.phone_number.ilike(f"%{client_substr}%")
            )
        )
        .order_by(Client.name.asc())
        .limit(20)
    )
    return clients.all()
