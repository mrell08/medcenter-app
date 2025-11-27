from sqlalchemy.dialects.postgresql import TEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .human import Human


class Doctor(Human):
    __tablename__ = "doctor"

    speciality: Mapped[str] = mapped_column(TEXT)

    visits: Mapped[list["Visit"]] = relationship(back_populates="doctor")  # noqa
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="doctor", lazy="selectin")  # noqa
