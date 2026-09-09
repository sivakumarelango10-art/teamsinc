import { supabase } from './supabase.js';

const API_BASE = '/api/v1/integrations/kalvilearn';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'x-teamsync-source': 'WORKSPACE'
};

export const ticketsApi = {
  /**
   * 1. Query tickets with filters, pagination, and search
   */
  async getTickets(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.type && filters.type !== 'ALL') params.append('type', filters.type);
      if (filters.status && filters.status !== 'ALL') params.append('status', filters.status);
      if (filters.priority && filters.priority !== 'ALL') params.append('priority', filters.priority);
      if (filters.portal && filters.portal !== 'ALL') params.append('portal', filters.portal);
      if (filters.module) params.append('module', filters.module);
      if (filters.assignedTo) params.append('assignedTo', filters.assignedTo);
      if (filters.search) params.append('search', filters.search);
      if (filters.page) params.append('page', filters.page);
      if (filters.limit) params.append('limit', filters.limit);

      const res = await fetch(`${API_BASE}/tickets?${params.toString()}`, {
        headers: defaultHeaders
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn('API endpoint fetch note, falling back to direct Supabase query:', err);
    }

    // Direct Supabase fallback
    if (supabase) {
      try {
        let query = supabase
          .from('tickets')
          .select(`
            *,
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role)
          `, { count: 'exact' })
          .order('created_at', { ascending: false });

        if (filters.type && filters.type !== 'ALL') query = query.eq('type', filters.type);
        if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status);
        if (filters.priority && filters.priority !== 'ALL') query = query.eq('priority', filters.priority);
        if (filters.portal && filters.portal !== 'ALL') query = query.eq('portal', filters.portal);
        if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);

        if (filters.search) {
          query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%,reporter_name.ilike.%${filters.search}%`);
        }

        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        query = query.range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        return {
          success: true,
          tickets: (data || []).map(row => ({
            id: row.id,
            ticketNumber: row.ticket_number,
            source: row.source,
            externalReferenceId: row.external_reference_id,
            type: row.type,
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            portal: row.portal,
            route: row.route,
            module: row.module,
            environment: row.environment,
            browser: row.browser,
            device: row.device,
            appVersion: row.app_version,
            reporter: {
              name: row.reporter_name,
              email: row.reporter_email,
              role: row.reporter_role
            },
            assignedTo: row.assigned_to,
            assignee: row.assignee ? {
              id: row.assignee.id,
              fullName: row.assignee.full_name,
              email: row.assignee.email,
              role: row.assignee.role
            } : null,
            labels: row.labels || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            resolvedAt: row.resolved_at,
            closedAt: row.closed_at
          })),
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit) || 1
          }
        };
      } catch (err) {
        console.error('Supabase getTickets error:', err);
      }
    }

    return { tickets: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },

  /**
   * 2. Get single ticket with comments, activities, and attachments
   */
  async getTicket(ticketNumber) {
    try {
      const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticketNumber)}`, {
        headers: defaultHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.ticket;
      }
    } catch (err) {
      console.warn('API getTicket note, falling back to Supabase:', err);
    }

    if (supabase) {
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
          *,
          assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role)
        `)
        .eq('ticket_number', ticketNumber)
        .single();

      if (error || !ticket) return null;

      const [commentsRes, activitiesRes, attachmentsRes] = await Promise.all([
        supabase.from('ticket_comments').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: true }),
        supabase.from('ticket_activities').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: true }),
        supabase.from('ticket_attachments').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: true })
      ]);

      return {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        source: ticket.source,
        externalReferenceId: ticket.external_reference_id,
        type: ticket.type,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        portal: ticket.portal,
        route: ticket.route,
        module: ticket.module,
        environment: ticket.environment,
        browser: ticket.browser,
        device: ticket.device,
        appVersion: ticket.app_version,
        reporter: {
          name: ticket.reporter_name,
          email: ticket.reporter_email,
          role: ticket.reporter_role
        },
        metadata: ticket.metadata || {},
        assignedTo: ticket.assigned_to,
        assignee: ticket.assignee ? {
          id: ticket.assignee.id,
          fullName: ticket.assignee.full_name,
          email: ticket.assignee.email,
          role: ticket.assignee.role
        } : null,
        labels: ticket.labels || [],
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
        resolvedAt: ticket.resolved_at,
        closedAt: ticket.closed_at,
        comments: (commentsRes.data || []).map(c => ({
          id: c.id,
          authorName: c.author_name,
          authorRole: c.author_role,
          comment: c.comment,
          createdAt: c.created_at
        })),
        activities: (activitiesRes.data || []).map(a => ({
          id: a.id,
          action: a.action,
          from: a.from_value,
          to: a.to_value,
          performedBy: a.performed_by_name,
          createdAt: a.created_at
        })),
        attachments: (attachmentsRes.data || []).map(att => ({
          id: att.id,
          fileName: att.file_name,
          fileUrl: att.file_url,
          fileType: att.file_type,
          fileSize: Number(att.file_size),
          createdAt: att.created_at
        }))
      };
    }

    return null;
  },

  /**
   * 3. Update status with state machine enforcement
   */
  async updateStatus(ticketNumber, newStatus, performedByName = 'Team Member') {
    const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticketNumber)}/status`, {
      method: 'PATCH',
      headers: defaultHeaders,
      body: JSON.stringify({ status: newStatus, performedByName })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update ticket status.');
    }
    return data.ticket;
  },

  /**
   * 4. Assign ticket to a real TeamSync profile
   */
  async assignTicket(ticketNumber, assignedTo, performedByName = 'Team Member') {
    const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticketNumber)}/assign`, {
      method: 'PATCH',
      headers: defaultHeaders,
      body: JSON.stringify({ assignedTo, performedByName })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to assign ticket.');
    }
    return data.ticket;
  },

  /**
   * 5. Update priority
   */
  async updatePriority(ticketNumber, priority, performedByName = 'Team Member') {
    const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticketNumber)}/priority`, {
      method: 'PATCH',
      headers: defaultHeaders,
      body: JSON.stringify({ priority, performedByName })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update ticket priority.');
    }
    return data.ticket;
  },

  /**
   * 6. Add comment to discussion
   */
  async addComment(ticketNumber, { comment, authorName, authorRole, authorId }) {
    const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticketNumber)}/comments`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ comment, authorName, authorRole, authorId })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to add comment.');
    }
    return data.comment;
  },

  /**
   * 7. Fetch real database statistics
   */
  async getStats() {
    try {
      const res = await fetch(`${API_BASE}/stats`, {
        headers: defaultHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.stats;
      }
    } catch (err) {
      console.warn('API getStats note, falling back to Supabase:', err);
    }

    if (supabase) {
      const { data } = await supabase.from('tickets').select('status, priority, type');
      if (data) {
        return {
          total: data.length,
          open: data.filter(t => t.status === 'OPEN').length,
          triaged: data.filter(t => t.status === 'TRIAGED').length,
          inProgress: data.filter(t => t.status === 'IN_PROGRESS').length,
          blocked: data.filter(t => t.status === 'BLOCKED').length,
          resolved: data.filter(t => t.status === 'RESOLVED').length,
          closed: data.filter(t => t.status === 'CLOSED').length,
          rejected: data.filter(t => t.status === 'REJECTED').length,
          critical: data.filter(t => t.priority === 'CRITICAL' && !['RESOLVED', 'CLOSED', 'REJECTED'].includes(t.status)).length,
          byType: {
            BUG: data.filter(t => t.type === 'BUG').length,
            FEATURE: data.filter(t => t.type === 'FEATURE').length,
            FEEDBACK: data.filter(t => t.type === 'FEEDBACK').length,
            ISSUE: data.filter(t => t.type === 'ISSUE').length,
            IMPROVEMENT: data.filter(t => t.type === 'IMPROVEMENT').length,
            OTHER: data.filter(t => t.type === 'OTHER').length
          }
        };
      }
    }

    return {
      total: 0,
      open: 0,
      triaged: 0,
      inProgress: 0,
      blocked: 0,
      resolved: 0,
      closed: 0,
      rejected: 0,
      critical: 0,
      byType: { BUG: 0, FEATURE: 0, FEEDBACK: 0, ISSUE: 0, IMPROVEMENT: 0, OTHER: 0 }
    };
  }
};

export default ticketsApi;
