import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status
from starlette.status import HTTP_404_NOT_FOUND

from app.db.connection import get_session
from app.schemas import (
    ClientCreateRequest,
    ClientResponse,
    ClientUpdateRequest,
    VisitResponse,
    VisitSearchRequest,
)
from app.utils.client import (
    create_new_client,
    delete_client_by_id,
    find_client_by_substr,
    get_client_by_id,
    update_client,
)
from app.utils.visit import svc_get_visits_by_filter

router = APIRouter(prefix="/clients", tags=["client"])


@router.get(
    "/",
    response_model=list[ClientResponse],
    status_code=status.HTTP_200_OK
)
async def find_clients(
        _: Request,
        session: AsyncSession = Depends(get_session),
        search_substr: str = Query(default="", title="Search substr"),
):
    clients = await find_client_by_substr(session, search_substr)
    return clients


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=ClientResponse,
    responses={
        status.HTTP_422_UNPROCESSABLE_ENTITY: {"description": "Validation error, invalid data"},
        status.HTTP_409_CONFLICT: {"description": "Client with this phone number already exists"},
    },
)
async def create_client(
        _: Request,
        potential_client: ClientCreateRequest = Body(...),
        session: AsyncSession = Depends(get_session),
):
    client, message = await create_new_client(session, potential_client)

    if not client:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=message
        )

    return client


@router.get(
    "/{client_id}",
    response_model=ClientResponse,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Client with this uuid not found"},
    }
)
async def get_client(
        _: Request,
        client_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
):
    client = await get_client_by_id(session, client_id)
    if not client:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND)
    return client


@router.patch(
    "/{client_id}",
    status_code=status.HTTP_200_OK,
    response_model=ClientResponse,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Client not found"},
    }
)
async def patch_client(
        _: Request,
        client_id: uuid.UUID,
        update_request: ClientUpdateRequest = Body(...),
        session: AsyncSession = Depends(get_session)
):
    client = await update_client(session, client_id, update_request)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return client


@router.delete(
    "/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Client not found"},
    }
)
async def delete_client(
        _: Request,
        client_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
):
    is_deleted = await delete_client_by_id(session, client_id)
    if not is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


@router.get(
    "/{client_id}/visits",
    response_model=list[VisitResponse],
    status_code=status.HTTP_200_OK,
)
async def get_visits(
        _: Request,
        client_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
):
    search = VisitSearchRequest(client_id=client_id)
    visits = await svc_get_visits_by_filter(session, search)
    return visits
