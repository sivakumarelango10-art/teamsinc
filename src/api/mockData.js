import { format, addDays } from 'date-fns';

const todayStr = format(new Date(), 'yyyy-MM-dd');
const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

export const INITIAL_DEPARTMENTS = [
  { id: 'dept-1', name: 'Designing', description: 'UI/UX design, visual identities, wireframing, and interactive prototyping' },
  { id: 'dept-2', name: 'Development', description: 'Web, mobile, API, and cloud infrastructure engineering' },
  { id: 'dept-3', name: 'Marketing', description: 'Digital marketing, SEO, social campaigns, and brand growth' },
  { id: 'dept-4', name: 'Testing', description: 'QA automation, manual verification, and release quality assurance' },
  { id: 'dept-5', name: 'Content', description: 'Technical copywriting, marketing copy, and documentation' },
  { id: 'dept-6', name: 'Management', description: 'Scrum management, product roadmap, and strategic planning' }
];

export const AUTHORIZED_EMAILS = [
  'sivakumarelango10@gmail.com',
  'aaditya.rm@kalvium.com',
  'alinasyedali786@gmail.com',
  'yashas1325143@gmail.com',
  'kavyaramesh293@gmail.com',
  'prajith.p.dev.1@gmail.com',
  'sgjitbros@gmail.com'
];

export const INITIAL_PROFILES = [
  {
    id: 'usr-founder-1',
    full_name: 'Sivakumar Elango',
    email: 'sivakumarelango10@gmail.com',
    role: 'FOUNDER',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'usr-advisor-1',
    full_name: 'Aaditya RM',
    email: 'aaditya.rm@kalvium.com',
    role: 'FOUNDING_ADVISOR',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'usr-member-1',
    full_name: 'Alina Syed Ali',
    email: 'alinasyedali786@gmail.com',
    role: 'MEMBER',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'usr-member-2',
    full_name: 'Yashas',
    email: 'yashas1325143@gmail.com',
    role: 'MEMBER',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'usr-member-3',
    full_name: 'Kavya Ramesh',
    email: 'kavyaramesh293@gmail.com',
    role: 'MEMBER',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'usr-member-4',
    full_name: 'Prajith P',
    email: 'prajith.p.dev.1@gmail.com',
    role: 'MEMBER',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'usr-member-5',
    full_name: 'SG Jitbros',
    email: 'sgjitbros@gmail.com',
    role: 'MEMBER',
    is_active: true,
    created_at: new Date().toISOString()
  }
];

export const INITIAL_PLANS = [];
export const INITIAL_ASSIGNMENTS = [];
export const INITIAL_TASKS = [];

// Local storage management helpers
const STORAGE_KEYS = {
  PROFILES: 'teamsync_profiles',
  DEPARTMENTS: 'teamsync_departments',
  TASKS: 'teamsync_tasks',
  PLANS: 'teamsync_plans',
  ASSIGNMENTS: 'teamsync_assignments',
  CURRENT_USER: 'teamsync_current_user'
};

export const getStored = (key, initial) => {
  try {
    const item = localStorage.getItem(key);
    if (!item) {
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(item);

    // Automatically purge old demo tasks, plans, assignments if present
    if (key === STORAGE_KEYS.TASKS && Array.isArray(parsed) && parsed.some(t => t.id === 'task-1')) {
      localStorage.setItem(key, JSON.stringify([]));
      return [];
    }
    if (key === STORAGE_KEYS.ASSIGNMENTS && Array.isArray(parsed) && parsed.some(a => a.id === 'asgn-1')) {
      localStorage.setItem(key, JSON.stringify([]));
      return [];
    }
    if (key === STORAGE_KEYS.PLANS && Array.isArray(parsed) && parsed.some(p => p.id === 'plan-today')) {
      localStorage.setItem(key, JSON.stringify([]));
      return [];
    }

    // If profiles key, filter out any old legacy test accounts that were purged
    if (key === STORAGE_KEYS.PROFILES && Array.isArray(parsed)) {
      const valid = parsed.filter(p =>
        p.email && (
          AUTHORIZED_EMAILS.includes(p.email.toLowerCase()) ||
          p.created_by_founder === true
        )
      );
      INITIAL_PROFILES.forEach(initP => {
        if (!valid.some(v => v.email.toLowerCase() === initP.email.toLowerCase())) {
          valid.push(initP);
        }
      });
      localStorage.setItem(key, JSON.stringify(valid));
      return valid;
    }
    return parsed;
  } catch {
    return initial;
  }
};

export const setStored = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Storage error:', err);
  }
};

export const resetStoreToDefaults = () => {
  localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(INITIAL_PROFILES));
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(INITIAL_DEPARTMENTS));
  localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(INITIAL_TASKS));
  localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(INITIAL_PLANS));
  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(INITIAL_ASSIGNMENTS));
};

export { STORAGE_KEYS };
