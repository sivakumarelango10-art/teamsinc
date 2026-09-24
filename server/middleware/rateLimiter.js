/**
 * In-memory sliding window rate limiter for server-to-server integration endpoints.
 */
class RateLimiter {
  constructor({ windowMs = 60 * 1000, maxRequests = 100 } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();

    // Periodic sweep every 5 minutes to prevent memory leak
    this.sweepInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.requests.entries()) {
        const valid = timestamps.filter(t => now - t < this.windowMs);
        if (valid.length === 0) {
          this.requests.delete(key);
        } else {
          this.requests.set(key, valid);
        }
      }
    }, 5 * 60 * 1000);

    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  middleware() {
    return (req, res, next) => {
      const clientKey = req.headers['x-api-key'] ||
                        req.headers['x-forwarded-for'] ||
                        req.socket?.remoteAddress ||
                        'unknown-client';

      const now = Date.now();
      let timestamps = this.requests.get(clientKey) || [];

      // Filter timestamps within current sliding window
      timestamps = timestamps.filter(t => now - t < this.windowMs);

      const remaining = Math.max(0, this.maxRequests - timestamps.length);
      const resetTime = Math.ceil((now + this.windowMs) / 1000);

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining - 1));
      res.setHeader('X-RateLimit-Reset', resetTime);

      if (timestamps.length >= this.maxRequests) {
        const retryAfterSeconds = Math.ceil((timestamps[0] + this.windowMs - now) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
        return res.status(429).json({
          success: false,
          error: 'Too Many Requests: Rate limit exceeded. Please retry later.',
          retryAfterSeconds
        });
      }

      timestamps.push(now);
      this.requests.set(clientKey, timestamps);
      next();
    };
  }

  reset() {
    this.requests.clear();
  }
}

export const integrationRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60
});

export const exportRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20
});

export default integrationRateLimiter;
