(() => {
  const TOKEN_KEY = 'ragforge_access_token';
  const $ = (selector) => document.querySelector(selector);
  const authView = $('#auth-view');
  const workspace = $('#workspace');
  const authForm = $('#auth-form');
  const authError = $('#auth-error');
  const authTitle = $('#auth-title');
  const authSubtitle = $('#auth-subtitle');
  const authSubmit = $('#auth-submit');
  const switchButton = $('#switch-mode');
  const accountLabel = $('#account-label');
  const signout = $('#signout');
  const documents = $('#documents');
  const uploadStatus = $('#upload-status');
  const uploadMessage = $('#upload-message');
  const uploadProgress = $('#upload-progress');
  const pdfInput = $('#pdf-input');
  const dropzone = $('#dropzone');
  const conversation = $('#conversation');
  const welcomeState = $('#welcome-state');
  const messages = $('#messages');
  const chatForm = $('#chat-form');
  const questionInput = $('#question');
  const askButton = $('#ask-button');
  let registerMode = false;
  let pendingChat = false;
  let pendingUpload = false;

  function setAuthMode(register) {
    registerMode = register;
    authTitle.textContent = register ? 'Create your account' : 'Welcome back';
    authSubtitle.textContent = register ? 'Set up a private space for your documents.' : 'Sign in to continue to your workspace.';
    authSubmit.innerHTML = register ? 'Create account <span aria-hidden="true">→</span>' : 'Sign in <span aria-hidden="true">→</span>';
    $('#switch-copy').textContent = register ? 'Already have an account?' : 'New to RAGForge?';
    switchButton.textContent = register ? 'Sign in' : 'Create an account';
    $('#password').autocomplete = register ? 'new-password' : 'current-password';
    authError.classList.add('hidden');
  }

  switchButton.addEventListener('click', () => setAuthMode(!registerMode));

  function readableError(detail, fallback) {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg || 'Invalid input').join(' · ');
    return fallback;
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(path, { ...options, headers });
    if (response.status === 401 && token) {
      showLoggedOut('Your session has expired. Sign in again to continue.');
      throw new Error('Your session has expired. Sign in again to continue.');
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).detail; } catch (_) { /* response may not be JSON */ }
      throw new Error(readableError(detail, `Request failed (${response.status}). Please try again.`));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function login(email, password) {
    const body = new URLSearchParams({ username: email, password });
    const result = await request('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    sessionStorage.setItem(TOKEN_KEY, result.access_token);
    showWorkspace(email);
    await loadDocuments();
  }

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    authError.classList.add('hidden');
    const email = $('#email').value.trim();
    const password = $('#password').value;
    authSubmit.disabled = true;
    authSubmit.textContent = registerMode ? 'Creating account…' : 'Signing in…';
    try {
      if (registerMode) {
        await request('/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      }
      await login(email, password);
    } catch (error) {
      authError.textContent = error.message;
      authError.classList.remove('hidden');
    } finally {
      authSubmit.disabled = false;
      authSubmit.innerHTML = registerMode ? 'Create account <span aria-hidden="true">→</span>' : 'Sign in <span aria-hidden="true">→</span>';
    }
  });

  function showWorkspace(email) {
    authView.classList.add('hidden');
    workspace.classList.remove('hidden');
    accountLabel.textContent = email || 'Signed in';
    signout.classList.remove('hidden');
    $('#doc-count').textContent = '…';
  }

  function showLoggedOut(message = '') {
    sessionStorage.removeItem(TOKEN_KEY);
    workspace.classList.add('hidden');
    authView.classList.remove('hidden');
    signout.classList.add('hidden');
    accountLabel.textContent = 'Workspace ready';
    if (message) {
      authError.textContent = message;
      authError.classList.remove('hidden');
    }
  }

  signout.addEventListener('click', () => showLoggedOut());

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  async function loadDocuments() {
    try {
      const items = await request('/knowledge');
      $('#doc-count').textContent = `${items.length} ${items.length === 1 ? 'file' : 'files'}`;
      if (!items.length) {
        documents.innerHTML = '<div class="empty-library"><span class="empty-file">＋</span><span>No documents yet</span><small>Your PDFs will appear here.</small></div>';
        return;
      }
      documents.innerHTML = items.map((doc) => {
        const date = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Added to library';
        return `<div class="doc-row"><span class="pdf-badge">PDF</span><span class="doc-meta"><strong title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</strong><small>${Number(doc.num_chunks) || 0} passages · ${escapeHtml(date)}</small></span><button type="button" class="delete-doc" data-id="${Number(doc.id)}" aria-label="Remove ${escapeHtml(doc.filename)}" title="Remove document">×</button></div>`;
      }).join('');
    } catch (error) {
      showUploadStatus(error.message, true);
    }
  }

  documents.addEventListener('click', async (event) => {
    const button = event.target.closest('.delete-doc');
    if (!button) return;
    if (!window.confirm('Remove this PDF from your library?')) return;
    button.disabled = true;
    try {
      await request(`/knowledge/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
      await loadDocuments();
    } catch (error) {
      button.disabled = false;
      showUploadStatus(error.message, true);
    }
  });

  function showUploadStatus(message, isError = false, progress = null) {
    uploadMessage.textContent = message;
    uploadStatus.classList.toggle('error', isError);
    uploadStatus.classList.remove('hidden');
    uploadProgress.classList.toggle('hidden', progress === null || isError);
    if (progress !== null && !isError) uploadProgress.value = progress;
  }

  function uploadDocument(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/knowledge/upload');
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener('load', () => {
        let result = {};
        try { result = JSON.parse(xhr.responseText); } catch (_) { /* invalid response body */ }
        if (xhr.status === 401 && token) {
          const message = 'Your session has expired. Sign in again to continue.';
          showLoggedOut(message);
          reject(new Error(message));
        } else if (xhr.status >= 200 && xhr.status < 300) {
          resolve(result);
        } else {
          reject(new Error(readableError(result.detail, `Upload failed (${xhr.status}). Please try again.`)));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Upload could not reach the server. Check your connection and try again.')));
      xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
      const data = new FormData();
      data.append('file', file);
      xhr.send(data);
    });
  }

  async function uploadFile(file) {
    if (!file || pendingUpload) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showUploadStatus('Choose a PDF file to add it to your library.', true);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showUploadStatus('This PDF is larger than 25 MB. Choose a smaller file.', true);
      return;
    }
    pendingUpload = true;
    showUploadStatus(`Uploading ${file.name}…`, false, 0);
    dropzone.setAttribute('aria-busy', 'true');
    dropzone.setAttribute('aria-disabled', 'true');
    dropzone.style.pointerEvents = 'none';
    try {
      const doc = await uploadDocument(file, (percent) => {
        const message = percent < 100 ? `Uploading ${file.name}… ${percent}%` : `Upload complete. Preparing ${file.name}…`;
        showUploadStatus(message, false, percent);
      });
      showUploadStatus(`${doc.filename} is ready in your library.`);
      await loadDocuments();
    } catch (error) {
      showUploadStatus(error.message, true);
    } finally {
      dropzone.removeAttribute('aria-busy');
      dropzone.removeAttribute('aria-disabled');
      dropzone.style.pointerEvents = '';
      pendingUpload = false;
      pdfInput.value = '';
    }
  }

  pdfInput.addEventListener('change', () => uploadFile(pdfInput.files[0]));
  for (const name of ['dragenter', 'dragover']) dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', (event) => uploadFile(event.dataTransfer.files[0]));
  dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pdfInput.click(); } });

  function addUserMessage(text) {
    welcomeState.classList.add('hidden');
    const item = document.createElement('div');
    item.className = 'message user';
    item.textContent = text;
    messages.append(item);
    conversation.scrollTop = conversation.scrollHeight;
  }

  function addAssistantMessage(answer, sources) {
    const item = document.createElement('article');
    item.className = 'message assistant';
    const sourceMarkup = sources && sources.length ? `<div class="sources"><div class="sources-title">SOURCES · ${sources.length}</div>${sources.map((source) => `<div class="source-item"><strong>${escapeHtml(source.source || 'Document')}</strong><p>“${escapeHtml(source.snippet || '')}”</p></div>`).join('')}</div>` : '';
    item.innerHTML = `<div class="message-label"><span class="mini-spark">✳</span> RAGFORGE</div><div class="answer-text">${escapeHtml(answer)}</div>${sourceMarkup}`;
    messages.append(item);
    conversation.scrollTop = conversation.scrollHeight;
  }

  async function sendQuestion(text) {
    const clean = text.trim();
    if (!clean || pendingChat) return;
    pendingChat = true;
    askButton.disabled = true;
    addUserMessage(clean);
    questionInput.value = '';
    const loading = document.createElement('div');
    loading.className = 'message assistant';
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-label', 'Searching your library for an answer');
    chatForm.setAttribute('aria-busy', 'true');
    loading.innerHTML = '<div class="message-label"><span class="mini-spark" aria-hidden="true">✳</span> SEARCHING YOUR LIBRARY</div><div class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></div>';
    messages.append(loading);
    conversation.scrollTop = conversation.scrollHeight;
    try {
      const result = await request('/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: clean, top_k: 5, include_sources: true }),
      });
      loading.remove();
      addAssistantMessage(result.answer, result.sources || []);
    } catch (error) {
      loading.remove();
      const alert = document.createElement('div');
      alert.className = 'notice error';
      alert.setAttribute('role', 'alert');
      alert.textContent = error.message;
      messages.append(alert);
      conversation.scrollTop = conversation.scrollHeight;
    } finally {
      pendingChat = false;
      chatForm.removeAttribute('aria-busy');
      askButton.disabled = false;
      questionInput.focus();
    }
  }

  chatForm.addEventListener('submit', (event) => { event.preventDefault(); sendQuestion(questionInput.value); });
  questionInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); chatForm.requestSubmit(); }
  });
  document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => {
    questionInput.value = button.textContent.replace('↗', '').trim();
    questionInput.focus();
  }));

  if (sessionStorage.getItem(TOKEN_KEY)) {
    showWorkspace('Signed in');
    loadDocuments();
  }
})();
