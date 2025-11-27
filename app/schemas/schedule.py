import datetime
import uuid
from datetime import time, timedelta

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
