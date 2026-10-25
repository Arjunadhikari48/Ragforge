from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.models import Document, User
from app.db.session import get_db
from app.rag.generator import generate_answer
from app.rag.retriever import retrieve
from app.schemas.chat import ChatRequest, ChatResponse, SourceChunk

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    docs = db.query(Document).filter(Document.owner_id == user.id).all()
    if not docs:
        raise HTTPException(status_code=400, detail="No documents uploaded yet")

    all_hits = []
    retrieval_failed = 0
    for d in docs:
        try:
            hits = retrieve(d.collection_name, payload.question, payload.top_k)
            all_hits.extend(hits)
        except Exception:
            retrieval_failed += 1
            continue

    all_hits.sort(key=lambda x: x[1])
    top_k = payload.top_k or 5
    top_hits = all_hits[:top_k]

    if not top_hits:
        if retrieval_failed == len(docs):
            raise HTTPException(status_code=503, detail="Document search is temporarily unavailable")
        return ChatResponse(
            answer="I cannot answer based on the available documents.", sources=[]
        )

    try:
        answer = generate_answer(payload.question, top_hits)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Answer generation failed: {exc}") from exc

    sources = []
    if payload.include_sources:
        for doc, score in top_hits:
            sources.append(
                SourceChunk(
                    source=doc.metadata.get("source", "unknown"),
                    snippet=doc.page_content[:200],
                    score=float(score),
                )
            )

    return ChatResponse(answer=answer, sources=sources)
