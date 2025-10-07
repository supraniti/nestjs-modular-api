import type { EntitySchemaResponse, ExplorerManifest } from './types';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '');

const buildUrl = (baseUrl: string, path: string) =>
  `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? '' : '/'}${path}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload) && typeof payload.message === 'string') {
        message = payload.message;
      }
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }

  const data: unknown = await response.json();
  return data as T;
};

export const fetchManifest = async (
  baseUrl: string,
): Promise<ExplorerManifest> => {
  const url = buildUrl(baseUrl, '/api/discovery/manifest');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  return handleResponse<ExplorerManifest>(response);
};

export const fetchEntitySchema = async (
  baseUrl: string,
  entityKey: string,
): Promise<EntitySchemaResponse> => {
  const url = buildUrl(
    baseUrl,
    `/api/discovery/entities/${encodeURIComponent(entityKey)}/schema`,
  );
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  return handleResponse<EntitySchemaResponse>(response);
};
