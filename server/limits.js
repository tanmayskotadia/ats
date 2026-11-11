import { createHash } from 'node:crypto';
import { createClient } from 'redis';

const windowSeconds = 60;
const increment = `
local client = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if client >= tonumber(ARGV[1]) or total >= tonumber(ARGV[2]) then return 0 end
for i = 1, 2 do
  if redis.call('INCR', KEYS[i]) == 1 then redis.call('EXPIRE', KEYS[i], ARGV[3]) end
end
return 1
`;

export function integer(value, fallback, min, max) {
  const number = Number(value);
  return value && Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

export function createLimiter(env) {
  const perClient = integer(env.AI_REQUESTS_PER_CLIENT, 24, 1, 10000);
  const global = integer(env.AI_REQUESTS_PER_MINUTE, 120, 1, 100000);
  if (env.REDIS_URL) {
    const client = createClient({
      url: env.REDIS_URL, disableOfflineQueue: true,
      socket: { connectTimeout: 2000 }, commandsQueueMaxLength: 500,
    });
    client.on('error', () => {});
    client.connect().catch(() => {});
    return {
      async allow(ip) {
        if (!client.isReady) throw new Error('Rate limiter unavailable');
        const identity = createHash('sha256').update(ip).digest('hex');
        const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
        const scope = 'shortlist:{ai-rate}:' + bucket;
        const result = await client.withAbortSignal(AbortSignal.timeout(1500)).eval(increment, {
          keys: [scope + ':' + identity, scope + ':global'],
          arguments: [String(perClient), String(global), String(windowSeconds * 2)],
        });
        return result === 1;
      },
      close() { if (client.isOpen) client.destroy(); },
    };
  }
  let activeBucket = -1;
  let total = 0;
  const clients = new Map();
  return {
    allow(ip) {
      const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
      if (activeBucket !== bucket) {
        activeBucket = bucket;
        total = 0;
        clients.clear();
      }
      const count = clients.get(ip) ?? 0;
      if (count >= perClient || total >= global) return false;
      clients.set(ip, count + 1);
      total += 1;
      return true;
    },
    close() {},
  };
}
