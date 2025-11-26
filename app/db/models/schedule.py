import uuid
from datetime import date, time, timedelta

from sqlalchemy import UUID, ForeignKey, Date, Time
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.testing.schema import mapped_column

from app.db.models import Doctor
from app.db.models.base import Base


class Schedule(Base):
    __tablename__ = "schedule"

    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("doctor.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date)

    duration: Mapped[timedelta] = mapped_column(Time, default=timedelta(minutes=10))
    start_time: Mapped[time] = mapped_column(Time, default=time(7, 0))
    end_time: Mapped[time] = mapped_column(Time, default=time(22, 0))

    doctor: Mapped[Doctor] = relationship(
        "Doctor", back_populates="schedules"
    )
