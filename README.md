# RAGForge

RAGForge is a FastAPI service for uploading PDF knowledge sources and asking questions grounded in those files. Each account has an isolated set of documents. Text is split into chunks, embedded into a local Chroma database, retrieved for each question, and passed to an OpenAI-compatible chat API for answer generation.

## Advantages

- **Ask questions in plain language:** Find information in your PDFs without searching through each file manually.
- **Answers grounded in your documents:** Relevant passages are retrieved from your uploaded files and provided to the language model as context. The API can return source snippets with answers.
- **Separate libraries for each account:** Users can only list, search, and delete their own uploaded documents.
- **Keep document search data local:** PDF files, the SQLite database, and the Chroma vector index are stored in configured local directories by default.
- **Use an OpenAI-compatible provider:** Configure the API endpoint and model in `.env`; Groq is the default provider configuration.
- **Simple to run and explore:** The FastAPI service serves the web interface and provides interactive API docs at `/docs`.
- **Manage your library:** Upload PDFs, see how many passages were indexed, and remove documents you no longer need.

RAGForge is useful for personal research, study notes, and small team knowledge libraries. It works with PDFs that contain extractable text; scanned PDFs need OCR before they can be indexed.

## Project structure

```text
ragforge/
├── app/
│   ├── api/routes/          # Knowledge and chat API endpoints
│   ├── auth/                # Registration, login, and token authentication
│   ├── db/                  # Database setup and SQLAlchemy models
│   ├── rag/                 # PDF ingestion, vector retrieval, and answer generation
│   ├── schemas/             # API request and response schemas
│   ├── config.py            # Environment-based application settings
│   └── main.py              # FastAPI app and frontend serving
├── data/                    # Local uploads and vector index at runtime
├── frontend/
│   ├── app.js               # Browser-side application behavior
│   ├── index.html           # Web interface
│   └── styles.css           # Web interface styling
├── .env.example             # Example local configuration
├── README.md                # Setup and usage guide
└── requirements.txt         # Python dependencies
```

The app also creates `ragforge.db` in the project directory by default. The `.env` file, virtual environment, database, uploaded PDFs, and vector index are local configuration or runtime data and are not part of the source tree shown above.

## Requirements

- Python 3.10 or later
- An API key for an OpenAI-compatible chat completion service (Groq is the default endpoint and `openai/gpt-oss-120b` is the default model)
- Network access the first time the local sentence-transformer embedding model is downloaded

## Run locally (Windows PowerShell)

Run these commands from the project folder (the folder containing `requirements.txt`). Python 3.10 or newer is required; Python 3.11 is recommended.

1. Check that Python is available:

   ```powershell
   py --version
   ```

2. Create and activate a virtual environment, then install the dependencies:

   ```powershell
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

   If PowerShell blocks activation, open a PowerShell terminal with permission to run the activation script, or skip activation and use the environment's Python directly for the remaining commands: `\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.

3. Create your local configuration file and open it for editing:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Set `OPENAI_API_KEY` to a valid key for your OpenAI-compatible chat service. The defaults use Groq and the `openai/gpt-oss-120b` model; if you use another provider, set `OPENAI_BASE_URL` and `LLM_MODEL` to that provider's API URL and model. Replace `SECRET_KEY` with a long, private random value. Save `.env` before continuing. Do not share or commit this file.

4. Start the app from the project folder:

   ```powershell
   python -m uvicorn app.main:app --reload
   ```

   Leave this terminal running. On startup, the app creates the local database tables. The first PDF upload may take longer because the embedding model is downloaded; that requires network access.

5. Open <http://127.0.0.1:8000/> to use the app, or <http://127.0.0.1:8000/docs> for the interactive API documentation. Check <http://127.0.0.1:8000/health> for the health response. The frontend and API are served from the same address; no separate frontend server is needed.

6. In the app, create an account, sign in, upload a text-based PDF, and ask a question about it. Alternatively, in `/docs`, call `POST /auth/register`, then authorize using the access token from `POST /auth/login` (enter the email as `username` and the password as form fields). Upload through `POST /knowledge/upload`, then ask questions through `POST /chat`.

To stop the development server, focus its terminal and press **Ctrl+C**. Restart it with the same `uvicorn` command. The SQLite database, uploaded PDFs, and vector index are stored locally (`ragforge.db` and the configured `data` directories), so keep those files if you want to retain your data.

## API overview

All knowledge and chat endpoints require a bearer token. Register at `POST /auth/register`, then use `POST /auth/login` with form fields `username` (the email address) and `password`. Copy the returned access token into the Authorize control in `/docs`.

- `POST /knowledge/upload`: upload one PDF as multipart field `file` (maximum size is `MAX_UPLOAD_SIZE_MB`).
- `GET /knowledge`: list the signed-in user's documents.
- `DELETE /knowledge/{doc_id}`: remove a document and its vector collection.
- `POST /chat`: JSON body such as `{"question":"What is the main topic?","top_k":5,"include_sources":true}`.

Documents without extractable text (for example, scanned PDFs without an OCR text layer) are rejected. Chat responses include source snippets and relevance scores when `include_sources` is enabled. Each account only searches its own document collections.

## Configuration

Copy `.env.example` to `.env` and adjust the values for your environment. `OPENAI_BASE_URL` and `LLM_MODEL` select the OpenAI-compatible chat endpoint and model. `EMBEDDING_MODEL` selects a Sentence Transformers model. `CHROMA_DIR` and `UPLOAD_DIR` control local persistence; back these directories up if the data matters.

The service creates missing SQL tables on startup for local development. For production, use database migrations, a strong unique `SECRET_KEY`, HTTPS, controlled `CORS_ORIGINS`, managed persistence, request limits at the proxy, and an appropriately secured database. The default SQLite database and local vector store are intended for development and small single-instance deployments.
