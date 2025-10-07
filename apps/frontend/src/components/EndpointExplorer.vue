<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ExplorerState = {
  method: HttpMethod;
  path: string;
  requestBody: string;
  isLoading: boolean;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
  error?: string;
};

const apiBaseUrl = computed(
  () => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
);

const state = reactive<ExplorerState>({
  method: 'GET',
  path: '/api/health',
  requestBody: '{\n  "example": true\n}',
  isLoading: false
});

const requestBodyIsJson = ref(true);

const submit = async () => {
  state.isLoading = true;
  state.error = undefined;
  state.response = undefined;

  const url = `${apiBaseUrl.value}${state.path.startsWith('/') ? '' : '/'}${state.path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

  let body: BodyInit | undefined;
  requestBodyIsJson.value = true;

  if (state.method !== 'GET' && state.method !== 'DELETE' && state.requestBody.trim().length > 0) {
    try {
      body = JSON.stringify(JSON.parse(state.requestBody));
    } catch (error) {
      requestBodyIsJson.value = false;
      state.error = 'Request body must be valid JSON.';
      state.isLoading = false;
      return;
    }
  }

  try {
    const response = await fetch(url, {
      method: state.method,
      headers,
      body
    });

    const text = await response.text();
    let formattedBody = text;
    try {
      formattedBody = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // keep original text if not JSON
    }

    const headersObject: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObject[key] = value;
    });

    state.response = {
      status: response.status,
      statusText: response.statusText,
      headers: headersObject,
      body: formattedBody
    };
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    state.isLoading = false;
  }
};

const reset = () => {
  state.method = 'GET';
  state.path = '/api/health';
  state.requestBody = '{\n  "example": true\n}';
  state.response = undefined;
  state.error = undefined;
};
</script>

<template>
  <section class="explorer">
    <form class="explorer__form" @submit.prevent="submit">
      <div class="explorer__row">
        <label class="explorer__label" for="method">Method</label>
        <select id="method" v-model="state.method" class="explorer__input">
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      <div class="explorer__row">
        <label class="explorer__label" for="path">Endpoint path</label>
        <input
          id="path"
          v-model="state.path"
          class="explorer__input"
          placeholder="/api/example"
          required
        />
      </div>

      <div class="explorer__row">
        <label class="explorer__label" for="body">Request body</label>
        <textarea
          id="body"
          v-model="state.requestBody"
          class="explorer__textarea"
          spellcheck="false"
          rows="8"
        ></textarea>
        <p v-if="!requestBodyIsJson" class="explorer__error">Provide valid JSON.</p>
      </div>

      <div class="explorer__actions">
        <button type="submit" class="explorer__button" :disabled="state.isLoading">
          {{ state.isLoading ? 'Sending…' : 'Send request' }}
        </button>
        <button type="button" class="explorer__button explorer__button--secondary" @click="reset">
          Reset
        </button>
      </div>
    </form>

    <aside class="explorer__response" aria-live="polite">
      <div class="explorer__response-header">
        <div>
          <h2>Response</h2>
          <p class="explorer__hint">Base URL: {{ apiBaseUrl }}</p>
        </div>
        <p v-if="state.response" class="explorer__status">
          {{ state.response.status }} {{ state.response.statusText }}
        </p>
      </div>

      <p v-if="state.error" class="explorer__error">{{ state.error }}</p>

      <div v-if="state.response" class="explorer__panel">
        <h3>Headers</h3>
        <pre>{{ JSON.stringify(state.response.headers, null, 2) }}</pre>
      </div>

      <div v-if="state.response" class="explorer__panel">
        <h3>Body</h3>
        <pre>{{ state.response.body }}</pre>
      </div>

      <p v-else class="explorer__placeholder">
        Submit a request to view response details.
      </p>
    </aside>
  </section>
</template>

<style scoped>
.explorer {
  width: min(100%, 1080px);
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.explorer__form,
.explorer__response {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(12px);
}

.explorer__row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.explorer__label {
  font-weight: 600;
  letter-spacing: 0.01em;
}

.explorer__input,
.explorer__textarea,
.explorer__button {
  font: inherit;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.75);
  color: #f8fafc;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.explorer__input:focus,
.explorer__textarea:focus,
.explorer__button:focus-visible {
  outline: none;
  border-color: #38bdf8;
  background: rgba(30, 64, 175, 0.75);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
}

.explorer__textarea {
  resize: vertical;
  font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  min-height: 200px;
  white-space: pre;
}

.explorer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.explorer__button {
  cursor: pointer;
  font-weight: 600;
  letter-spacing: 0.03em;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  border: none;
}

.explorer__button[disabled] {
  opacity: 0.65;
  cursor: not-allowed;
}

.explorer__button--secondary {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.explorer__response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
}

.explorer__hint {
  color: #94a3b8;
  margin: 0;
}

.explorer__status {
  font-weight: 600;
  color: #4ade80;
}

.explorer__error {
  color: #f87171;
  font-weight: 600;
}

.explorer__panel {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.explorer__panel pre {
  white-space: pre-wrap;
  margin: 0.5rem 0 0;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.85rem;
}

.explorer__placeholder {
  color: #94a3b8;
}
</style>
