import crypto from 'crypto';
import { createLogger, FreightError } from '@chinalab/utils';

const log = createLogger('HubbuyClient');

const BASE_URL = 'https://api.hubbuycn.com/api';
const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Lang': 'en-us',
  'Terminal': 'pc',
  'Currency': 'BRL',
  'Country': 'BR',
  'Invitation-Code': '',
  'Origin': 'https://www.hubbuycn.com',
  'Referer': 'https://www.hubbuycn.com/',
};

interface LoginResponse {
  code: number;
  data: { data: { token: string } };
}

interface FreightPayload {
  destination_country_id: number;
  weight: number;
  category_ids: string[];
  dimensions: { length: number; width: number; height: number };
  volume_weight: number;
}

let authToken: string | null = null;
let isRefreshingToken = false;
let loginPromise: Promise<string> | null = null;

let nextAvailableTime = Date.now();

async function enforceRateLimit(): Promise<void> {
  const rateMs = parseInt(process.env.API_RATE_LIMIT_MS || '1000', 10);
  const now = Date.now();
  const waitMs = Math.max(0, nextAvailableTime - now);
  nextAvailableTime = now + waitMs + rateMs;
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

async function login(): Promise<string> {
  if (isRefreshingToken && loginPromise) return loginPromise;

  isRefreshingToken = true;
  loginPromise = (async () => {
    const email = process.env.HUBBUY_EMAIL!;
    const password = process.env.HUBBUY_PASSWORD!;

    if (!email || !password) {
      throw new FreightError('HUBBUY_EMAIL ou HUBBUY_PASSWORD não configurados no .env');
    }

    const passwordMd5 = crypto.createHash('md5').update(password).digest('hex');

    await enforceRateLimit();

    const res = await fetch(`${BASE_URL}/user/loginByVer`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        email,
        password: passwordMd5,
        invitation_type: 'code',
      }),
    });

    const data = (await res.json()) as LoginResponse;

    if (data.code !== 200) {
      throw new FreightError(`Login HubbuyCN falhou: ${JSON.stringify(data)}`);
    }

    const token = (data.data as any).token;
    authToken = token;
    log.info('Login HubbuyCN realizado com sucesso');
    return token;
  })().finally(() => {
    isRefreshingToken = false;
    loginPromise = null;
  });

  return loginPromise;
}

async function getToken(): Promise<string> {
  if (authToken) return authToken;
  return login();
}

export async function calculateFreight(
  categoryIds: string[],
  weightGrams: number,
): Promise<unknown> {
  const token = await getToken();

  const payload: FreightPayload = {
    destination_country_id: 253,
    weight: weightGrams,
    category_ids: categoryIds,
    dimensions: { length: 0, width: 0, height: 0 },
    volume_weight: 0,
  };

  await enforceRateLimit();

  const res = await fetch(`${BASE_URL}/Delivery/calculateDeliveryFee`, {
    method: 'POST',
    headers: { ...HEADERS, Token: token },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as { code: number; data: unknown };

  if (data.code === 101006) {
    log.warn('Token expirado, renovando...');
    authToken = null;
    const newToken = await login();
    await enforceRateLimit();
    const retry = await fetch(`${BASE_URL}/Delivery/calculateDeliveryFee`, {
      method: 'POST',
      headers: { ...HEADERS, Token: newToken },
      body: JSON.stringify(payload),
    });
    return (await retry.json() as { data: unknown }).data;
  }

  return data.data;
}