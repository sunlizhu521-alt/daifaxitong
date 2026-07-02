const attempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function checkLoginRateLimit(identifier: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const record = attempts.get(identifier);

  if (record && record.count >= MAX_ATTEMPTS) {
    const elapsed = (now - record.lastAttempt) / 1000 / 60;
    if (elapsed < LOCKOUT_MINUTES) {
      const remaining = Math.ceil(LOCKOUT_MINUTES - elapsed);
      return { allowed: false, message: `密码错误次数过多，请 ${remaining} 分钟后重试` };
    }
    attempts.delete(identifier);
  }
  return { allowed: true };
}

export function recordLoginFailure(identifier: string) {
  const record = attempts.get(identifier);
  if (record) {
    record.count++;
    record.lastAttempt = Date.now();
  } else {
    attempts.set(identifier, { count: 1, lastAttempt: Date.now() });
  }
}

export function clearLoginAttempts(identifier: string) {
  attempts.delete(identifier);
}

// 每10分钟清理过期的锁定记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if ((now - record.lastAttempt) / 1000 / 60 >= LOCKOUT_MINUTES) {
      attempts.delete(key);
    }
  }
}, 1000 * 60 * 10).unref();
