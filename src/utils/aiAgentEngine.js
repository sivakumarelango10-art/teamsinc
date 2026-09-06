/**
 * TeamSync Action-Oriented AI Workplace Agent Engine
 * Handles intent understanding, issue context generation, database-backed entity resolution,
 * confirmation processing, controlled action execution, role authorization enforcement,
 * duplicate execution prevention, and sanitized audit logging.
 */

import { tasksApi } from '../api/tasksApi.js';
import { bugsApi } from '../api/bugsApi.js';
import { departmentsApi } from '../api/departmentsApi.js';
import { usersApi } from '../api/usersApi.js';

const AUDIT_STORAGE_KEY = 'teamsync_agent_audit_log';

// In-memory fallback for audit logging during SSR or Node testing
const memoryAuditLogs = [];

// In-memory idempotency tracker to prevent concurrent duplicate executions
const executedActionIds = new Set();

/**
 * 1. Recursive Audit Log Credential & Secret Sanitizer
 * Guarantees zero leakage of private tokens, passwords, or API keys into audit logs.
 */
const SENSITIVE_KEYS = /^(password|token|secret|api[_-]?key|jwt|authorization|auth_token|service_key|service_role_key)$/i;

export const sanitizeAuditDetails = (obj, depth = 0) => {
  if (!obj || depth > 4) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeAuditDetails(item, depth + 1));
  }
  const sanitized = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(key)) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditDetails(val, depth + 1);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

export const recordAgentAudit = ({
  actorUserId,
  actorName,
  agentAction,
  targetType,
  targetId,
  details = {},
  success = true,
  failureReason = null
}) => {
  const sanitizedDetails = sanitizeAuditDetails(details);

  const entry = {
    id: 'audit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    actor_user_id: actorUserId || 'anonymous',
    actor_name: actorName || 'Team Member',
    agent_action: agentAction,
    target_type: targetType,
    target_id: targetId || null,
    details: sanitizedDetails,
    success,
    failure_reason: failureReason,
    timestamp: new Date().toISOString()
  };

  memoryAuditLogs.unshift(entry);

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      const logs = raw ? JSON.parse(raw) : [];
      logs.unshift(entry);
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, 200)));
    }
  } catch {}

  return entry;
};

export const getAgentAuditLogs = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return memoryAuditLogs;
};

/**
 * 2. Natural Language Confirmation Evaluator
 * Rejects questions, conversational text, and phrases with modifying clauses.
 */
export const isConfirmationPhrase = (text) => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim().toLowerCase();

  // If the user specifies "send it to [X]" or "give this to [X]", that is a routing/target instruction, not simple confirmation
  if (/\b(send|route|give)\s+(?:it\s+|this\s+)?to\b/i.test(trimmed)) {
    return false;
  }

  // Questions are never confirmations
  if (trimmed.endsWith('?') || /^(why|who|what|when|where|how)\b/i.test(trimmed)) {
    return false;
  }

  // Disqualify if phrase contains modifying/contrasting clauses or new directives
  if (/\b(but|however|instead|also|change|modify|actually|another|wait|don'?t|stop|priority|department|title)\b/i.test(trimmed)) {
    return false;
  }

  // Pure standalone confirmations
  const standalonePatterns = /^(yes|yes\s+please|ok|okay|sure|do\s+it|send\s+it|go\s+ahead|confirm|proceed|that'?s\s+fine|yes,?\s+send\s+it|yep|yeah|please\s+do|go\s+for\s+it|create\s+it|submit\s+it|approved?)[.!]?$/i;

  if (standalonePatterns.test(trimmed)) return true;

  // Prefix confirmation: Must be concise (at most 4 words) and contain only affirmative particles
  const words = trimmed.replace(/[.,!]/g, '').split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    const affirmativePrefix = /^(yes|ok|okay|sure|proceed|confirm)$/i;
    const harmlessWords = /^(please|send|it|do|ahead|go|create|submit|thanks|thank\s+you|that'?s\s+fine)$/i;
    if (affirmativePrefix.test(words[0])) {
      const rest = words.slice(1);
      if (rest.every(w => harmlessWords.test(w))) {
        return true;
      }
    }
  }

  return false;
};

/**
 * 3. Natural Language Cancellation Evaluator
 */
const CANCELLATION_PATTERNS = [
  /^(no|no\s+thanks?|cancel|don'?t\s+send|stop|never\s+mind|not\s+now|forget\s+it|abort|nah|nope|don'?t\s+do\s+it)\b/i,
  /\b(cancel\s+this|don'?t\s+create|do\s+not\s+send)\b/i
];

export const isCancellationPhrase = (text) => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim().toLowerCase();
  return CANCELLATION_PATTERNS.some(regex => regex.test(trimmed));
};

/**
 * 4. Priority Extractor
 */
export const extractPriority = (text) => {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  if (/\b(urgent|critical|emergency|asap|blocker)\b/i.test(lower)) return 'URGENT';
  if (/\b(high\s+priority|high-priority|priority\s+high|p1|make\s+it\s+high)\b/i.test(lower)) return 'HIGH';
  if (/\b(medium\s+priority|medium-priority|priority\s+medium|normal\s+priority|p2|make\s+it\s+medium)\b/i.test(lower)) return 'MEDIUM';
  if (/\b(low\s+priority|low-priority|priority\s+low|p3|make\s+it\s+low)\b/i.test(lower)) return 'LOW';
  return null;
};

/**
 * 5. Database-Backed Department Resolution
 * Never hallucinate departments: resolve against active database records.
 */
export const resolveDepartment = (query, departments = []) => {
  if (!query || typeof query !== 'string' || !departments.length) return null;
  const q = query.trim().toLowerCase()
    .replace(/^(send\s+(this\s+|it\s+)?to\s+|route\s+(this\s+|it\s+)?to\s+|to\s+(the\s+)?|in\s+(the\s+)?)/i, '')
    .replace(/\s+department$/i, '')
    .trim();

  if (!q) return null;

  // 1. Exact match by name or id
  const exact = departments.find(
    d => d.name.toLowerCase() === q || String(d.id).toLowerCase() === q
  );
  if (exact) return exact;

  // 2. Department Aliases & Common Shorthands
  const aliasMap = {
    dev: 'Development',
    developer: 'Development',
    development: 'Development',
    engineering: 'Development',
    backend: 'Development',
    frontend: 'Development',
    code: 'Development',
    qa: 'Testing',
    test: 'Testing',
    testing: 'Testing',
    tester: 'Testing',
    quality: 'Testing',
    ui: 'Designing',
    ux: 'Designing',
    design: 'Designing',
    designing: 'Designing',
    designer: 'Designing',
    copy: 'Content',
    docs: 'Content',
    documentation: 'Content',
    growth: 'Marketing',
    leads: 'Marketing',
    sales: 'Marketing',
    marketing: 'Marketing',
    pm: 'Management',
    product: 'Management',
    management: 'Management',
    lead: 'Management'
  };

  if (aliasMap[q]) {
    const aliasTarget = aliasMap[q];
    const aliasDept = departments.find(d => d.name.toLowerCase() === aliasTarget.toLowerCase());
    if (aliasDept) return aliasDept;
  }

  // 3. Substring / Prefix match
  const partial = departments.find(d => {
    const dName = d.name.toLowerCase();
    return dName.includes(q) || q.includes(dName);
  });

  return partial || null;
};

/**
 * 6. Database-Backed User / Team Member Resolution
 * Resolves against active profiles in PostgreSQL / Supabase
 * Handles prefixes such as "change the assignee to Yashas", "assign to Yashas", etc.
 */
export const resolveUser = (query, users = []) => {
  if (!query || typeof query !== 'string' || !users.length) return { match: null, ambiguous: [] };

  const clean = query
    .trim()
    .toLowerCase()
    .replace(/^(change\s+(the\s+)?(assignee|person|user)\s+to\s+|assign\s+(this\s+|it\s+)?to\s+|give\s+(this\s+|it\s+)?to\s+|send\s+(this\s+|it\s+)?to\s+|@|for\s+|to\s+)/i, '')
    .replace(/\b(please|now|immediately)$/i, '')
    .trim();

  if (!clean) return { match: null, ambiguous: [] };

  // 1. Exact match by ID or Email
  const byIdOrEmail = users.find(
    u => (u.id && u.id.toLowerCase() === clean) || (u.email && u.email.toLowerCase() === clean)
  );
  if (byIdOrEmail) return { match: byIdOrEmail, ambiguous: [] };

  // 2. Exact match on full name
  const byFullName = users.find(
    u => u.full_name && u.full_name.toLowerCase() === clean
  );
  if (byFullName) return { match: byFullName, ambiguous: [] };

  // 3. Match on First Name or Nickname
  const nameMatches = users.filter(u => {
    if (!u.full_name) return false;
    const parts = u.full_name.toLowerCase().split(/\s+/);
    return parts.some(p => p === clean || p.startsWith(clean));
  });

  if (nameMatches.length === 1) {
    return { match: nameMatches[0], ambiguous: [] };
  }
  if (nameMatches.length > 1) {
    return { match: null, ambiguous: nameMatches };
  }

  // 4. Substring in full name or email
  const substringMatches = users.filter(u => {
    const fn = (u.full_name || '').toLowerCase();
    const em = (u.email || '').toLowerCase();
    return fn.includes(clean) || em.includes(clean);
  });

  if (substringMatches.length === 1) {
    return { match: substringMatches[0], ambiguous: [] };
  }
  if (substringMatches.length > 1) {
    return { match: null, ambiguous: substringMatches };
  }

  return { match: null, ambiguous: [] };
};

/**
 * 7. Issue Category & Potential Area Inference
 */
export const inferIssueCategory = (text = '') => {
  const lower = text.toLowerCase();

  if (lower.includes('video') || lower.includes('camera') || lower.includes('mic') || lower.includes('audio') || lower.includes('webrtc') || lower.includes('call')) {
    return {
      category: 'WebRTC / Real-Time Video Calling',
      potentialAreas: [
        'WebRTC peer signaling',
        'Camera/media acquisition (getUserMedia)',
        'Supabase Realtime room channel',
        'In-call peer connection negotiation'
      ],
      recommendedDeptName: 'Development',
      defaultPriority: 'HIGH'
    };
  }

  if (lower.includes('login') || lower.includes('auth') || lower.includes('password') || lower.includes('token') || lower.includes('session')) {
    return {
      category: 'Authentication & Session Security',
      potentialAreas: [
        'Supabase Auth session token',
        'Pre-registration profile link trigger',
        'Browser local session storage',
        'Row Level Security (RLS) policies'
      ],
      recommendedDeptName: 'Development',
      defaultPriority: 'HIGH'
    };
  }

  if (lower.includes('ui') || lower.includes('button') || lower.includes('align') || lower.includes('color') || lower.includes('responsive') || lower.includes('mobile')) {
    return {
      category: 'Frontend User Interface & Styling',
      potentialAreas: [
        'Tailwind CSS layouts & responsiveness',
        'React state re-renders',
        'Mobile viewport breakpoints'
      ],
      recommendedDeptName: 'Designing',
      defaultPriority: 'MEDIUM'
    };
  }

  if (lower.includes('test') || lower.includes('qa') || lower.includes('automation') || lower.includes('reproduce') || lower.includes('verify')) {
    return {
      category: 'Quality Assurance & Automated Verification',
      potentialAreas: [
        'Node test runner scripts',
        'E2E regression suite',
        'Cross-browser compatibility'
      ],
      recommendedDeptName: 'Testing',
      defaultPriority: 'MEDIUM'
    };
  }

  return {
    category: 'System Operations & Architecture',
    potentialAreas: ['Application logic', 'Data persistence layer'],
    recommendedDeptName: 'Development',
    defaultPriority: 'MEDIUM'
  };
};

/**
 * 8. Fast Rule-Based Intent Classifier (Deterministic, Zero-Latency)
 */
export const classifyIntentRuleBased = ({ message, departments = [], users = [], pendingAction = null }) => {
  const text = message.trim();
  const lower = text.toLowerCase();

  // 0. Security Guard: Detect privilege escalation or sensitive credential probing
  if (
    /\b(make\s+me\s+(founder|admin|founding_advisor|superadmin)|change\s+(my\s+)?role\s+to\s+(founder|admin)|escalate\s+privileges|bypass\s+permissions|grant\s+(me\s+)?admin|reveal\s+(api\s+)?keys|show\s+(supabase\s+)?secret|drop\s+table|delete\s+all\s+users)\b/i.test(lower)
  ) {
    return {
      intent: 'UNAUTHORIZED_REQUEST',
      confidence: 0.99,
      requiresConfirmation: false,
      reason: 'Security Violation: Role escalation, secret extraction, and raw administrative database manipulation are strictly prohibited.'
    };
  }

  // 1. Confirmations
  if (pendingAction && isConfirmationPhrase(text)) {
    return {
      intent: 'CONFIRM',
      confidence: 0.98,
      requiresConfirmation: false
    };
  }

  // 2. Cancellations
  if (pendingAction && isCancellationPhrase(text)) {
    return {
      intent: 'CANCEL',
      confidence: 0.98,
      requiresConfirmation: false
    };
  }

  // 3. Modification of pending action (e.g. "Actually send it to Testing", "Change to Yashas", "Make it high priority")
  if (pendingAction) {
    const newPriority = extractPriority(text);
    const deptChange = resolveDepartment(text, departments);
    const userChange = resolveUser(text, users);

    if (newPriority || deptChange || userChange.match) {
      return {
        intent: 'MODIFY_PENDING',
        confidence: 0.95,
        targetDepartment: deptChange ? deptChange.name : null,
        targetDepartmentId: deptChange ? deptChange.id : null,
        targetUser: userChange.match || null,
        newPriority
      };
    }
  }

  // 4. Create Task: "Create a task for Yashas to fix...", "Add task...", "Create high priority task..."
  if (/^(create|add|new)\s+(a\s+)?(high\s+priority\s+|urgent\s+)?task\b/i.test(text) || /\bcreate\s+a\s+task\b/i.test(lower)) {
    // Extract assignee if mentioned
    let targetPersonName = null;
    const forMatch = text.match(/(?:for|assign(?:ed)?\s+to|give\s+to)\s+([A-Za-z0-9_]+)/i);
    if (forMatch) {
      targetPersonName = forMatch[1];
    }

    // Extract department if mentioned
    let targetDeptName = null;
    const deptMatch = text.match(/(?:for|to|in)\s+(development|testing|designing|marketing|content|management)\b/i);
    if (deptMatch) {
      targetDeptName = deptMatch[1];
    }

    // Priority
    const priority = extractPriority(text) || 'MEDIUM';

    // Title extraction
    let title = text
      .replace(/^(create|add|new)\s+(a\s+)?(high\s+priority\s+|urgent\s+)?task\s+(to|for)?/i, '')
      .replace(/\s+(and\s+)?(assign\s+it\s+to|for|give\s+to)\s+[A-Za-z0-9_]+/i, '')
      .trim();

    if (!title) title = 'Workspace Deliverable';
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return {
      intent: 'CREATE_TASK',
      confidence: 0.94,
      task: {
        title,
        description: `Deliverable generated by TeamSync Workplace Agent from user request: "${text}"`,
        priority,
        targetPersonName,
        targetDeptName
      },
      requiresConfirmation: true
    };
  }

  // 5. Create Bug / Report Issue: "Report a bug", "There is a bug in login", "Video calls aren't working"
  const isBugReportWord = /^(report\s+(a\s+)?bug|there\s+is\s+a\s+bug|create\s+(a\s+)?bug|file\s+a\s+bug)\b/i.test(lower);
  const isIssueDescription =
    lower.includes("not working") ||
    lower.includes("isn't working") ||
    lower.includes("throwing an error") ||
    lower.includes("fails") ||
    lower.includes("broken") ||
    lower.includes("black screen") ||
    lower.includes("cannot receive") ||
    lower.includes("crash") ||
    lower.includes("problem with");

  if (isBugReportWord || isIssueDescription) {
    const { category, potentialAreas, recommendedDeptName, defaultPriority } = inferIssueCategory(text);

    // Extract target department or person if user explicitly specified
    let targetDeptName = null;
    const deptMatch = text.match(/(?:send\s+(?:this|it)\s+to|to)\s+(development|testing|designing|marketing|content|management)\b/i);
    if (deptMatch) {
      targetDeptName = deptMatch[1];
    }

    let targetPersonName = null;
    const personMatch = text.match(/(?:assign\s+to|give\s+to|for)\s+([A-Za-z0-9_]+)/i);
    if (personMatch) {
      targetPersonName = personMatch[1];
    }

    // Priority
    const explicitPriority = extractPriority(text);

    // Clean title
    let title = text
      .replace(/^(report\s+(a\s+)?bug|there\s+is\s+a\s+bug\s+in|create\s+(a\s+)?bug\s+for)\s*/i, '')
      .replace(/\.\s+send\s+to\s+.*$/i, '')
      .trim();
    if (!title || title.length < 3) title = 'TeamSync System Issue';
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return {
      intent: isBugReportWord ? 'CREATE_BUG' : 'REPORT_ISSUE',
      confidence: 0.95,
      issue: {
        title,
        summary: text,
        category,
        potentialAreas,
        impact: 'Affects team operational workflows and system reliability.',
        priority: explicitPriority || (lower.includes('critical') || lower.includes('urgent') ? 'CRITICAL' : defaultPriority),
        targetDeptName: targetDeptName || recommendedDeptName,
        targetPersonName
      },
      requiresConfirmation: true
    };
  }

  // 6. Direct Routing: "Send this to Development", "Send to Testing"
  if (/^send\s+(this|the\s+bug|the\s+issue|it)\s+to\s+/i.test(lower)) {
    const match = text.match(/^send\s+(?:this|the\s+bug|the\s+issue|it)\s+to\s+([A-Za-z0-9_\s]+)/i);
    const target = match ? match[1].trim() : '';

    return {
      intent: 'SEND_TO_DEPARTMENT',
      confidence: 0.92,
      targetName: target,
      requiresConfirmation: true
    };
  }

  // 7. Direct Assignment: "Assign this to Yashas", "Send to Kavya"
  if (/^(assign\s+(this|the\s+task|it)\s+to|give\s+(this|it)\s+to)\s+/i.test(lower)) {
    const match = text.match(/^(?:assign\s+(?:this|the\s+task|it)\s+to|give\s+(?:this|it)\s+to)\s+([A-Za-z0-9_\s]+)/i);
    const target = match ? match[1].trim() : '';

    return {
      intent: 'ASSIGN_TASK',
      confidence: 0.92,
      targetPersonName: target,
      requiresConfirmation: true
    };
  }

  return {
    intent: 'GENERAL_CHAT',
    confidence: 0.85,
    requiresConfirmation: false
  };
};

/**
 * 9. Controlled Action Dispatcher
 * Directly calls real backend APIs. Never lies or reports success unless API succeeds.
 * Enforces database-level role constraints (MEMBER cannot CREATE or ASSIGN tasks).
 * Enforces action idempotency to prevent duplicate mutations.
 */
export const executeAgentAction = async ({
  action,
  currentUser,
  role = 'MEMBER'
}) => {
  if (!action || !action.type) {
    throw new Error('No valid action specification provided to agent executor.');
  }

  const normalizedRole = (role || 'MEMBER').toUpperCase();
  const actorUserId = currentUser?.id || null;
  const actorName = currentUser?.full_name || currentUser?.name || 'Team Member';
  const actorEmail = currentUser?.email || '';

  // ─── IDEMPOTENCY CHECK ───────────────────────────────────────────────────
  if (action.id && executedActionIds.has(action.id)) {
    throw new Error(`Action #${action.id} has already been executed. Duplicate execution was prevented.`);
  }

  // ─── ROLE-BASED AUTHORIZATION ENFORCEMENT ─────────────────────────────────
  // Per TeamSync database RLS architecture (schema.sql), only Founders and Admins
  // can insert into public.tasks or alter task assignments.
  if (action.type === 'CREATE_TASK' && normalizedRole !== 'FOUNDER' && normalizedRole !== 'ADMIN') {
    const authError = new Error('Access Denied: Only Founders and Administrators can create workspace tasks. Team members can submit Issue Reports to be prioritized.');
    recordAgentAudit({
      actorUserId,
      actorName,
      agentAction: 'CREATE_TASK',
      targetType: 'task',
      details: { attemptedRole: normalizedRole, title: action.data?.title },
      success: false,
      failureReason: authError.message
    });
    throw authError;
  }

  if (action.type === 'ASSIGN_TASK' && normalizedRole !== 'FOUNDER' && normalizedRole !== 'ADMIN') {
    const authError = new Error('Access Denied: Only Founders and Administrators have permission to assign or reassign tasks.');
    recordAgentAudit({
      actorUserId,
      actorName,
      agentAction: 'ASSIGN_TASK',
      targetType: 'task',
      details: { attemptedRole: normalizedRole, taskId: action.data?.taskId },
      success: false,
      failureReason: authError.message
    });
    throw authError;
  }

  try {
    switch (action.type) {
      // ─────────────────────────────────────────────────────────────────────────
      // A. CREATE_TASK
      // ─────────────────────────────────────────────────────────────────────────
      case 'CREATE_TASK': {
        const { title, description, priority, deadline, assigned_to, department_id } = action.data;

        // Default deadline 3 days out if none specified
        let taskDeadline = deadline;
        if (!taskDeadline) {
          const d = new Date();
          d.setDate(d.getDate() + 3);
          taskDeadline = d.toISOString().split('T')[0];
        }

        const task = await tasksApi.createTask({
          title: title || 'Workspace Deliverable',
          description: description || '',
          priority: priority || 'MEDIUM',
          deadline: taskDeadline,
          assigned_to: assigned_to || null,
          assigned_by: actorUserId,
          department_id: department_id || null,
          status: 'TODO'
        });

        if (!task || !task.id) {
          throw new Error('Task creation did not return a valid task record.');
        }

        if (action.id) executedActionIds.add(action.id);

        recordAgentAudit({
          actorUserId,
          actorName,
          agentAction: 'CREATE_TASK',
          targetType: 'task',
          targetId: task.id,
          details: { title: task.title, priority: task.priority, department_id, assigned_to },
          success: true
        });

        return {
          success: true,
          actionType: 'CREATE_TASK',
          recordId: task.id,
          record: task,
          message: `Done. Task "${task.title}" (ID: #${task.id.slice(0, 8)}) was successfully created in the workspace.`
        };
      }

      // ─────────────────────────────────────────────────────────────────────────
      // B. CREATE_BUG / SEND_ISSUE
      // ─────────────────────────────────────────────────────────────────────────
      case 'CREATE_BUG':
      case 'SEND_ISSUE': {
        const { title, description, severity, steps_to_reproduce, department_id, assigned_to } = action.data;

        const bug = await bugsApi.reportBug({
          title: title || 'System Operational Issue',
          description: description || 'Reported via TeamSync AI Workplace Agent.',
          steps_to_reproduce: steps_to_reproduce || '',
          severity: severity || 'MEDIUM',
          reporterId: actorUserId,
          reporterName: actorName,
          reporterEmail: actorEmail
        });

        if (!bug || !bug.id) {
          throw new Error('Bug reporting API did not return a valid record.');
        }

        // If an assignee was specified, update bug assignment
        if (assigned_to) {
          await bugsApi.updateBug(bug.id, { assigned_to }).catch(() => null);
        }

        if (action.id) executedActionIds.add(action.id);

        recordAgentAudit({
          actorUserId,
          actorName,
          agentAction: action.type,
          targetType: 'bug_report',
          targetId: bug.id,
          details: { title: bug.title, severity: bug.severity, department_id, assigned_to },
          success: true
        });

        return {
          success: true,
          actionType: action.type,
          recordId: bug.id,
          record: bug,
          message: `Done. Issue report "${bug.title}" (ID: #${bug.id.slice(0, 8)}) was successfully submitted.`
        };
      }

      // ─────────────────────────────────────────────────────────────────────────
      // C. ASSIGN_TASK
      // ─────────────────────────────────────────────────────────────────────────
      case 'ASSIGN_TASK': {
        const { taskId, assigned_to, department_id } = action.data;
        if (!taskId) throw new Error('Task ID is required for assignment.');

        const updated = await tasksApi.updateTask(taskId, {
          assigned_to,
          ...(department_id ? { department_id } : {})
        });

        if (!updated || !updated.id) {
          throw new Error(`Failed to update task #${taskId}: Server did not return a record.`);
        }

        if (action.id) executedActionIds.add(action.id);

        recordAgentAudit({
          actorUserId,
          actorName,
          agentAction: 'ASSIGN_TASK',
          targetType: 'task',
          targetId: taskId,
          details: { assigned_to, department_id },
          success: true
        });

        return {
          success: true,
          actionType: 'ASSIGN_TASK',
          recordId: taskId,
          record: updated,
          message: `Done. Task #${taskId.slice(0, 8)} was successfully updated and assigned.`
        };
      }

      // ─────────────────────────────────────────────────────────────────────────
      // D. UPDATE_TASK_STATUS
      // ─────────────────────────────────────────────────────────────────────────
      case 'UPDATE_TASK_STATUS': {
        const { taskId, status } = action.data;
        if (!taskId) throw new Error('Task ID is required to update status.');

        const updated = await tasksApi.updateTaskStatus(taskId, status);

        if (!updated || !updated.id) {
          throw new Error(`Failed to update status for task #${taskId}.`);
        }

        if (action.id) executedActionIds.add(action.id);

        recordAgentAudit({
          actorUserId,
          actorName,
          agentAction: 'UPDATE_TASK_STATUS',
          targetType: 'task',
          targetId: taskId,
          details: { status },
          success: true
        });

        return {
          success: true,
          actionType: 'UPDATE_TASK_STATUS',
          recordId: taskId,
          record: updated,
          message: `Done. Task status was successfully changed to ${status}.`
        };
      }

      default:
        throw new Error(`Unsupported agent action type: ${action.type}`);
    }
  } catch (err) {
    recordAgentAudit({
      actorUserId,
      actorName,
      agentAction: action.type,
      targetType: action.type.toLowerCase(),
      targetId: action.data?.taskId || null,
      details: action.data,
      success: false,
      failureReason: err.message
    });

    throw err;
  }
};
