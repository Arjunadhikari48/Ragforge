from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import chat, knowledge
from app.auth import router as auth_router
from app.config import settings
from app.db.session import Base, engine

app = FastAPI(
    title=settings.APP_NAME,
    description="Upload PDF documents and ask questions grounded in their contents.",
    version="1.0.0",
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(knowledge.router)
app.include_router(chat.router)


@app.get("/", include_in_schema=False)
def frontend():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "app": settings.APP_NAME}


@app.on_event("startup")
def initialize_app():
    # Development-friendly schema initialization. Use migrations for production.
    Base.metadata.create_all(bind=engine)
