/**
 * 📱 Meta Graph API Client
 *
 * Wrapper HTTP pour l'API Graph de Meta (Facebook/Instagram).
 * Utilisé par tous les services Meta (token-manager, messaging, engagement).
 */

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class MetaGraphApiError extends Error {
  code: number;
  subcode?: number;
  type: string;

  constructor(apiError: MetaApiError["error"]) {
    super(apiError.message);
    this.name = "MetaGraphApiError";
    this.code = apiError.code;
    this.subcode = apiError.error_subcode;
    this.type = apiError.type;
  }
}

/**
 * GET request to Meta Graph API.
 */
export async function metaGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${META_BASE_URL}${path}`);
  url.searchParams.set("access_token", accessToken);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new MetaGraphApiError(
      data.error || { message: `HTTP ${response.status}`, type: "HttpError", code: response.status }
    );
  }

  return data as T;
}

/**
 * POST request to Meta Graph API.
 */
export async function metaPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${META_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new MetaGraphApiError(
      data.error || { message: `HTTP ${response.status}`, type: "HttpError", code: response.status }
    );
  }

  return data as T;
}

/**
 * DELETE request to Meta Graph API.
 */
export async function metaDelete(
  path: string,
  accessToken: string
): Promise<{ success: boolean }> {
  const url = `${META_BASE_URL}${path}?access_token=${accessToken}`;

  const response = await fetch(url, { method: "DELETE" });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new MetaGraphApiError(
      data.error || { message: `HTTP ${response.status}`, type: "HttpError", code: response.status }
    );
  }

  return data;
}
