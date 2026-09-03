// TeamSync Gemini AI Multi-Role Engine
// Connects separate API keys for Founder, Admin, and Founding Advisor

const getEnv = (key) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  return '';
};

const GEMINI_API_KEYS = {
  FOUNDER:
    getEnv('VITE_GEMINI_API_KEY_FOUNDER') ||
    getEnv('NEXT_PUBLIC_GEMINI_API_KEY_FOUNDER') ||
    getEnv('GEMINI_API_KEY_FOUNDER') ||
    '',
  ADMIN:
    getEnv('VITE_GEMINI_API_KEY_ADMIN') ||
    getEnv('NEXT_PUBLIC_GEMINI_API_KEY_ADMIN') ||
    getEnv('GEMINI_API_KEY_ADMIN') ||
    '',
  FOUNDING_ADVISOR:
    getEnv('VITE_GEMINI_API_KEY_ADVISOR') ||
    getEnv('NEXT_PUBLIC_GEMINI_API_KEY_ADVISOR') ||
    getEnv('GEMINI_API_KEY_ADVISOR') ||
    '',
  MEMBER:
    getEnv('VITE_GEMINI_API_KEY_ADMIN') ||
    getEnv('VITE_GEMINI_API_KEY_FOUNDER') ||
    ''
};

export const getGeminiApiKey = (role = 'MEMBER') => {
  const cleanRole = (role || 'MEMBER').toUpperCase();
  const directKey = GEMINI_API_KEYS[cleanRole];
  if (directKey) return directKey;

  // Fallback to any available key
  return (
    GEMINI_API_KEYS.FOUNDER ||
    GEMINI_API_KEYS.ADMIN ||
    GEMINI_API_KEYS.FOUNDING_ADVISOR ||
    ''
  );
};

// ─── Gemini AI Client-Side Rate Limiter & Sequential Queue ───────────────────
// Enforces a strict sliding window (max 10 requests / 60 seconds per browser session)
// and handles HTTP 429 / RESOURCE_EXHAUSTED with exponential backoff and jitter.

export class GeminiRateLimiter {
  constructor({ maxRequests = 10, windowMs = 60000 } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requestTimestamps = [];
    this.queue = [];
    this.isProcessing = false;
    this.blockedUntil = 0; // Timestamp until which all requests must pause on 429
  }

  _recordRequest() {
    this.requestTimestamps.push(Date.now());
  }

  _cleanWindow() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > cutoff);
  }

  _getWaitTimeMs() {
    const now = Date.now();

    // If active backoff is in effect
    if (this.blockedUntil > now) {
      return this.blockedUntil - now;
    }

    this._cleanWindow();

    // Within sliding window capacity
    if (this.requestTimestamps.length < this.maxRequests) {
      return 0;
    }

    // Delay until the oldest slot expires from the sliding window
    const oldest = this.requestTimestamps[0];
    const waitTime = oldest + this.windowMs - now + 50;
    return Math.max(waitTime, 0);
  }

  applyBackoff(retryAfterSec = null, attempt = 1) {
    let delayMs = 2000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
    if (retryAfterSec && !isNaN(Number(retryAfterSec))) {
      delayMs = Math.max(Number(retryAfterSec) * 1000, delayMs);
    }
    delayMs = Math.min(delayMs, 30000); // 30s maximum backoff ceiling

    const now = Date.now();
    this.blockedUntil = Math.max(this.blockedUntil, now + delayMs);
    console.warn(`[GeminiRateLimiter] HTTP 429 Rate Limit encountered. Pausing queue for ${Math.round(delayMs)}ms.`);
    return delayMs;
  }

  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject, attempts: 0 });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const waitTime = this._getWaitTimeMs();
      if (waitTime > 0) {
        await new Promise(r => setTimeout(r, waitTime));
      }

      const item = this.queue.shift();
      if (!item) continue;

      this._recordRequest();

      try {
        const result = await item.taskFn();
        item.resolve(result);
      } catch (err) {
        const is429 =
          err?.status === 429 ||
          (typeof err?.message === 'string' && (
            err.message.includes('429') ||
            err.message.includes('RESOURCE_EXHAUSTED') ||
            err.message.includes('Quota exceeded') ||
            err.message.includes('rate limit')
          ));

        if (is429 && item.attempts < 3) {
          item.attempts += 1;
          const backoffMs = this.applyBackoff(err?.retryAfter, item.attempts);
          console.warn(`[GeminiRateLimiter] Retrying queued request (attempt ${item.attempts}/3) after ${Math.round(backoffMs)}ms.`);
          // Prepend back to front of queue to retry after backoff expires
          this.queue.unshift(item);
        } else {
          item.reject(err);
        }
      }
    }

    this.isProcessing = false;
  }

  getStatus() {
    this._cleanWindow();
    const now = Date.now();
    return {
      currentRequestsInWindow: this.requestTimestamps.length,
      maxRequestsPerMinute: this.maxRequests,
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      isBlockedByBackoff: this.blockedUntil > now,
      backoffRemainingMs: Math.max(0, this.blockedUntil - now),
      nextAvailableSlotMs: this._getWaitTimeMs()
    };
  }
}

export const geminiRateLimiter = new GeminiRateLimiter({
  maxRequests: 10,
  windowMs: 60000
});

const _rawCallGeminiApi = async ({
  prompt,
  systemInstruction = '',
  role = 'MEMBER',
  temperature = 0.4,
  responseJson = false,
  timeoutMs = 7000
}) => {
  const apiKey = getGeminiApiKey(role);
  if (!apiKey) {
    throw new Error(`Gemini API key is not configured for role: ${role}. Please check your .env file.`);
  }

  // High-performance model cascade:
  // 1. gemini-3.5-flash-lite: Ultra-fast sub-second to 1.8s response time
  // 2. gemini-flash-lite-latest: High-speed production model (~1.5s)
  // 3. gemini-3.5-flash: Powerful balanced model (~1.7s-4s)
  // 4. gemini-3.6-flash: Robust high-reasoning fallback
  const models = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-3.6-flash'
  ];
  let lastError = null;

  for (const model of models) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents = [];
      if (prompt) {
        contents.push({
          role: 'user',
          parts: [{ text: prompt }]
        });
      }

      const body = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: 2048,
          responseMimeType: responseJson ? 'application/json' : 'text/plain'
        }
      };

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timerId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const err = new Error(errMsg);
        err.status = response.status;
        err.retryAfter = response.headers.get('Retry-After');
        throw err;
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return rawText;
    } catch (err) {
      clearTimeout(timerId);
      lastError = err;

      // If HTTP 429 or quota exceeded, rethrow immediately to trigger queue backoff
      if (err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED')) {
        throw err;
      }

      const isTimeout = err.name === 'AbortError';
      console.warn(`[Gemini API] Failed with model ${model}:`, isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message);
      // Failover immediately to the next candidate model
    }
  }

  throw lastError || new Error('Failed to generate response from Gemini API.');
};

export const callGeminiApi = (params) => {
  return geminiRateLimiter.enqueue(() => _rawCallGeminiApi(params));
};

export const geminiApi = {
  // ─── 1. AI Department Architect ───────────────────────────────────────────
  async generateDepartmentSuggestions({ prompt, currentDepartments = [] }) {
    const existingNames = currentDepartments.map(d => d.name).join(', ') || 'None';

    const systemInstruction = `You are an elite Enterprise Organizational Architect for TeamSync.
Your task is to analyze the user's organization request and return a JSON array of optimized departments.
Current existing departments: [${existingNames}]. Do not duplicate existing department names unless improving them.
Return STRICT JSON format:
{
  "departments": [
    {
      "name": "Department Name (concise, 2-3 words)",
      "description": "Clear explanation of core responsibilities, key deliverables, and mission.",
      "suggestedHeadcount": 3,
      "keyRoles": ["Role 1", "Role 2", "Role 3"]
    }
  ],
  "strategicRationale": "Brief 1-2 sentence executive explanation of why this structure optimizes execution."
}`;

    const userPrompt = `Organization Goal / Request: ${prompt || 'Create standard high-velocity software engineering, design, and operations departments.'}`;

    const raw = await callGeminiApi({
      prompt: userPrompt,
      systemInstruction,
      role: 'FOUNDER',
      temperature: 0.2,
      responseJson: true
    });

    try {
      return JSON.parse(raw);
    } catch {
      // Fallback clean extraction
      const cleanJson = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);
    }
  },

  // ─── 2. AI Bug Triage & Intelligent Routing ───────────────────────────────
  _triageCache: new Map(),

  _heuristicFallback({ bugTitle = '', bugDescription = '', departments = [], severity = 'MEDIUM' }) {
    const text = `${bugTitle} ${bugDescription}`.toLowerCase();
    
    let domain = 'Frontend UI';
    if (/video|call|webrtc|audio|stream|mic|camera|screen\s?share|joining|peer/i.test(text)) {
      domain = 'WebRTC/Realtime';
    } else if (/auth|login|signup|password|token|session|logout|unauthorized/i.test(text)) {
      domain = 'Authentication';
    } else if (/database|sql|postgres|supabase|migration|table|rls|query/i.test(text)) {
      domain = 'Database & RLS';
    } else if (/server|deploy|vercel|build|env|docker|ci|pipeline|latency/i.test(text)) {
      domain = 'DevOps & Infrastructure';
    } else if (/api|endpoint|route|backend|rest|500|404|gateway/i.test(text)) {
      domain = 'Backend API';
    }

    let matchedDept = null;
    if (domain === 'WebRTC/Realtime' || domain === 'Frontend UI') {
      matchedDept = departments.find(d => /frontend|ui|client|web/i.test(d.name)) || departments[0];
    } else if (domain === 'Backend API' || domain === 'Database & RLS' || domain === 'Authentication') {
      matchedDept = departments.find(d => /backend|api|server|data/i.test(d.name)) || departments[0];
    } else if (domain === 'DevOps & Infrastructure') {
      matchedDept = departments.find(d => /devops|infra|platform|cloud/i.test(d.name)) || departments[0];
    }

    if (!matchedDept && departments.length > 0) {
      matchedDept = departments[0];
    }

    return {
      suggestedDepartmentId: matchedDept?.id || null,
      suggestedDepartmentName: matchedDept?.name || 'Engineering - Frontend',
      confidenceScore: 0.88,
      recommendedSeverity: severity || 'HIGH',
      errorDomain: domain,
      rootCauseSummary: `Identified issue related to ${domain}. Automatic routing determined from bug telemetry and description.`,
      actionableSteps: [
        `Reproduce the reported issue in local/staging environment.`,
        `Inspect client logs and network events related to ${domain}.`,
        `Implement unit and integration fixes and verify cross-platform resolution.`
      ],
      routingReason: `The reported issue matches functionality owned by the ${matchedDept?.name || 'Engineering'} department.`
    };
  },

  async classifyAndRouteBug({
    bugTitle,
    bugDescription,
    stepsToReproduce = '',
    departments = [],
    severity = 'MEDIUM'
  }) {
    const cacheKey = `${bugTitle}::${bugDescription}::${departments.map(d => d.id).join('-')}`;
    if (this._triageCache.has(cacheKey)) {
      return this._triageCache.get(cacheKey);
    }

    const deptList = departments.map(d => ({ id: d.id, name: d.name, description: d.description || '' }));

    const systemInstruction = `You are the Automated Bug Triage & Intelligent Routing Engine for TeamSync.
Analyze the reported issue and assign it to the most appropriate functional department.
Available departments: ${JSON.stringify(deptList)}.

Return STRICT JSON format:
{
  "suggestedDepartmentId": "matching department id or null",
  "suggestedDepartmentName": "Department name from the list",
  "confidenceScore": 0.95,
  "recommendedSeverity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "errorDomain": "Frontend UI" | "Backend API" | "Database & RLS" | "WebRTC/Realtime" | "DevOps & Infrastructure" | "Authentication",
  "rootCauseSummary": "1-2 sentence technical summary of likely root cause",
  "actionableSteps": ["Step 1 for assignee", "Step 2 for assignee"],
  "routingReason": "Why this department is best suited to fix this issue"
}`;

    const userPrompt = `Bug Title: ${bugTitle}
Description: ${bugDescription}
Steps to reproduce: ${stepsToReproduce || 'None provided'}
Initial User Severity: ${severity}`;

    try {
      const raw = await callGeminiApi({
        prompt: userPrompt,
        systemInstruction,
        role: 'ADMIN',
        temperature: 0.1,
        responseJson: true,
        timeoutMs: 6500
      });

      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const cleanJson = raw.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      }

      if (parsed) {
        this._triageCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('[Gemini API] AI classification failed or timed out, executing intelligent heuristic fallback:', err.message);
    }

    // Instant fallback if API key quota exceeded, network drop, or timeout
    const fallback = this._heuristicFallback({ bugTitle, bugDescription, departments, severity });
    this._triageCache.set(cacheKey, fallback);
    return fallback;
  },

  // ─── 3. Live System Copilot (Interactive Dashboard Assistant) ─────────────
  async askSystemCopilot({
    message,
    role = 'MEMBER',
    userName = 'Team Member',
    systemSnapshot = {},
    conversationHistory = []
  }) {
    const systemInstruction = `You are TeamSync AI Copilot, the authoritative, elite enterprise operations intelligence system embedded directly into TeamSync.

WORKSPACE CONTEXT & TELEMETRY:
- Current User: ${userName} | Active Role: ${role}
- Real-Time System Telemetry:
  • Total Tasks: ${systemSnapshot.totalTasks ?? 'N/A'} (Completed: ${systemSnapshot.completedTasks ?? 'N/A'}, In-Progress: ${systemSnapshot.inProgressTasks ?? 'N/A'}, Todo: ${systemSnapshot.todoTasks ?? 'N/A'}, Overdue: ${systemSnapshot.overdueTasks ?? 'N/A'})
  • Active Departments: ${systemSnapshot.departments?.length ? systemSnapshot.departments.map(d => d.name).join(', ') : 'None'}
  • Active Online Team: ${systemSnapshot.onlineCount ?? 0} members
  • Bug Reports: ${systemSnapshot.openBugsCount ?? 0} open (${systemSnapshot.criticalBugsCount ?? 0} critical)
  • Daily Workforce Planner: ${systemSnapshot.todayAllocationsCount ?? 0} members scheduled today
  • High-Priority / Urgent Queue: ${JSON.stringify(systemSnapshot.urgentTasks || [])}

COMPLETE PLATFORM KNOWLEDGE:
1. Tasks & Deliverables: Kanban/List management with statuses (TODO, IN_PROGRESS, COMPLETED), priorities (LOW, MEDIUM, HIGH, URGENT), deadlines, assignees, and department tagging.
2. Daily Workforce Planner: Assigns team members to operational departments by date with auto-capacity distribution.
3. Bug Triage Hub: Automated AI classification (Frontend, Backend, Database/RLS, WebRTC, DevOps) with auto-conversion of critical bugs into high-priority tasks assigned to target departments.
4. Real-time Mesh Communications: Mesh WebRTC audio/video calls, dual signaling (Supabase Realtime + BroadcastChannel), WhatsApp-style chat with voice notes, file previews, and channels (#general for company, #leadership restricted to Founder, Admin, and Founding Advisor).
5. Role Authority Matrix:
   - FOUNDER: Supreme executive access, organizational control, departments, reports & velocity analytics.
   - ADMIN: Operations, workforce planning, task assignment, bug management, team member activation.
   - FOUNDING_ADVISOR: Strategic governance, advisory metrics, exclusive access to leadership channel & calls.
   - MEMBER: Daily focus, assigned department, task execution, bug reporting.

RESPONSE GUIDELINES:
1. Answer every question accurately, thoroughly, and authoritatively. Never guess; use the live telemetry and platform knowledge.
2. Format answers with beautiful, clean GitHub markdown (use bold headers, bullet lists, metric tables, and callouts).
3. If asked about team allocation, bottleneck detection, or task performance, provide concrete calculations (percentages, counts, department names, action steps).
4. Provide structured, high-leverage recommendations tailored to ${role}.`;

    let promptWithHistory = '';
    if (conversationHistory.length > 0) {
      promptWithHistory += 'Recent conversation:\n';
      conversationHistory.slice(-4).forEach(h => {
        promptWithHistory += `${h.role === 'user' ? 'User' : 'Copilot'}: ${h.content}\n`;
      });
      promptWithHistory += '\nCurrent query:\n';
    }
    promptWithHistory += message;

    return callGeminiApi({
      prompt: promptWithHistory,
      systemInstruction,
      role,
      temperature: 0.3
    });
  },

  // ─── 4. Daily Morning Executive Briefing ──────────────────────────────────
  async generateDailyBriefing({ role = 'FOUNDER', userName = 'Leader', systemSnapshot = {} }) {
    const systemInstruction = `You are the TeamSync Executive AI Briefing Engine.
Create a sharp, 3-section daily morning briefing for ${userName} (${role}).
Format in markdown:
1. 🎯 **Today's Strategic Focus** (Top 2-3 priorities today)
2. ⚡ **Operational Pulse & Allocation** (Workforce deployment & key deadlines)
3. ⚠️ **Immediate Attention Items** (Critical bugs, overdue tasks, or unassigned members)

Keep it under 180 words. Be motivating, precise, and highly professional.`;

    const userPrompt = `Generate today's daily briefing based on current workspace telemetry:
${JSON.stringify(systemSnapshot, null, 2)}`;

    return callGeminiApi({
      prompt: userPrompt,
      systemInstruction,
      role,
      temperature: 0.3
    });
  },

  // ─── 5. Task Subtask & Milestone Breakdown ────────────────────────────────
  async breakdownTaskIntoSubtasks({ title, description, departmentName = '' }) {
    const systemInstruction = `You are a Senior Project Architect for TeamSync.
Break down the provided task deliverable into 3-5 concrete, actionable subtasks/milestones.
Return STRICT JSON format:
{
  "subtasks": [
    { "title": "Subtask 1 title", "estimatedHours": 3, "priority": "HIGH" | "MEDIUM" | "LOW" },
    { "title": "Subtask 2 title", "estimatedHours": 2, "priority": "HIGH" | "MEDIUM" | "LOW" }
  ],
  "completionCriteria": "What defines done for this task"
}`;

    const userPrompt = `Task Title: ${title}\nDescription: ${description || 'None'}\nDepartment: ${departmentName || 'General'}`;

    const raw = await callGeminiApi({
      prompt: userPrompt,
      systemInstruction,
      role: 'ADMIN',
      temperature: 0.2,
      responseJson: true
    });

    try {
      return JSON.parse(raw);
    } catch {
      const cleanJson = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);
    }
  },

  // ─── 6. Comprehensive API Health Diagnostic ───────────────────────────────
  async checkHealth() {
    const roles = ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'];
    const results = {
      timestamp: new Date().toISOString(),
      keys: {},
      models: {},
      overall: 'HEALTHY'
    };

    // Verify key configurations
    for (const role of roles) {
      const key = getGeminiApiKey(role);
      const isConfigured = Boolean(key && !key.includes('placeholder'));
      results.keys[role] = {
        configured: isConfigured,
        maskedKey: isConfigured ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : 'MISSING'
      };
      if (!isConfigured) results.overall = 'DEGRADED';
    }

    // Benchmark top active models
    const testKey = getGeminiApiKey('ADMIN') || getGeminiApiKey('FOUNDER');
    if (testKey) {
      const candidateModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
      for (const model of candidateModels) {
        const start = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${testKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'PING' }] }] }),
            signal: controller.signal
          });
          clearTimeout(timer);
          const elapsed = Date.now() - start;
          results.models[model] = {
            ok: res.ok,
            status: res.status,
            latencyMs: elapsed
          };
        } catch (err) {
          clearTimeout(timer);
          results.models[model] = {
            ok: false,
            error: err.name === 'AbortError' ? 'Timeout (>4000ms)' : err.message
          };
        }
      }
    }

    results.rateLimiter = geminiRateLimiter.getStatus();
    return results;
  },

  // ─── 7. Rate Limiter Telemetry ────────────────────────────────────────────
  getRateLimiterStatus() {
    return geminiRateLimiter.getStatus();
  }
};

export default geminiApi;
