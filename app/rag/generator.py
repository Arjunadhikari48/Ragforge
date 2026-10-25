from openai import OpenAI

from app.config import settings

SYSTEM_PROMPT = """You are a rigorous knowledge-base Q&A assistant.

## Rules
1. Answer the user's question **only** using the context below.
2. If the context does not contain the answer, reply: "I cannot answer based on the available documents."
3. Cite the source file name(s) in your answer where relevant.
4. Be concise and accurate. Do not invent facts.

## Context
{context}
"""


def _client() -> OpenAI:
    return OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)


def build_context(docs_with_scores) -> str:
    parts = []
    for doc, _score in docs_with_scores:
        src = doc.metadata.get("source", "unknown")
        parts.append(f"[Source: {src}]\n{doc.page_content}")
    return "\n\n---\n\n".join(parts)


def generate_answer(query: str, docs_with_scores) -> str:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    context = build_context(docs_with_scores)
    response = _client().chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
            {"role": "user", "content": query},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content or "I cannot answer based on the available documents."
