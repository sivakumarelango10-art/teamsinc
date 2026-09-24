import { query } from '../db.js';
import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber
} from 'docx';
import { format as formatDate } from 'date-fns';

/**
 * Supported Export Formats and Resources
 */
export const SUPPORTED_FORMATS = ['pdf', 'docx', 'csv'];
export const SUPPORTED_RESOURCES = ['tickets', 'students', 'mentors', 'tasks', 'analytics'];

/**
 * Escapes values for RFC 4180 CSV compliance
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats timestamps cleanly for export documents
 */
function formatTs(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return formatDate(d, 'yyyy-MM-dd HH:mm');
  } catch {
    return String(val);
  }
}

/**
 * 1. Fetch Real Database Records with Server-Side Authorization Scoping
 */
export async function fetchExportData({ resource, filters = {}, caller = {} }) {
  const role = caller.role || 'MEMBER';
  const isPrivileged = ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'].includes(role) || caller.source === 'KALVILEARN';

  // Security gate: non-privileged users cannot export administrative tasks
  if (resource === 'tasks' && !isPrivileged && role !== 'MEMBER') {
    const err = new Error("You don't have permission to export this data.");
    err.statusCode = 403;
    throw err;
  }

  const todayStr = formatDate(new Date(), 'yyyy-MM-dd');

  // --- RESOURCE: TICKETS (KalviLearn Integration Tickets) ---
  if (resource === 'tickets') {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (filters.ticketNumber) {
      conditions.push(`t.ticket_number = $${paramIdx++}`);
      params.push(filters.ticketNumber);
    }
    if (filters.type && filters.type !== 'ALL') {
      conditions.push(`t.type = $${paramIdx++}`);
      params.push(filters.type.toUpperCase());
    }
    if (filters.status && filters.status !== 'ALL') {
      conditions.push(`t.status = $${paramIdx++}`);
      params.push(filters.status.toUpperCase());
    }
    if (filters.priority && filters.priority !== 'ALL') {
      let p = filters.priority.toUpperCase();
      if (p === 'URGENT') p = 'CRITICAL';
      if (p === 'NORMAL') p = 'MEDIUM';
      conditions.push(`t.priority = $${paramIdx++}`);
      params.push(p);
    }
    if (filters.portal && filters.portal !== 'ALL') {
      conditions.push(`t.portal = $${paramIdx++}`);
      params.push(filters.portal);
    }
    if (filters.module) {
      conditions.push(`t.module ILIKE $${paramIdx++}`);
      params.push(`%${filters.module}%`);
    }
    if (filters.assignedTo) {
      conditions.push(`t.assigned_to = $${paramIdx++}`);
      params.push(filters.assignedTo);
    }
    if (filters.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(`(
        t.ticket_number ILIKE $${paramIdx} OR
        t.title ILIKE $${paramIdx} OR
        t.description ILIKE $${paramIdx} OR
        t.reporter_name ILIKE $${paramIdx} OR
        t.reporter_email ILIKE $${paramIdx} OR
        t.external_reference_id ILIKE $${paramIdx}
      )`);
      params.push(q);
      paramIdx++;
    }
    if (filters.createdFrom) {
      conditions.push(`t.created_at >= $${paramIdx++}`);
      params.push(new Date(filters.createdFrom).toISOString());
    }
    if (filters.createdTo) {
      conditions.push(`t.created_at <= $${paramIdx++}`);
      params.push(new Date(filters.createdTo).toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT 
        t.ticket_number,
        t.title,
        t.type,
        t.status,
        t.priority,
        t.portal,
        t.module,
        t.route,
        t.reporter_name,
        t.reporter_email,
        t.reporter_role,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        t.closed_at,
        p.full_name as assignee_name,
        p.email as assignee_email
      FROM public.tickets t
      LEFT JOIN public.profiles p ON t.assigned_to = p.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 1000;
    `;

    const res = await query(sql, params);
    return {
      resource: 'tickets',
      title: 'KalviLearn Integration Tickets & Reports',
      count: res.rows.length,
      records: res.rows.map(r => ({
        ticketNumber: r.ticket_number,
        title: r.title,
        type: r.type,
        status: r.status,
        priority: r.priority,
        portal: r.portal || '—',
        module: r.module || '—',
        route: r.route || '—',
        reporterName: r.reporter_name || 'Anonymous',
        reporterEmail: r.reporter_email || '—',
        reporterRole: r.reporter_role || 'USER',
        assigneeName: r.assignee_name || 'Unassigned',
        assigneeEmail: r.assignee_email || '—',
        createdAt: formatTs(r.created_at),
        updatedAt: formatTs(r.updated_at),
        resolvedAt: formatTs(r.resolved_at)
      }))
    };
  }

  // --- RESOURCE: STUDENTS (KalviLearn Learner Profiles & Submissions) ---
  if (resource === 'students') {
    const sql = `
      SELECT 
        t.reporter_name as student_name,
        t.reporter_email as student_email,
        t.portal,
        COUNT(t.id) as total_reports,
        SUM(CASE WHEN t.type = 'BUG' THEN 1 ELSE 0 END) as bug_count,
        SUM(CASE WHEN t.type IN ('FEATURE', 'IMPROVEMENT', 'FEEDBACK') THEN 1 ELSE 0 END) as feedback_count,
        MAX(t.created_at) as last_activity,
        MIN(t.created_at) as first_seen,
        COALESCE(
          (SELECT p.full_name FROM public.tickets t2 LEFT JOIN public.profiles p ON t2.assigned_to = p.id WHERE t2.reporter_email = t.reporter_email AND p.full_name IS NOT NULL LIMIT 1),
          'Aaditya RM'
        ) as mentor_name
      FROM public.tickets t
      WHERE t.portal = 'STUDENT' 
         OR t.reporter_role = 'STUDENT'
         OR t.reporter_email ILIKE '%.community'
         OR t.reporter_email ILIKE '%.s.%'
      GROUP BY t.reporter_name, t.reporter_email, t.portal
      ORDER BY total_reports DESC, last_activity DESC;
    `;

    const res = await query(sql);

    // Extract cohort/campus from email if formatted as *.s.<cohort>@kalvium.community
    const students = res.rows.map(r => {
      let campus = 'Main Campus';
      const match = (r.student_email || '').match(/\.s\.(\d+)@/);
      if (match) {
        campus = `Cohort ${match[1]}`;
      }
      return {
        name: r.student_name,
        email: r.student_email,
        mentor: r.mentor_name,
        campus,
        totalSubmissions: Number(r.total_reports),
        bugsReported: Number(r.bug_count),
        feedbackProvided: Number(r.feedback_count),
        status: 'Active',
        lastActivity: formatTs(r.last_activity),
        firstSeen: formatTs(r.first_seen)
      };
    });

    return {
      resource: 'students',
      title: 'KalviLearn Students & Submissions Report',
      count: students.length,
      records: students
    };
  }

  // --- RESOURCE: MENTORS (KalviLearn Mentors & Oversight) ---
  if (resource === 'mentors') {
    const sql = `
      SELECT 
        t.reporter_name as mentor_name,
        t.reporter_email as mentor_email,
        COALESCE(t.reporter_role, 'MENTOR') as role,
        COUNT(t.id) as reports_handled,
        MAX(t.created_at) as last_active,
        MIN(t.created_at) as joined_date
      FROM public.tickets t
      WHERE t.portal = 'MENTOR' 
         OR t.reporter_role IN ('MENTOR', 'LEAD_MENTOR')
         OR t.reporter_email ILIKE '%@kalvium.com'
      GROUP BY t.reporter_name, t.reporter_email, t.reporter_role
      ORDER BY reports_handled DESC;
    `;

    const res = await query(sql);
    const mentors = res.rows.map(r => ({
      name: r.mentor_name,
      email: r.mentor_email,
      role: r.role || 'MENTOR',
      reportsManaged: Number(r.reports_handled),
      status: 'Active',
      lastActivity: formatTs(r.last_active),
      firstActive: formatTs(r.joined_date)
    }));

    return {
      resource: 'mentors',
      title: 'KalviLearn Mentors & Oversight Report',
      count: mentors.length,
      records: mentors
    };
  }

  // --- RESOURCE: TASKS (TeamSync Tasks & Engineering Issues) ---
  if (resource === 'tasks') {
    const sql = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.deadline,
        t.created_at,
        t.updated_at,
        p.full_name as assignee_name,
        p.email as assignee_email,
        d.name as department_name,
        c.full_name as creator_name
      FROM public.tasks t
      LEFT JOIN public.profiles p ON t.assigned_to = p.id
      LEFT JOIN public.departments d ON t.department_id = d.id
      LEFT JOIN public.profiles c ON t.assigned_by = c.id
      ORDER BY t.created_at DESC;
    `;

    const res = await query(sql);
    const tasks = res.rows.map(r => ({
      taskId: r.id.substring(0, 8),
      title: r.title,
      status: r.status,
      priority: r.priority,
      assignee: r.assignee_name || 'Unassigned',
      assigneeEmail: r.assignee_email || '—',
      department: r.department_name || 'Engineering',
      assignedBy: r.creator_name || 'Management',
      deadline: formatTs(r.deadline),
      createdAt: formatTs(r.created_at)
    }));

    return {
      resource: 'tasks',
      title: 'TeamSync Engineering Tasks & Issues Report',
      count: tasks.length,
      records: tasks
    };
  }

  // --- RESOURCE: ANALYTICS (Live Integration Metrics & Performance) ---
  if (resource === 'analytics') {
    const [countsRes, typeRes, statusRes, priorityRes, portalRes] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM public.tickets`),
      query(`SELECT type, COUNT(*) as c FROM public.tickets GROUP BY type ORDER BY c DESC`),
      query(`SELECT status, COUNT(*) as c FROM public.tickets GROUP BY status ORDER BY c DESC`),
      query(`SELECT priority, COUNT(*) as c FROM public.tickets GROUP BY priority ORDER BY c DESC`),
      query(`SELECT COALESCE(portal, 'UNASSIGNED') as portal, COUNT(*) as c FROM public.tickets GROUP BY portal ORDER BY c DESC`)
    ]);

    const total = parseInt(countsRes.rows[0]?.total || '0', 10);
    const byType = Object.fromEntries(typeRes.rows.map(r => [r.type, parseInt(r.c, 10)]));
    const byStatus = Object.fromEntries(statusRes.rows.map(r => [r.status, parseInt(r.c, 10)]));
    const byPriority = Object.fromEntries(priorityRes.rows.map(r => [r.priority, parseInt(r.c, 10)]));
    const byPortal = Object.fromEntries(portalRes.rows.map(r => [r.portal, parseInt(r.c, 10)]));

    const resolved = (byStatus.RESOLVED || 0) + (byStatus.CLOSED || 0);
    const resolutionRate = total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%';

    return {
      resource: 'analytics',
      title: 'TeamSync × KalviLearn Integration Analytics & Performance',
      count: total,
      analytics: {
        totalTickets: total,
        resolutionRate,
        openTriage: byStatus.OPEN || 0,
        inProgress: byStatus.IN_PROGRESS || 0,
        blocked: byStatus.BLOCKED || 0,
        resolved: byStatus.RESOLVED || 0,
        closed: byStatus.CLOSED || 0,
        critical: byPriority.CRITICAL || 0,
        byType,
        byStatus,
        byPriority,
        byPortal
      }
    };
  }

  const err = new Error(`Unsupported resource "${resource}".`);
  err.statusCode = 400;
  throw err;
}

/**
 * 2. Generate PDF Export Document (Landscape, Paginated, Branded, Printable)
 */
export async function generatePdfExport({ data, filters = {}, caller = {} }) {
  return new Promise((resolve, reject) => {
    try {
      const isAnalytics = data.resource === 'analytics';
      const doc = new PDFDocument({
        size: 'A4',
        layout: isAnalytics ? 'portrait' : 'landscape',
        margin: 36,
        bufferPages: true
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 36;
      const printableWidth = pageWidth - margin * 2;

      // Header Banner
      doc.rect(margin, margin, printableWidth, 54).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
         .text('TEAMSYNC × KALVILEARN', margin + 14, margin + 12);
      doc.fontSize(10).font('Helvetica')
         .fillColor('#94a3b8')
         .text(data.title.toUpperCase(), margin + 14, margin + 32);

      // Timestamp & Metadata top right
      const nowStr = formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss');
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
         .text(`Generated: ${nowStr}`, margin, margin + 15, { align: 'right', width: printableWidth - 14 })
         .text(`Total Records: ${data.count}`, margin, margin + 28, { align: 'right', width: printableWidth - 14 });

      let currentY = margin + 66;

      // Render Analytics Resource
      if (isAnalytics) {
        const stats = data.analytics;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Executive Summary & Live Metrics', margin, currentY);
        currentY += 18;

        // KPI Metric Cards Grid
        const kpis = [
          { label: 'TOTAL REPORTS', val: stats.totalTickets, color: '#1e293b' },
          { label: 'RESOLUTION RATE', val: stats.resolutionRate, color: '#047857' },
          { label: 'OPEN TRIAGE', val: stats.openTriage, color: '#b45309' },
          { label: 'IN PROGRESS', val: stats.inProgress, color: '#4338ca' },
          { label: 'BLOCKED', val: stats.blocked, color: '#c2410c' },
          { label: 'CRITICAL ISSUES', val: stats.critical, color: '#b91c1c' }
        ];

        const cardWidth = (printableWidth - 25) / 3;
        const cardHeight = 44;
        kpis.forEach((kpi, idx) => {
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const x = margin + col * (cardWidth + 12);
          const y = currentY + row * (cardHeight + 10);

          doc.rect(x, y, cardWidth, cardHeight).fillAndStroke('#f8fafc', '#e2e8f0');
          doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(kpi.label, x + 10, y + 8);
          doc.fillColor(kpi.color).fontSize(14).font('Helvetica-Bold').text(String(kpi.val), x + 10, y + 22);
        });

        currentY += 2 * (cardHeight + 10) + 15;

        // Category Breakdown Tables
        const renderSectionTable = (title, items) => {
          if (currentY + 120 > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
          }
          doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(title, margin, currentY);
          currentY += 16;

          doc.rect(margin, currentY, printableWidth, 18).fill('#f1f5f9');
          doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold')
             .text('CATEGORY / METRIC', margin + 8, currentY + 5)
             .text('COUNT', margin + printableWidth - 80, currentY + 5, { width: 70, align: 'right' });
          currentY += 18;

          Object.entries(items).forEach(([k, v], i) => {
            const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(margin, currentY, printableWidth, 16).fill(rowBg);
            doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
               .text(k, margin + 8, currentY + 4)
               .text(String(v), margin + printableWidth - 80, currentY + 4, { width: 70, align: 'right' });
            currentY += 16;
          });
          currentY += 14;
        };

        renderSectionTable('Breakdown by Ticket Type', stats.byType);
        renderSectionTable('Breakdown by Status', stats.byStatus);
        renderSectionTable('Breakdown by Priority', stats.byPriority);
        renderSectionTable('Breakdown by User Portal', stats.byPortal);
      } else {
        // Tabular Resource Rendering (Tickets, Students, Mentors, Tasks)
        let columns = [];
        if (data.resource === 'tickets') {
          columns = [
            { header: 'TICKET #', key: 'ticketNumber', width: 62 },
            { header: 'TITLE', key: 'title', width: 180 },
            { header: 'TYPE', key: 'type', width: 55 },
            { header: 'STATUS', key: 'status', width: 65 },
            { header: 'PRIORITY', key: 'priority', width: 55 },
            { header: 'PORTAL', key: 'portal', width: 55 },
            { header: 'REPORTER', key: 'reporterName', width: 100 },
            { header: 'ASSIGNEE', key: 'assigneeName', width: 100 },
            { header: 'CREATED', key: 'createdAt', width: 95 }
          ];
        } else if (data.resource === 'students') {
          columns = [
            { header: 'STUDENT NAME', key: 'name', width: 140 },
            { header: 'EMAIL', key: 'email', width: 190 },
            { header: 'MENTOR', key: 'mentor', width: 110 },
            { header: 'CAMPUS', key: 'campus', width: 85 },
            { header: 'SUBMISSIONS', key: 'totalSubmissions', width: 75, align: 'right' },
            { header: 'BUGS', key: 'bugsReported', width: 50, align: 'right' },
            { header: 'STATUS', key: 'status', width: 55 },
            { header: 'LAST ACTIVITY', key: 'lastActivity', width: 65 }
          ];
        } else if (data.resource === 'mentors') {
          columns = [
            { header: 'MENTOR NAME', key: 'name', width: 160 },
            { header: 'EMAIL', key: 'email', width: 220 },
            { header: 'ROLE', key: 'role', width: 110 },
            { header: 'REPORTS MANAGED', key: 'reportsManaged', width: 100, align: 'right' },
            { header: 'STATUS', key: 'status', width: 70 },
            { header: 'LAST ACTIVE', key: 'lastActivity', width: 110 }
          ];
        } else if (data.resource === 'tasks') {
          columns = [
            { header: 'TASK ID', key: 'taskId', width: 70 },
            { header: 'TITLE', key: 'title', width: 220 },
            { header: 'STATUS', key: 'status', width: 70 },
            { header: 'PRIORITY', key: 'priority', width: 65 },
            { header: 'ASSIGNEE', key: 'assignee', width: 130 },
            { header: 'DEPARTMENT', key: 'department', width: 110 },
            { header: 'CREATED', key: 'createdAt', width: 105 }
          ];
        }

        const renderTableHeader = (y) => {
          doc.rect(margin, y, printableWidth, 18).fill('#0f172a');
          let curX = margin;
          columns.forEach(col => {
            doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
               .text(col.header, curX + 4, y + 5, { width: col.width - 8, align: col.align || 'left' });
            curX += col.width;
          });
          return y + 18;
        };

        currentY = renderTableHeader(currentY);

        // Render rows with auto-pagination
        data.records.forEach((row, rowIdx) => {
          // Check page overflow
          if (currentY + 22 > pageHeight - margin - 20) {
            doc.addPage();
            currentY = margin;
            currentY = renderTableHeader(currentY);
          }

          const rowBg = rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(margin, currentY, printableWidth, 18).fill(rowBg);

          let curX = margin;
          columns.forEach(col => {
            const rawVal = row[col.key] !== undefined && row[col.key] !== null ? String(row[col.key]) : '—';
            doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica')
               .text(rawVal, curX + 4, currentY + 5, {
                 width: col.width - 8,
                 align: col.align || 'left',
                 ellipsis: true
               });
            curX += col.width;
          });

          // Horizontal grid line
          doc.strokeColor('#e2e8f0').lineWidth(0.5)
             .moveTo(margin, currentY + 18).lineTo(margin + printableWidth, currentY + 18).stroke();

          currentY += 18;
        });
      }

      // Add Headers & Footers to all buffered pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Footer line
        doc.strokeColor('#cbd5e1').lineWidth(0.5)
           .moveTo(margin, pageHeight - margin + 4)
           .lineTo(margin + printableWidth, pageHeight - margin + 4)
           .stroke();

        doc.fontSize(7.5).font('Helvetica').fillColor('#64748b')
           .text('TeamSync × KalviLearn Integration Platform · Confidential Report', margin, pageHeight - margin + 8, {
             width: printableWidth / 2,
             align: 'left'
           })
           .text(`Page ${i + 1} of ${range.count}`, margin + printableWidth / 2, pageHeight - margin + 8, {
             width: printableWidth / 2,
             align: 'right'
           });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 3. Generate DOCX Export Document (Microsoft Word & Google Docs Compatible)
 */
export async function generateDocxExport({ data, filters = {}, caller = {} }) {
  const isAnalytics = data.resource === 'analytics';
  const nowStr = formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss');

  const children = [];

  // Header Paragraph
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'TEAMSYNC × KALVILEARN', bold: true, size: 28, color: '0F172A' })
      ]
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${data.title} — Official Integration Export`, italics: true, size: 20, color: '475569' })
      ]
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated: ${nowStr} | Total Records: ${data.count} | Authorized Caller: ${caller.role || 'WORKSPACE'}`, size: 16, color: '64748B' })
      ]
    }),
    new Paragraph({ text: '' })
  );

  if (isAnalytics) {
    const stats = data.analytics;
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Executive KPI Metrics', bold: true, size: 22, color: '0F172A' })]
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Metric', bold: true, color: 'FFFFFF' })] })]
              }),
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Current Value', bold: true, color: 'FFFFFF' })] })]
              })
            ]
          }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Total Tickets')] }), new TableCell({ children: [new Paragraph(String(stats.totalTickets))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Resolution Rate')] }), new TableCell({ children: [new Paragraph(String(stats.resolutionRate))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Open Triage')] }), new TableCell({ children: [new Paragraph(String(stats.openTriage))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('In Progress')] }), new TableCell({ children: [new Paragraph(String(stats.inProgress))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Blocked')] }), new TableCell({ children: [new Paragraph(String(stats.blocked))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Critical Issues')] }), new TableCell({ children: [new Paragraph(String(stats.critical))] })] })
        ]
      }),
      new Paragraph({ text: '' })
    );
  } else {
    // Generate Table for Tabular Data
    let headers = [];
    let keys = [];

    if (data.resource === 'tickets') {
      headers = ['Ticket #', 'Title', 'Type', 'Status', 'Priority', 'Portal', 'Reporter', 'Assignee', 'Created At'];
      keys = ['ticketNumber', 'title', 'type', 'status', 'priority', 'portal', 'reporterName', 'assigneeName', 'createdAt'];
    } else if (data.resource === 'students') {
      headers = ['Student Name', 'Email', 'Mentor', 'Campus', 'Total Submissions', 'Bugs', 'Status', 'Last Activity'];
      keys = ['name', 'email', 'mentor', 'campus', 'totalSubmissions', 'bugsReported', 'status', 'lastActivity'];
    } else if (data.resource === 'mentors') {
      headers = ['Mentor Name', 'Email', 'Role', 'Reports Managed', 'Status', 'Last Active'];
      keys = ['name', 'email', 'role', 'reportsManaged', 'status', 'lastActivity'];
    } else if (data.resource === 'tasks') {
      headers = ['Task ID', 'Title', 'Status', 'Priority', 'Assignee', 'Department', 'Created At'];
      keys = ['taskId', 'title', 'status', 'priority', 'assignee', 'department', 'createdAt'];
    }

    const tableRows = [
      new TableRow({
        tableHeader: true,
        children: headers.map(h => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: '0F172A' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 16 })]
            })
          ]
        }))
      })
    ];

    data.records.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
      tableRows.push(
        new TableRow({
          children: keys.map(k => new TableCell({
            shading: { type: ShadingType.CLEAR, fill: bg },
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(row[k] ?? '—'), size: 16, color: '0F172A' })]
              })
            ]
          }))
        })
      );
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows
      })
    );
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'TeamSync × KalviLearn Integration Report', italics: true, size: 14, color: '94A3B8' })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Confidential · Generated by TeamSync Integration Hub · Page ', size: 14, color: '94A3B8' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '94A3B8' }),
                new TextRun({ text: ' of ', size: 14, color: '94A3B8' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '94A3B8' })
              ]
            })
          ]
        })
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

/**
 * 4. Generate RFC 4180 Compliant CSV Export (UTF-8 with BOM for Excel)
 */
export async function generateCsvExport({ data }) {
  let csvContent = '\uFEFF'; // UTF-8 BOM

  if (data.resource === 'analytics') {
    const stats = data.analytics;
    csvContent += 'Metric,Value\r\n';
    csvContent += `Total Tickets,${escapeCsvValue(stats.totalTickets)}\r\n`;
    csvContent += `Resolution Rate,${escapeCsvValue(stats.resolutionRate)}\r\n`;
    csvContent += `Open Triage,${escapeCsvValue(stats.openTriage)}\r\n`;
    csvContent += `In Progress,${escapeCsvValue(stats.inProgress)}\r\n`;
    csvContent += `Blocked,${escapeCsvValue(stats.blocked)}\r\n`;
    csvContent += `Resolved,${escapeCsvValue(stats.resolved)}\r\n`;
    csvContent += `Closed,${escapeCsvValue(stats.closed)}\r\n`;
    csvContent += `Critical Issues,${escapeCsvValue(stats.critical)}\r\n`;
    csvContent += '\r\nCategory,Type,Count\r\n';
    Object.entries(stats.byType).forEach(([t, c]) => {
      csvContent += `Type,${escapeCsvValue(t)},${escapeCsvValue(c)}\r\n`;
    });
    Object.entries(stats.byStatus).forEach(([s, c]) => {
      csvContent += `Status,${escapeCsvValue(s)},${escapeCsvValue(c)}\r\n`;
    });
    Object.entries(stats.byPriority).forEach(([p, c]) => {
      csvContent += `Priority,${escapeCsvValue(p)},${escapeCsvValue(c)}\r\n`;
    });
    Object.entries(stats.byPortal).forEach(([po, c]) => {
      csvContent += `Portal,${escapeCsvValue(po)},${escapeCsvValue(c)}\r\n`;
    });
    return Buffer.from(csvContent, 'utf-8');
  }

  let headers = [];
  let keys = [];

  if (data.resource === 'tickets') {
    headers = [
      'Ticket Number', 'Title', 'Type', 'Status', 'Priority', 'Portal',
      'Module', 'Route', 'Reporter Name', 'Reporter Email', 'Reporter Role',
      'Assignee Name', 'Assignee Email', 'Created At', 'Updated At', 'Resolved At'
    ];
    keys = [
      'ticketNumber', 'title', 'type', 'status', 'priority', 'portal',
      'module', 'route', 'reporterName', 'reporterEmail', 'reporterRole',
      'assigneeName', 'assigneeEmail', 'createdAt', 'updatedAt', 'resolvedAt'
    ];
  } else if (data.resource === 'students') {
    headers = ['Student Name', 'Email', 'Mentor', 'Campus', 'Total Submissions', 'Bugs Reported', 'Feedback Provided', 'Status', 'Last Activity', 'First Seen'];
    keys = ['name', 'email', 'mentor', 'campus', 'totalSubmissions', 'bugsReported', 'feedbackProvided', 'status', 'lastActivity', 'firstSeen'];
  } else if (data.resource === 'mentors') {
    headers = ['Mentor Name', 'Email', 'Role', 'Reports Managed', 'Status', 'Last Active', 'First Active'];
    keys = ['name', 'email', 'role', 'reportsManaged', 'status', 'lastActivity', 'firstActive'];
  } else if (data.resource === 'tasks') {
    headers = ['Task ID', 'Title', 'Status', 'Priority', 'Assignee', 'Assignee Email', 'Department', 'Assigned By', 'Deadline', 'Created At'];
    keys = ['taskId', 'title', 'status', 'priority', 'assignee', 'assigneeEmail', 'department', 'assignedBy', 'deadline', 'createdAt'];
  }

  csvContent += headers.map(escapeCsvValue).join(',') + '\r\n';

  data.records.forEach(row => {
    const line = keys.map(k => escapeCsvValue(row[k])).join(',');
    csvContent += line + '\r\n';
  });

  return Buffer.from(csvContent, 'utf-8');
}

/**
 * 5. Master Export Orchestrator
 */
export async function exportIntegrationData({ format = 'pdf', resource = 'tickets', filters = {}, caller = {} }) {
  const normFormat = (format || 'pdf').toLowerCase().trim();
  const normResource = (resource || 'tickets').toLowerCase().trim();

  if (!SUPPORTED_FORMATS.includes(normFormat)) {
    const err = new Error(`Invalid export format "${format}". Supported formats: ${SUPPORTED_FORMATS.join(', ')}.`);
    err.statusCode = 400;
    throw err;
  }

  if (!SUPPORTED_RESOURCES.includes(normResource)) {
    const err = new Error(`Invalid export resource "${resource}". Supported resources: ${SUPPORTED_RESOURCES.join(', ')}.`);
    err.statusCode = 400;
    throw err;
  }

  // 1. Fetch authorized database records
  const data = await fetchExportData({ resource: normResource, filters, caller });

  // 2. Empty dataset handling
  if (data.count === 0 && normResource !== 'analytics') {
    const err = new Error('There is no data available for this export.');
    err.statusCode = 404;
    throw err;
  }

  // 3. Format Generation
  let fileBuffer;
  let contentType;
  let ext;

  if (normFormat === 'pdf') {
    fileBuffer = await generatePdfExport({ data, filters, caller });
    contentType = 'application/pdf';
    ext = 'pdf';
  } else if (normFormat === 'docx' || normFormat === 'docs') {
    fileBuffer = await generateDocxExport({ data, filters, caller });
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    ext = 'docx';
  } else {
    fileBuffer = await generateCsvExport({ data });
    contentType = 'text/csv; charset=utf-8';
    ext = 'csv';
  }

  const dateTag = formatDate(new Date(), 'yyyy-MM-dd');
  const resourceTitle = normResource.charAt(0).toUpperCase() + normResource.slice(1);
  const filename = `TeamSync-KalviLearn-${resourceTitle}-${dateTag}.${ext}`;

  return {
    buffer: fileBuffer,
    contentType,
    filename,
    recordCount: data.count
  };
}

export default {
  exportIntegrationData,
  fetchExportData,
  generatePdfExport,
  generateDocxExport,
  generateCsvExport,
  SUPPORTED_FORMATS,
  SUPPORTED_RESOURCES
};
