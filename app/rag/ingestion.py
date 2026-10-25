import os
import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_huggingface import HuggingFaceEmbeddings

from app.config import settings


def get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)


def get_vector_store(collection_name: str) -> Chroma:
    return Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings(),
        persist_directory=settings.CHROMA_DIR,
    )


def ingest_pdf(file_path: str, collection_name: str, source_name: str | None = None) -> int:
    loader = PyPDFLoader(file_path)
    docs = loader.load()
    if not docs or not any(page.page_content.strip() for page in docs):
        raise ValueError("The PDF contains no extractable text")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    if not chunks:
        raise ValueError("The PDF contains no extractable text")

    source_name = source_name or os.path.basename(file_path)
    for c in chunks:
        c.metadata["source"] = source_name
        c.metadata["page"] = int(c.metadata.get("page", 0)) + 1

    store = get_vector_store(collection_name)
    store.add_documents(chunks)

    return len(chunks)


def new_collection_name() -> str:
    return f"doc_{uuid.uuid4().hex[:12]}"


def delete_collection(collection_name: str) -> None:
    store = get_vector_store(collection_name)
    store.delete_collection()
