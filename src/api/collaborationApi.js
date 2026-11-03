import { supabase } from './supabase.js';

const API_BASE = typeof window !== 'undefined' && window.location.origin 
  ? '' 
  : 'http://127.0.0.1:3000';

const STORAGE_KEYS = {
  POLLS: 'teamsync_collab_polls',
  POLL_VOTES: 'teamsync_collab_poll_votes',
  NOTES: 'teamsync_collab_notes',
  TODO_ITEMS: 'teamsync_collab_todo_items',
  REPORTS: 'teamsync_collab_reports',
  TRANSFERS: 'teamsync_collab_transfers',
  TRANSFER_HISTORY: 'teamsync_collab_transfer_history',
  NOTIFICATIONS: 'teamsync_collab_notifications'
};

const getLocal = (key, fallback = []) => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
};

const setLocal = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

export const collaborationApi = {
  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 1. POLLS API
   * ─────────────────────────────────────────────────────────────────────────
   */
  async createPoll(payload) {
    // 1. Try server endpoint
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        return json.poll;
      }
    } catch {}

    // 2. Supabase direct fallback
    if (supabase) {
      try {
        const { data: poll, error: pErr } = await supabase
          .from('polls')
          .insert([{
            creator_id: payload.creator_id || null,
            conversation_id: payload.conversation_id || null,
            channel: payload.channel || null,
            question: payload.question.trim(),
            description: payload.description || null,
            is_multiple_choice: Boolean(payload.is_multiple_choice),
            is_anonymous: Boolean(payload.is_anonymous),
            allow_vote_change: payload.allow_vote_change !== false,
            closes_at: payload.closes_at || null
          }])
          .select()
          .single();

        if (!pErr && poll) {
          const opts = (payload.options || []).map((text, idx) => ({
            poll_id: poll.id,
            text: typeof text === 'string' ? text.trim() : text.text?.trim(),
            option_order: idx
          })).filter(o => o.text);

          const { data: insertedOpts } = await supabase
            .from('poll_options')
            .insert(opts)
            .select();

          return { ...poll, options: insertedOpts || [], votes: [] };
        }
      } catch (err) {
        console.warn('Supabase poll creation error, falling back to local:', err);
      }
    }

    // 3. Local storage fallback
    const polls = getLocal(STORAGE_KEYS.POLLS, []);
    const newPoll = {
      id: 'poll-' + Date.now(),
      ...payload,
      is_closed: false,
      created_at: new Date().toISOString(),
      options: (payload.options || []).map((o, idx) => ({
        id: `opt-${Date.now()}-${idx}`,
        text: typeof o === 'string' ? o : o.text,
        option_order: idx,
        voteCount: 0,
        percentage: 0
      })),
      totalVotes: 0,
      totalVotersCount: 0
    };
    polls.unshift(newPoll);
    setLocal(STORAGE_KEYS.POLLS, polls);
    return newPoll;
  },

  async getPoll(pollId, currentUserId = null) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/polls/${pollId}?userId=${currentUserId || ''}`);
      if (res.ok) {
        const json = await res.json();
        return json.poll;
      }
    } catch {}

    if (supabase) {
      try {
        const { data: poll } = await supabase
          .from('polls')
          .select(`
            *,
            creator:profiles!polls_creator_id_fkey(id, full_name, avatar_url, email)
          `)
          .eq('id', pollId)
          .single();

        if (poll) {
          const { data: options } = await supabase
            .from('poll_options')
            .select('*')
            .eq('poll_id', pollId)
            .order('option_order', { ascending: true });

          const { data: votes } = await supabase
            .from('poll_votes')
            .select('*')
            .eq('poll_id', pollId);

          const allVotes = votes || [];
          const uniqueVoters = new Set(allVotes.map(v => v.voter_id));
          const totalVotersCount = uniqueVoters.size;

          const optionsWithStats = (options || []).map(opt => {
            const optVotes = allVotes.filter(v => v.option_id === opt.id);
            return {
              ...opt,
              voteCount: optVotes.length,
              percentage: totalVotersCount > 0 ? Math.round((optVotes.length / totalVotersCount) * 100) : 0,
              hasVoted: currentUserId ? optVotes.some(v => v.voter_id === currentUserId) : false,
              voters: poll.is_anonymous ? [] : optVotes.map(v => ({ id: v.voter_id, name: v.voter_name }))
            };
          });

          return {
            ...poll,
            options: optionsWithStats,
            totalVotes: allVotes.length,
            totalVotersCount,
            userHasVoted: currentUserId ? allVotes.some(v => v.voter_id === currentUserId) : false
          };
        }
      } catch (err) {
        console.warn('Supabase getPoll fallback notice:', err);
      }
    }

    const polls = getLocal(STORAGE_KEYS.POLLS, []);
    return polls.find(p => p.id === pollId) || null;
  },

  async votePoll({ poll_id, option_ids, voter_id, voter_name, voter_email }) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/polls/${poll_id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_ids, voter_id, voter_name, voter_email })
      });
      if (res.ok) return await res.json();
    } catch {}

    if (supabase) {
      try {
        // Delete previous votes if re-voting
        await supabase
          .from('poll_votes')
          .delete()
          .eq('poll_id', poll_id)
          .eq('voter_id', voter_id);

        const newVotes = (Array.isArray(option_ids) ? option_ids : [option_ids]).map(optId => ({
          poll_id,
          option_id: optId,
          voter_id,
          voter_name: voter_name || 'Voter',
          voter_email: voter_email || ''
        }));

        await supabase.from('poll_votes').insert(newVotes);
        return { success: true };
      } catch (err) {
        console.warn('Supabase vote fallback notice:', err);
      }
    }

    // Local fallback
    const votes = getLocal(STORAGE_KEYS.POLL_VOTES, []);
    const filtered = votes.filter(v => !(v.poll_id === poll_id && v.voter_id === voter_id));
    (Array.isArray(option_ids) ? option_ids : [option_ids]).forEach(optId => {
      filtered.push({
        id: 'vote-' + Date.now(),
        poll_id,
        option_id: optId,
        voter_id,
        voter_name,
        created_at: new Date().toISOString()
      });
    });
    setLocal(STORAGE_KEYS.POLL_VOTES, filtered);
    return { success: true };
  },

  async closePoll(pollId, userId, userRole = 'MEMBER') {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/polls/${pollId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, user_role: userRole })
      });
      if (res.ok) return await res.json();
    } catch {}

    if (supabase) {
      await supabase
        .from('polls')
        .update({ is_closed: true, updated_at: new Date().toISOString() })
        .eq('id', pollId);
      return { success: true };
    }

    const polls = getLocal(STORAGE_KEYS.POLLS, []);
    const updated = polls.map(p => p.id === pollId ? { ...p, is_closed: true } : p);
    setLocal(STORAGE_KEYS.POLLS, updated);
    return { success: true };
  },

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 2. NOTES & TO-DO LISTS API
   * ─────────────────────────────────────────────────────────────────────────
   */
  async createNote(payload) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        return json.note;
      }
    } catch {}

    if (supabase) {
      try {
        const { data: note, error: nErr } = await supabase
          .from('notes')
          .insert([{
            author_id: payload.author_id,
            title: payload.title.trim(),
            content: payload.content || '',
            category: payload.category || 'GENERAL',
            visibility: payload.visibility || 'PERSONAL',
            task_id: payload.task_id || null,
            channel: payload.channel || null,
            conversation_id: payload.conversation_id || null
          }])
          .select()
          .single();

        if (!nErr && note && Array.isArray(payload.todo_items) && payload.todo_items.length > 0) {
          const todos = payload.todo_items.map((t, idx) => ({
            note_id: note.id,
            task_id: payload.task_id || null,
            text: typeof t === 'string' ? t.trim() : t.text?.trim(),
            is_completed: Boolean(t.is_completed),
            item_order: idx
          })).filter(t => t.text);

          const { data: insertedTodos } = await supabase
            .from('todo_items')
            .insert(todos)
            .select();

          return { ...note, todo_items: insertedTodos || [] };
        }
        return note;
      } catch (err) {
        console.warn('Supabase createNote fallback notice:', err);
      }
    }

    // Local fallback
    const notes = getLocal(STORAGE_KEYS.NOTES, []);
    const newNote = {
      id: 'note-' + Date.now(),
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      todo_items: (payload.todo_items || []).map((t, idx) => ({
        id: `todo-${Date.now()}-${idx}`,
        text: typeof t === 'string' ? t : t.text,
        is_completed: Boolean(t.is_completed),
        item_order: idx
      }))
    };
    notes.unshift(newNote);
    setLocal(STORAGE_KEYS.NOTES, notes);
    return newNote;
  },

  async getNotes(filter = {}) {
    try {
      const q = new URLSearchParams();
      if (filter.userId) q.set('userId', filter.userId);
      if (filter.taskId) q.set('taskId', filter.taskId);
      if (filter.category) q.set('category', filter.category);
      if (filter.visibility) q.set('visibility', filter.visibility);
      if (filter.search) q.set('search', filter.search);

      const res = await fetch(`${API_BASE}/api/v1/collaboration/notes?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        return json.notes || [];
      }
    } catch {}

    if (supabase) {
      try {
        let query = supabase
          .from('notes')
          .select(`
            *,
            author:profiles!notes_author_id_fkey(id, full_name, avatar_url),
            task:tasks(id, title),
            todo_items(*)
          `)
          .eq('is_archived', false)
          .order('updated_at', { ascending: false });

        if (filter.taskId) query = query.eq('task_id', filter.taskId);
        if (filter.category && filter.category !== 'ALL') query = query.eq('category', filter.category);

        const { data } = await query;
        if (data) {
          // Client-side privacy filtering
          return data.filter(n => 
            n.visibility === 'SHARED' || 
            n.author_id === filter.userId
          );
        }
      } catch (err) {
        console.warn('Supabase getNotes fallback notice:', err);
      }
    }

    const notes = getLocal(STORAGE_KEYS.NOTES, []);
    return notes.filter(n => {
      if (filter.taskId && n.task_id !== filter.taskId) return false;
      if (filter.category && filter.category !== 'ALL' && n.category !== filter.category) return false;
      if (filter.userId && n.visibility !== 'SHARED' && n.author_id !== filter.userId) return false;
      return true;
    });
  },

  async toggleTodoItem(itemId, is_completed) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/todos/${itemId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed })
      });
      if (res.ok) return await res.json();
    } catch {}

    if (supabase) {
      await supabase
        .from('todo_items')
        .update({ is_completed, updated_at: new Date().toISOString() })
        .eq('id', itemId);
      return { success: true };
    }

    // Local fallback
    const notes = getLocal(STORAGE_KEYS.NOTES, []);
    notes.forEach(n => {
      (n.todo_items || []).forEach(ti => {
        if (ti.id === itemId) ti.is_completed = is_completed;
      });
    });
    setLocal(STORAGE_KEYS.NOTES, notes);
    return { success: true };
  },

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 3. TASK PROGRESS REPORTS API
   * ─────────────────────────────────────────────────────────────────────────
   */
  async submitProgressReport(payload) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        return json.report;
      }
    } catch {}

    if (supabase) {
      try {
        const { data: report, error } = await supabase
          .from('task_progress_reports')
          .insert([{
            task_id: payload.task_id,
            reporter_id: payload.reporter_id,
            status: payload.status,
            progress_percentage: payload.progress_percentage || 0,
            summary: payload.summary.trim(),
            work_completed: payload.work_completed || '',
            work_in_progress: payload.work_in_progress || '',
            blockers: payload.blockers || '',
            assistance_required: payload.assistance_required || '',
            next_steps: payload.next_steps || '',
            expected_completion_date: payload.expected_completion_date || null,
            attachments: payload.attachments || []
          }])
          .select()
          .single();

        if (!error && report) {
          // Update task status and progress
          if (payload.update_task_status !== false) {
            await supabase
              .from('tasks')
              .update({
                status: payload.status,
                progress_percentage: payload.progress_percentage || 0,
                updated_at: new Date().toISOString()
              })
              .eq('id', payload.task_id);
          }
          return report;
        }
      } catch (err) {
        console.warn('Supabase submitProgressReport fallback notice:', err);
      }
    }

    // Local fallback
    const reports = getLocal(STORAGE_KEYS.REPORTS, []);
    const newReport = {
      id: 'rep-' + Date.now(),
      ...payload,
      created_at: new Date().toISOString()
    };
    reports.unshift(newReport);
    setLocal(STORAGE_KEYS.REPORTS, reports);
    return newReport;
  },

  async getTaskReports(taskId) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/tasks/${taskId}/reports`);
      if (res.ok) {
        const json = await res.json();
        return json.reports || [];
      }
    } catch {}

    if (supabase) {
      const { data } = await supabase
        .from('task_progress_reports')
        .select(`
          *,
          reporter:profiles!task_progress_reports_reporter_id_fkey(id, full_name, email, avatar_url, role)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      return data || [];
    }

    const reports = getLocal(STORAGE_KEYS.REPORTS, []);
    return reports.filter(r => r.task_id === taskId);
  },

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 4. TASK TRANSFER REQUESTS API
   * ─────────────────────────────────────────────────────────────────────────
   */
  async createTransferRequest(payload) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit transfer request');
      }
      return json.transfer;
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) throw err;
    }

    // Local fallback
    const transfers = getLocal(STORAGE_KEYS.TRANSFERS, []);
    const newTransfer = {
      id: 'trf-' + Date.now(),
      ...payload,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };
    transfers.unshift(newTransfer);
    setLocal(STORAGE_KEYS.TRANSFERS, transfers);
    return newTransfer;
  },

  async acceptTransfer(transferId, currentUserId) {
    const res = await fetch(`${API_BASE}/api/v1/collaboration/transfers/${transferId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId })
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to accept task transfer');
    }
    return json.transfer;
  },

  async rejectTransfer(transferId, currentUserId, rejectionReason = '') {
    const res = await fetch(`${API_BASE}/api/v1/collaboration/transfers/${transferId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, rejection_reason: rejectionReason })
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to reject task transfer');
    }
    return json.transfer;
  },

  async cancelTransfer(transferId, currentUserId) {
    const res = await fetch(`${API_BASE}/api/v1/collaboration/transfers/${transferId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId })
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to cancel task transfer');
    }
    return json.transfer;
  },

  async getTaskTransfers(taskId) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/tasks/${taskId}/transfers`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    const transfers = getLocal(STORAGE_KEYS.TRANSFERS, []);
    const pending = transfers.find(t => t.task_id === taskId && t.status === 'PENDING') || null;
    const history = getLocal(STORAGE_KEYS.TRANSFER_HISTORY, []).filter(h => h.task_id === taskId);
    return { success: true, pendingTransfer: pending, history };
  },

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * 5. NOTIFICATIONS API
   * ─────────────────────────────────────────────────────────────────────────
   */
  async getNotifications(userId) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/collaboration/notifications?userId=${userId}`);
      if (res.ok) {
        const json = await res.json();
        return json.notifications || [];
      }
    } catch {}

    return getLocal(STORAGE_KEYS.NOTIFICATIONS, []);
  },

  async markNotificationRead(notifId) {
    try {
      await fetch(`${API_BASE}/api/v1/collaboration/notifications/${notifId}/read`, {
        method: 'PATCH'
      });
    } catch {}
  }
};

export default collaborationApi;

