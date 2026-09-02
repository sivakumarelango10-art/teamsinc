// TeamSync Gemini AI Multi-Role Engine
// Connects separate API keys for Founder, Admin, and Founding Advisor

const GEMINI_API_KEYS = {
  FOUNDER:
    import.meta.env.VITE_GEMINI_API_KEY_FOUNDER ||
    import.meta.env.NEXT_PUBLIC_GEMINI_API_KEY_FOUNDER ||
    import.meta.env.GEMINI_API_KEY_FOUNDER ||
    '',
  ADMIN:
    import.meta.env.VITE_GEMINI_API_KEY_ADMIN ||
    import.meta.env.NEXT_PUBLIC_GEMINI_API_KEY_ADMIN ||
    import.meta.env.GEMINI_API_KEY_ADMIN ||
    '',
  FOUNDING_ADVISOR:
    import.meta.env.VITE_GEMINI_API_KEY_ADVISOR ||
    import.meta.env.NEXT_PUBLIC_GEMINI_API_KEY_ADVISOR ||
    import.meta.env.GEMINI_API_KEY_ADVISOR ||
    '',
  MEMBER:
    import.meta.env.VITE_GEMINI_API_KEY_ADMIN ||
    import.meta.env.VITE_GEMINI_API_KEY_FOUNDER ||
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

export const callGeminiApi = async ({
  prompt,
  systemInstruction = '',
  role = 'MEMBER',
  temperature = 0.4,
  responseJson = false
}) => {
  const apiKey = getGeminiApiKey(role);
  if (!apiKey) {
    throw new Error(`Gemini API key is not configured for role: ${role}. Please check your .env file.`);
  }

  // Model cascade: prioritize gemini-3.6-flash supported by Google API
  const models = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
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
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return rawText;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini API] Failed with model ${model}:`, err.message);
      // Try next model
    }
  }

  throw lastError || new Error('Failed to generate response from Gemini API.');
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
  async classifyAndRouteBug({
    bugTitle,
    bugDescription,
    stepsToReproduce = '',
    departments = [],
    severity = 'MEDIUM'
  }) {
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

    const raw = await callGeminiApi({
      prompt: userPrompt,
      systemInstruction,
      role: 'ADMIN',
      temperature: 0.1,
      responseJson: true
    });

    try {
      return JSON.parse(raw);
    } catch {
      const cleanJson = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);
    }
  },

  // ─── 3. Live System Copilot (Interactive Dashboard Assistant) ─────────────
  async askSystemCopilot({
    message,
    role = 'MEMBER',
    userName = 'Team Member',
    systemSnapshot = {},
    conversationHistory = []
  }) {
    const systemInstruction = `You are TeamSync AI Copilot, an intelligent enterprise operations assistant embedded directly into TeamSync.
You have direct, real-time telemetry over the active workspace:
- Active User: ${userName} (Role: ${role})
- Live System Snapshot:
  • Total Tasks: ${systemSnapshot.totalTasks ?? 'N/A'} (Completed: ${systemSnapshot.completedTasks ?? 'N/A'}, In-Progress: ${systemSnapshot.inProgressTasks ?? 'N/A'}, Overdue: ${systemSnapshot.overdueTasks ?? 'N/A'})
  • Active Departments: ${systemSnapshot.departments?.length ? systemSnapshot.departments.map(d => d.name).join(', ') : 'None'}
  • Active Team Online: ${systemSnapshot.onlineCount ?? 0}
  • Open Bug Reports: ${systemSnapshot.openBugsCount ?? 0} (Critical: ${systemSnapshot.criticalBugsCount ?? 0})
  • Today's Allocations: ${systemSnapshot.todayAllocationsCount ?? 'N/A'} members scheduled
  • Recent High-Priority Tasks: ${JSON.stringify(systemSnapshot.urgentTasks || [])}

Guidance:
1. Provide concise, high-value, direct answers formatted in beautiful GitHub markdown.
2. If asked about team allocation or bottlenecks, highlight specific departments or tasks that require attention.
3. Tailor your tone and recommendations to the user's role (${role}):
   - FOUNDER: Strategic, executive metrics, company velocity, resource deployment.
   - ADMIN: Tactical execution, assignees, deadlines, daily planning, bug resolution.
   - FOUNDING_ADVISOR: Governance, strategic oversight, quality assurance, milestone tracking.
   - MEMBER: Clear individual focus, daily assigned department, task execution.
4. Keep responses crisp and actionable. Use bullet points and bold highlights.`;

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
  }
};

export default geminiApi;
