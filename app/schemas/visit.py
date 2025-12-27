import datetime
import uuid

from pydantic import BaseModel

from app.db.enums import VisitStatusEnum
from app.schemas.base import BaseCreateRequest, BaseResponse


class VisitCreateRequest(BaseCreateRequest):
    client_id: uuid.UUID
    doctor_id: uuid.UUID

    start_date: datetime.datetime
    end_date: datetime.datetime | None = None

    cabinet: str | None = None
    procedure: str | None = ""
    cost: float | None = 0


class VisitResponse(BaseResponse):
    client_id: uuid.UUID
    doctor_id: uuid.UUID

    start_date: datetime.datetime
    end_date: datetime.datetime

    cabinet: str | None = None
    procedure: str | None = None
    cost: float | None = 0
    status: VisitStatusEnum

    client_name: str
    client_phone_number: str
    doctor_name: str


class VisitSearchRequest(BaseModel):
    client_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None

    start_date: datetime.datetime | None = None
    end_date: datetime.datetime | None = None

    cabinet: str | None = None
    procedure: str | None = None
    status: VisitStatusEnum | None = None
    reserve_list: bool = False


class VisitUpdateRequest(BaseModel):
    client_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None

    start_date: datetime.datetime | None = None
    end_date: datetime.datetime | None = None

    cost: float | None = None
    cabinet: str | None = None
    procedure: str | None = None
    status: VisitStatusEnum | None = None
