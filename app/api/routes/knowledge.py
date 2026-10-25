import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config import settings
from app.db.models import Document, User
from app.db.session import get_db
from app.rag.ingestion import delete_collection, ingest_pdf, new_collection_name
from app.schemas.document import DocumentOut

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/upload", response_model=DocumentOut, status_code=201)
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_filename = os.path.basename(file.filename).replace("\\", "_")
    dest = os.path.join(settings.UPLOAD_DIR, f"{user.id}_{uuid.uuid4().hex}.pdf")
    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        if os.path.getsize(dest) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"PDF exceeds {settings.MAX_UPLOAD_SIZE_MB} MB")
        with open(dest, "rb") as f:
            if f.read(5) != b"%PDF-":
                raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")
    except Exception:
        if os.path.exists(dest):
            os.remove(dest)
        raise

    collection = new_collection_name()
    try:
        num_chunks = ingest_pdf(dest, collection, safe_filename)
    except Exception as e:
        if os.path.exists(dest):
            os.remove(dest)
        try:
            delete_collection(collection)
        except Exception:
            pass
        raise HTTPException(status_code=422, detail=f"Could not process PDF: {e}") from e

    doc = Document(
        filename=safe_filename,
        file_path=dest,
        collection_name=collection,
        num_chunks=num_chunks,
        owner_id=user.id,
    )
    db.add(doc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        if os.path.exists(dest):
            os.remove(dest)
        try:
            delete_collection(collection)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not save document metadata")
    db.refresh(doc)
    return doc


@router.get("", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Document).filter(Document.owner_id == user.id).all()


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.owner_id == user.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        delete_collection(doc.collection_name)
    except Exception:
        pass

    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
