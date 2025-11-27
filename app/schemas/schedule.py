import datetime
import uuid
from datetime import time, timedelta

from pydantic import BaseModel

from app.schemas.base import BaseCreateRequest, BaseResponse


class ScheduleCreateRequest(BaseCreateRequest):
    doctor_id: uuid.UUID
    date: datetime.date

    start_time: time
    end_time: time

    duration: timedelta


class ScheduleResponse(BaseResponse):
    doctor_id: uuid.UUID
    date: datetime.date

    start_time: time
    end_time: time

    duration: timedelta


class ScheduleUpdateRequest(BaseModel):
    doctor_id: uuid.UUID | None = None
    date: datetime.date | None = None

    start_time: time | None = None
    end_time: time | None = None

    duration: timedelta | None = None
