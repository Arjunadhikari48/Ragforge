from datetime import datetime
from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: int
    filename: str
    num_chunks: int
    uploaded_at: datetime

    class Config:
        from_attributes = True