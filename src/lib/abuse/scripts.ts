/** All keys share one hash tag. TIME keeps every instance on the Redis clock. */
export const ADMIT_SCRIPT = `
local expected = {'hash', 'hash', 'hash', 'zset', 'zset'}
for i = 1, 5 do
  local actual = redis.call('TYPE', KEYS[i]).ok
  if actual ~= 'none' and actual ~= expected[i] then
    return redis.error_reply('Invalid admission key type')
  end
end
local burst, refill, ipLimit, globalLimit, ipActive, globalActive, leaseMs =
  tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]),
  tonumber(ARGV[5]), tonumber(ARGV[6]), tonumber(ARGV[7])
local leaseId = ARGV[8]
if not burst or not refill or not ipLimit or not globalLimit or not ipActive or not globalActive or not leaseMs
  or burst < 1 or refill < 1 or ipLimit < 1 or globalLimit < 1 or ipActive < 1 or globalActive < 1
  or leaseMs < 1 or not leaseId or leaseId == '' then
  return redis.error_reply('Invalid admission arguments')
end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local day = math.floor(now / 86400000)
local reset = (day + 1) * 86400000
local function counter(key)
  local stored = redis.call('HMGET', key, 'day', 'count')
  if redis.call('EXISTS', key) == 1 and (not tonumber(stored[1]) or not tonumber(stored[2]) or tonumber(stored[2]) < 0) then
    error('Invalid admission counter')
  end
  if tonumber(stored[1]) == day then return tonumber(stored[2]) end
  return 0
end
local ipCount, globalCount = counter(KEYS[2]), counter(KEYS[3])
local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local tokens = burst
if redis.call('EXISTS', KEYS[1]) == 1 then
  if not tonumber(bucket[1]) or not tonumber(bucket[2]) or tonumber(bucket[1]) < 0 then
    return redis.error_reply('Invalid admission bucket')
  end
  tokens = math.min(burst, tonumber(bucket[1]) + math.max(0, now - tonumber(bucket[2])) * refill / 1000)
end
local function deny(reason, resume)
  return {0, reason, math.max(1, math.ceil((resume - now) / 1000)), resume}
end
if globalCount >= globalLimit then return deny('global_quota', reset) end
if ipCount >= ipLimit then return deny('ip_quota', reset) end
if tokens < 1 then return deny('rate', now + math.ceil((1 - tokens) * 1000 / refill)) end
-- Cleanup is bounded by configured concurrency, never unbounded request history.
for i = 4, 5 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now) end
for i = 4, 5 do
  local limit = ipActive
  if i == 5 then limit = globalActive end
  if redis.call('ZCARD', KEYS[i]) >= limit then
    local earliest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    return deny('capacity', tonumber(earliest[2]))
  end
  if redis.call('ZSCORE', KEYS[i], leaseId) then
    return redis.error_reply('Duplicate admission lease')
  end
end
-- No denied request debits daily allowance. All acceptance writes happen together.
redis.call('HSET', KEYS[1], 'tokens', tokens - 1, 'at', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(burst / refill * 1000) + 60000)
redis.call('HSET', KEYS[2], 'day', day, 'count', ipCount + 1)
redis.call('HSET', KEYS[3], 'day', day, 'count', globalCount + 1)
for i = 2, 3 do redis.call('PEXPIRE', KEYS[i], reset - now + 3600000) end
for i = 4, 5 do
  redis.call('ZADD', KEYS[i], now + leaseMs, leaseId)
  redis.call('PEXPIRE', KEYS[i], leaseMs + 1000)
end
return {1, leaseId}
`;

export const RELEASE_SCRIPT = `
for i = 1, 2 do
  local actual = redis.call('TYPE', KEYS[i]).ok
  if actual ~= 'none' and actual ~= 'zset' then
    return redis.error_reply('Invalid lease key type')
  end
end
for i = 1, 2 do redis.call('ZREM', KEYS[i], ARGV[1]) end
return 1
`;
