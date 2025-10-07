<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { fetchManifest } from '../discovery/client';
import type { ExplorerEndpoint, ExplorerEntityType, ExplorerManifest } from '../discovery/types';

type HttpMethod = ExplorerEndpoint['method'];

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

type NavigationSelection =
  | { type: 'module'; module: 'fields' | 'datatypes'; endpoint: ExplorerEndpoint }
  | { type: 'entity'; entity: ExplorerEntityType; endpoint: ExplorerEndpoint };

const apiBaseUrl = computed(
  () => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
);

const manifest = ref<ExplorerManifest>();
const manifestError = ref<string>();
const isLoadingManifest = ref(false);

const selectedNavigation = ref<NavigationSelection>();

const state = reactive<ExplorerState>({
  method: 'GET',
  path: '/api/health',
  requestBody: '{\n  "example": true\n}',
  isLoading: false
});

const requestBodyIsJson = ref(true);

const buildEndpointKey = (selection: NavigationSelection) => {
  if (selection.type === 'module') {
    return `${selection.module}:${selection.endpoint.method}:${selection.endpoint.path}`;
  }
  return `entity:${selection.entity.key}:${selection.endpoint.method}:${selection.endpoint.path}`;
};

const selectedEndpointKey = computed(() =>
  selectedNavigation.value ? buildEndpointKey(selectedNavigation.value) : undefined
);

const defaultBodyForMethod = (method: HttpMethod) => {
  if (method === 'GET' || method === 'DELETE') {
    return '';
  }
  return '{}';
};

const stringifyBody = (payload: unknown) => JSON.stringify(payload, null, 2);

const applySelection = (selection: NavigationSelection) => {
  selectedNavigation.value = selection;
  state.method = selection.endpoint.method;
  state.path = selection.endpoint.path;

  let nextBody = defaultBodyForMethod(selection.endpoint.method);

  if (selection.type === 'entity') {
    const examples = selection.entity.examples;
    if (selection.endpoint.method === 'POST') {
      if (selection.endpoint.name.toLowerCase() === 'create' && examples?.create) {
        nextBody = stringifyBody(examples.create);
      } else if (selection.endpoint.name.toLowerCase() === 'update' && examples?.update) {
        nextBody = stringifyBody(examples.update);
      }
    }
    if (
      selection.endpoint.method === 'GET' &&
      selection.endpoint.name.toLowerCase() === 'list' &&
      examples?.listQuery
    ) {
      nextBody = stringifyBody(examples.listQuery);
    }
  }

  state.requestBody = nextBody;
  state.response = undefined;
  state.error = undefined;
};

const selectDefaultEndpoint = (loadedManifest: ExplorerManifest) => {
  const entity = loadedManifest.modules.entities.types[0];
  if (entity?.routes[0]) {
    applySelection({ type: 'entity', entity, endpoint: entity.routes[0] });
    return;
  }

  const fieldsEndpoint = loadedManifest.modules.fields.endpoints[0];
  if (fieldsEndpoint) {
    applySelection({ type: 'module', module: 'fields', endpoint: fieldsEndpoint });
    return;
  }

  const datatypeEndpoint = loadedManifest.modules.datatypes.endpoints[0];
  if (datatypeEndpoint) {
    applySelection({ type: 'module', module: 'datatypes', endpoint: datatypeEndpoint });
  }
};

const loadManifest = async () => {
  isLoadingManifest.value = true;
  manifestError.value = undefined;

  try {
    const data = await fetchManifest(apiBaseUrl.value);
    manifest.value = data;
    selectDefaultEndpoint(data);
  } catch (error) {
    manifestError.value = error instanceof Error ? error.message : 'Failed to load manifest.';
    manifest.value = undefined;
  } finally {
    isLoadingManifest.value = false;
  }
};

onMounted(() => {
  void loadManifest();
});

watch(apiBaseUrl, () => {
  // When the base URL changes (e.g. environment switch), refresh the manifest.
  void loadManifest();
});

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
  if (selectedNavigation.value) {
    applySelection(selectedNavigation.value);
  } else {
    state.method = 'GET';
    state.path = '/api/health';
    state.requestBody = '{\n  "example": true\n}';
    state.response = undefined;
    state.error = undefined;
  }
};

const manifestBaseUrl = computed(() =>
  manifest.value ? `${apiBaseUrl.value}${manifest.value.baseUrl}` : apiBaseUrl.value
);
</script>

<template>
  <section class="explorer">
    <aside class="explorer__nav" aria-label="API navigation">
      <header class="explorer__nav-header">
        <h2>Available endpoints</h2>
        <button class="explorer__refresh" type="button" @click="loadManifest" :disabled="isLoadingManifest">
          {{ isLoadingManifest ? 'Refreshing…' : 'Refresh' }}
        </button>
      </header>

      <p v-if="isLoadingManifest" class="explorer__hint">Loading discovery manifest…</p>
      <p v-else-if="manifestError" class="explorer__error">{{ manifestError }}</p>

      <template v-else-if="manifest">
        <section class="explorer__nav-group">
          <h3>Fields</h3>
          <ul>
            <li
              v-for="endpoint in manifest.modules.fields.endpoints"
              :key="`fields:${endpoint.method}:${endpoint.path}`"
            >
              <button
                type="button"
                class="explorer__nav-item"
                :class="{
                  'explorer__nav-item--active':
                    selectedEndpointKey === `fields:${endpoint.method}:${endpoint.path}`
                }"
                @click="applySelection({ type: 'module', module: 'fields', endpoint })"
              >
                <span class="explorer__nav-method">{{ endpoint.method }}</span>
                <span class="explorer__nav-label">{{ endpoint.name }}</span>
                <span class="explorer__nav-path">{{ endpoint.path }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section class="explorer__nav-group">
          <h3>Datatypes</h3>
          <ul>
            <li
              v-for="endpoint in manifest.modules.datatypes.endpoints"
              :key="`datatypes:${endpoint.method}:${endpoint.path}`"
            >
              <button
                type="button"
                class="explorer__nav-item"
                :class="{
                  'explorer__nav-item--active':
                    selectedEndpointKey === `datatypes:${endpoint.method}:${endpoint.path}`
                }"
                @click="applySelection({ type: 'module', module: 'datatypes', endpoint })"
              >
                <span class="explorer__nav-method">{{ endpoint.method }}</span>
                <span class="explorer__nav-label">{{ endpoint.name }}</span>
                <span class="explorer__nav-path">{{ endpoint.path }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section class="explorer__nav-group">
          <h3>Entities</h3>
          <div
            v-for="entity in manifest.modules.entities.types"
            :key="entity.key"
            class="explorer__entity"
          >
            <h4 class="explorer__entity-title">{{ entity.label }}</h4>
            <ul>
              <li
                v-for="endpoint in entity.routes"
                :key="`entity:${entity.key}:${endpoint.method}:${endpoint.path}`"
              >
                <button
                  type="button"
                  class="explorer__nav-item"
                  :class="{
                    'explorer__nav-item--active':
                      selectedEndpointKey ===
                      `entity:${entity.key}:${endpoint.method}:${endpoint.path}`
                  }"
                  @click="applySelection({ type: 'entity', entity, endpoint })"
                >
                  <span class="explorer__nav-method">{{ endpoint.method }}</span>
                  <span class="explorer__nav-label">{{ endpoint.name }}</span>
                  <span class="explorer__nav-path">{{ endpoint.path }}</span>
                </button>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </aside>

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
        <label class="explorer__label" for="body">Request body / params</label>
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
          <p class="explorer__hint">Base URL: {{ manifestBaseUrl }}</p>
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
  width: min(100%, 1240px);
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(240px, 280px) repeat(2, minmax(280px, 1fr));
}

@media (max-width: 960px) {
  .explorer {
    grid-template-columns: 1fr;
  }
}

.explorer__nav,
.explorer__form,
.explorer__response {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(12px);
}

.explorer__nav {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.explorer__nav-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.explorer__refresh {
  font: inherit;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: transparent;
  color: #e2e8f0;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.explorer__refresh:hover,
.explorer__refresh:focus-visible {
  outline: none;
  border-color: #38bdf8;
  background: rgba(30, 64, 175, 0.35);
}

.explorer__nav-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.explorer__nav-group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.explorer__entity {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.explorer__entity-title {
  margin: 0;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #cbd5f5;
}

.explorer__nav-item {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 0.75rem;
  align-items: center;
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  background: rgba(30, 41, 59, 0.65);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.explorer__nav-item:hover,
.explorer__nav-item:focus-visible {
  outline: none;
  border-color: rgba(148, 163, 184, 0.7);
  background: rgba(30, 64, 175, 0.45);
}

.explorer__nav-item--active {
  border-color: #38bdf8;
  background: rgba(30, 64, 175, 0.6);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
}

.explorer__nav-method {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.2);
  color: #bae6fd;
}

.explorer__nav-label {
  font-weight: 600;
}

.explorer__nav-path {
  grid-column: 1 / -1;
  font-size: 0.75rem;
  color: #94a3b8;
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
