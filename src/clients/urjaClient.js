import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import crypto from 'crypto';
import env from '../config/env.js';

export class UrjaClient {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl]
   * @param {string} [options.username]
   * @param {string} [options.password]
   * @param {number} [options.timeout]
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || env.URJA_BASE_URL;
    this.username = options.username || env.URJA_USERNAME;
    this.password = options.password || env.URJA_PASSWORD;
    this.timeout = options.timeout || env.UPSTREAM_TIMEOUT_MS;

    this.cookieJar = new CookieJar();
    this.loginPromise = null;
    this.isAuthenticated = false;

    // Build wrapped axios instance with cookie jar support
    this.http = wrapper(
      axios.create({
        baseURL: this.baseUrl,
        jar: this.cookieJar,
        withCredentials: true,
        timeout: this.timeout,
        headers: {
          'User-Agent': 'FlockEnergy-API-Wrapper/1.0',
          'Accept': 'application/json, text/html, */*',
        },
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 400, // allow 3xx to handle or inspect
      })
    );

    // Response interceptor for automatic session refresh on 401 or redirect to /login
    this.http.interceptors.response.use(
      response => {
        // Detect silent redirect to login page in HTML responses
        if (
          typeof response.data === 'string' &&
          (response.data.includes('Urja Meter Ops — Sign in') || response.request?.path === '/login')
        ) {
          const error = new Error('Session expired: redirected to login');
          error.status = 401;
          error.config = response.config;
          throw error;
        }
        return response;
      },
      async error => {
        const originalRequest = error.config;

        // If upstream rejected with 401 and request hasn't been retried yet
        if (error.response?.status === 401 || error.status === 401) {
          if (originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/login')) {
            originalRequest._retry = true;
            this.isAuthenticated = false;
            await this.login();
            return this.http(originalRequest);
          }
        }
        throw error;
      }
    );
  }

  /**
   * Performs authentication against Urja Ops portal.
   * Uses concurrency lock (loginPromise) so multiple simultaneous requests
   * share a single login attempt instead of firing concurrent logins.
   * @returns {Promise<void>}
   */
  async login() {
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      try {
        const loginUrl = `${this.baseUrl}/login`;

        // SvelteKit CSRF requires Origin and Referer matching the portal domain
        const payload = new URLSearchParams({
          email: this.username,
          password: this.password,
        }).toString();

        const response = await this.http.post('/login', payload, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': this.baseUrl,
            'Referer': loginUrl,
          },
          // Do not follow 303 redirect immediately so we can confirm Set-Cookie
          maxRedirects: 0,
          validateStatus: status => (status >= 200 && status < 400) || status === 401,
        });

        // Urja Ops returns 200 with JSON payload {"type":"failure", status: 401} on wrong credentials
        if (typeof response.data === 'object' && response.data?.type === 'failure') {
          this.isAuthenticated = false;
          throw new Error('Upstream authentication rejected credentials');
        }

        // Verify session cookie was set
        const cookies = await this.cookieJar.getCookies(this.baseUrl);
        const hasSession = cookies.some(c => c.key.includes('session_token') || c.key.includes('better-auth'));

        if (!hasSession && response.status !== 303 && response.data?.type !== 'redirect') {
          this.isAuthenticated = false;
          throw new Error('Upstream login failed: no session cookie established');
        }

        this.isAuthenticated = true;
      } finally {
        this.loginPromise = null;
      }
    })();

    return this.loginPromise;
  }

  /**
   * Ensures active session before executing request.
   * @returns {Promise<void>}
   */
  async ensureAuthenticated() {
    if (!this.isAuthenticated) {
      await this.login();
    }
  }

  /**
   * Searches meters via upstream JSON endpoint /portal/meters/search?q=...&page=...
   * @param {string} [q='']
   * @param {number} [page=1]
   * @returns {Promise<{ data: Array<object>, total: number, page: number, pageSize: number }>}
   */
  async searchMeters(q = '', page = 1) {
    await this.ensureAuthenticated();
    const response = await this.http.get('/portal/meters/search', {
      params: { q, page },
    });
    return response.data;
  }

  /**
   * Fetches meter detail page HTML from /meters/:id
   * @param {string} meterId
   * @returns {Promise<{ html: string, status: number }>}
   */
  async getMeterHtml(meterId) {
    await this.ensureAuthenticated();
    try {
      const response = await this.http.get(`/meters/${encodeURIComponent(meterId)}`, {
        headers: { Accept: 'text/html' },
      });
      return { html: response.data, status: response.status };
    } catch (err) {
      if (err.response?.status === 404) {
        return { html: null, status: 404 };
      }
      throw err;
    }
  }

  /**
   * Fetches meter location from /portal/meters/:id/geo
   * @param {string} meterId
   * @returns {Promise<{ latitude: string, longitude: string }|null>}
   */
  async getMeterGeo(meterId) {
    await this.ensureAuthenticated();
    try {
      const response = await this.http.get(`/portal/meters/${encodeURIComponent(meterId)}/geo`);
      return response.data?.data || null;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Fetches meter energy/consumption readings from /portal/meters/:id/energy
   * @param {string} meterId
   * @returns {Promise<Array<object>>}
   */
  async getMeterEnergy(meterId) {
    await this.ensureAuthenticated();
    try {
      const response = await this.http.get(`/portal/meters/${encodeURIComponent(meterId)}/energy`);
      return response.data?.data || [];
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Fetches transformers list from /portal/dts?page=...
   * @param {number} [page=1]
   * @returns {Promise<{ data: Array<object>, total: number, page: number, pageSize: number }>}
   */
  async getTransformers(page = 1) {
    await this.ensureAuthenticated();
    const response = await this.http.get('/portal/dts', {
      params: { page },
    });
    return response.data;
  }

  /**
   * Fetches HMAC signing secret from /portal/keys
   * @returns {Promise<string>}
   */
  async getSigningSecret() {
    await this.ensureAuthenticated();
    const response = await this.http.get('/portal/keys');
    return response.data?.data?.signingSecret;
  }

  /**
   * Bulk exports all meters using signed HMAC /portal/export endpoint
   * @returns {Promise<{ total: number, data: Array<object> }>}
   */
  async exportMeters() {
    await this.ensureAuthenticated();
    const secret = await this.getSigningSecret();
    const method = 'GET';
    const path = '/portal/export';
    const queryString = 'page=1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const message = [method, path, queryString, timestamp].join('\n');
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    const response = await this.http.get(`${path}?${queryString}`, {
      headers: {
        'x-timestamp': timestamp,
        'x-signature': signature,
      },
    });
    return response.data;
  }
}

// Default singleton instance
export const urjaClient = new UrjaClient();
export default urjaClient;
