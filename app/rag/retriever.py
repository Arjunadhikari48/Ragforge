from app.config import settings
from app.rag.ingestion import get_vector_store


def retrieve(collection_name: str, query: str, top_k: int | None = None):
    """Return a list of (Document, score) tuples sorted by relevance (lower = better)."""
    k = top_k or settings.TOP_K
    store = get_vector_store(collection_name)

    # Retrieve more candidates than needed, then trim
    results = store.similarity_search_with_score(query, k=k * 2)
    results.sort(key=lambda x: x[1])
    return results[:k]