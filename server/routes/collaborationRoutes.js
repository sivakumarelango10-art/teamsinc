import express from 'express';
import { pool, query } from '../db.js';

const router = express.Router();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POLLS API
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 1. Create Poll
router.post('/polls', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      question,
      description = '',
      options = [],
      is_multiple_choice = false,
      is_anonymous = false,
      allow_vote_change = true,
      closes_at = null,
      channel = null,
      conversation_id = null,
      creator_id = null,
      post_to_chat = true
    } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ success: false, error: 'Poll question is required.' });
    }

    const cleanOptions = (options || [])
      .map(o => (typeof o === 'string' ? o.trim() : o?.text?.trim()))
      .filter(Boolean);

    if (cleanOptions.length < 2) {
      return res.status(400).json({ success: false, error: 'A poll requires at least 2 options.' });
    }

    await client.query('BEGIN');

    const pollRes = await client.query(`
      INSERT INTO public.polls (
        creator_id, conversation_id, channel, question, description,
        is_multiple_choice, is_anonymous, allow_vote_change, closes_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `, [
      creator_id || null,
      conversation_id || null,
      channel || null,
      question.trim(),
      description ? description.trim() : null,
      Boolean(is_multiple_choice),
      Boolean(is_anonymous),
      allow_vote_change !== false,
      closes_at ? new Date(closes_at).toISOString() : null
    ]);

    const poll = pollRes.rows[0];

    // Insert options
    const insertedOptions = [];
    for (let i = 0; i < cleanOptions.length; i++) {
      const optRes = await client.query(`
        INSERT INTO public.poll_options (poll_id, text, option_order)
        VALUES ($1, $2, $3)
        RETURNING *;
      `, [poll.id, cleanOptions[i], i]);
      insertedOptions.push(optRes.rows[0]);
    }

    // Optional: Auto-create message in channel or direct conversation
    let messageRecord = null;
    if (post_to_chat) {
      const content = `📊 **Poll:** ${question.trim()}`;
      const metadata = {
        type: 'poll',
        pollId: poll.id,
        question: poll.question,
        optionsCount: cleanOptions.length
      };

      if (conversation_id) {
        // Direct conversation message
        const msgRes = await client.query(`
          INSERT INTO public.direct_messages (
            conversation_id, sender_id, recipient_id, content, metadata
          ) VALUES ($1, $2, (
            SELECT CASE 
              WHEN participant_one_id = $2 THEN participant_two_id 
              ELSE participant_one_id 
            END FROM public.direct_conversations WHERE id = $1
          ), $3, $4)
          RETURNING *;
        `, [conversation_id, creator_id, content, JSON.stringify(metadata)]);
        messageRecord = msgRes.rows[0];
      } else if (channel) {
        // Channel message
        const creatorRes = await client.query(`
          SELECT full_name, email, role FROM public.profiles WHERE id = $1;
        `, [creator_id]);
        const creator = creatorRes.rows[0] || {};

        const msgRes = await client.query(`
          INSERT INTO public.messages (
            sender_id, sender_name, sender_email, sender_role, content, channel, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *;
        `, [
          creator_id,
          creator.full_name || 'Team Member',
          creator.email || '',
          creator.role || 'MEMBER',
          content,
          channel,
          JSON.stringify(metadata)
        ]);
        messageRecord = msgRes.rows[0];
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      poll: {
        ...poll,
        options: insertedOptions,
        votes: []
      },
      message: messageRecord
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 2. Get Poll Details with options and vote statistics
router.get('/polls/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.query.userId || req.headers['x-user-id'];

    const pollRes = await query(`
      SELECT p.*,
        pr.full_name as creator_name,
        pr.email as creator_email,
        pr.avatar_url as creator_avatar_url
      FROM public.polls p
      LEFT JOIN public.profiles pr ON p.creator_id = pr.id
      WHERE p.id = $1;
    `, [id]);

    if (!pollRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Poll not found' });
    }

    const poll = pollRes.rows[0];

    // Check if expired
    const isExpired = poll.closes_at && new Date(poll.closes_at) <= new Date();
    const isClosed = poll.is_closed || isExpired;

    const optRes = await query(`
      SELECT * FROM public.poll_options
      WHERE poll_id = $1
      ORDER BY option_order ASC;
    `, [id]);

    const votesRes = await query(`
      SELECT v.id, v.option_id, v.voter_id, v.voter_name, v.created_at,
        pr.avatar_url as voter_avatar_url
      FROM public.poll_votes v
      LEFT JOIN public.profiles pr ON v.voter_id = pr.id
      WHERE v.poll_id = $1;
    `, [id]);

    const votes = votesRes.rows;
    const totalVotes = votes.length;
    const uniqueVoters = new Set(votes.map(v => v.voter_id));
    const totalVotersCount = uniqueVoters.size;

    // Aggregate options with vote stats
    const optionsWithStats = optRes.rows.map(opt => {
      const optVotes = votes.filter(v => v.option_id === opt.id);
      const voteCount = optVotes.length;
      const percentage = totalVotersCount > 0 
        ? Math.round((voteCount / totalVotersCount) * 100) 
        : 0;

      const hasVoted = currentUserId 
        ? optVotes.some(v => v.voter_id === currentUserId) 
        : false;

      return {
        ...opt,
        voteCount,
        percentage,
        hasVoted,
        // Hide individual voter identities if anonymous
        voters: poll.is_anonymous ? [] : optVotes.map(v => ({
          id: v.voter_id,
          name: v.voter_name,
          avatar_url: v.voter_avatar_url
        }))
      };
    });

    const userHasVoted = currentUserId 
      ? votes.some(v => v.voter_id === currentUserId)
      : false;

    return res.status(200).json({
      success: true,
      poll: {
        ...poll,
        is_closed: isClosed,
        totalVotes,
        totalVotersCount,
        userHasVoted,
        options: optionsWithStats
      }
    });
  } catch (err) {
    next(err);
  }
});

// 3. Cast or Change Vote
router.post('/polls/:id/vote', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { option_ids, voter_id, voter_name, voter_email } = req.body;

    if (!voter_id) {
      return res.status(400).json({ success: false, error: 'Voter ID is required' });
    }

    const selectedOptionIds = Array.isArray(option_ids) ? option_ids : [option_ids].filter(Boolean);
    if (!selectedOptionIds.length) {
      return res.status(400).json({ success: false, error: 'At least one option must be selected' });
    }

    await client.query('BEGIN');

    const pollRes = await client.query(`
      SELECT * FROM public.polls WHERE id = $1 FOR UPDATE;
    `, [id]);

    if (!pollRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Poll not found' });
    }

    const poll = pollRes.rows[0];

    // Check closed status
    if (poll.is_closed || (poll.closes_at && new Date(poll.closes_at) <= new Date())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'This poll is closed and no longer accepting votes.' });
    }

    // Check single choice enforcement
    if (!poll.is_multiple_choice && selectedOptionIds.length > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'This poll only allows a single selection.' });
    }

    // Check existing votes
    const existingVotes = await client.query(`
      SELECT * FROM public.poll_votes WHERE poll_id = $1 AND voter_id = $2;
    `, [id, voter_id]);

    if (existingVotes.rows.length > 0) {
      if (!poll.allow_vote_change) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, error: 'Vote changes are not permitted for this poll.' });
      }
      // Remove prior votes to replace with new selection
      await client.query(`
        DELETE FROM public.poll_votes WHERE poll_id = $1 AND voter_id = $2;
      `, [id, voter_id]);
    }

    // Insert new votes
    for (const optId of selectedOptionIds) {
      await client.query(`
        INSERT INTO public.poll_votes (poll_id, option_id, voter_id, voter_name, voter_email)
        VALUES ($1, $2, $3, $4, $5);
      `, [id, optId, voter_id, voter_name || 'Voter', voter_email || '']);
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Vote recorded successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 4. Close Poll
router.post('/polls/:id/close', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id, user_role } = req.body;

    const pollRes = await query(`SELECT * FROM public.polls WHERE id = $1;`, [id]);
    if (!pollRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Poll not found' });
    }
    const poll = pollRes.rows[0];

    const isCreator = poll.creator_id === user_id;
    const isPrivileged = ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'].includes(user_role);

    if (!isCreator && !isPrivileged) {
      return res.status(403).json({ success: false, error: 'Only the creator or an administrator can close this poll.' });
    }

    const updated = await query(`
      UPDATE public.polls 
      SET is_closed = true, updated_at = now()
      WHERE id = $1
      RETURNING *;
    `, [id]);

    return res.status(200).json({ success: true, poll: updated.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTES & TO-DO LISTS API
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 5. Create Note & Checklists
router.post('/notes', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      author_id,
      title,
      content = '',
      category = 'GENERAL',
      visibility = 'PERSONAL',
      task_id = null,
      channel = null,
      conversation_id = null,
      todo_items = [],
      share_to_chat = false
    } = req.body;

    if (!author_id) {
      return res.status(400).json({ success: false, error: 'Author ID is required.' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Note title is required.' });
    }

    await client.query('BEGIN');

    const noteRes = await client.query(`
      INSERT INTO public.notes (
        author_id, task_id, conversation_id, channel, title, content, category, visibility
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `, [
      author_id,
      task_id || null,
      conversation_id || null,
      channel || null,
      title.trim(),
      content || '',
      ['GENERAL', 'TODO', 'TASK_LINKED'].includes(category) ? category : 'GENERAL',
      ['PERSONAL', 'SHARED'].includes(visibility) ? visibility : 'PERSONAL'
    ]);

    const note = noteRes.rows[0];

    // Insert todo checklist items if any
    const createdTodos = [];
    if (Array.isArray(todo_items) && todo_items.length > 0) {
      for (let i = 0; i < todo_items.length; i++) {
        const item = todo_items[i];
        const itemText = typeof item === 'string' ? item.trim() : item.text?.trim();
        if (itemText) {
          const todoRes = await client.query(`
            INSERT INTO public.todo_items (
              note_id, task_id, text, is_completed, assignee_id, due_date, priority, item_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
          `, [
            note.id,
            task_id || null,
            itemText,
            Boolean(item.is_completed),
            item.assignee_id || null,
            item.due_date || null,
            item.priority || 'MEDIUM',
            i
          ]);
          createdTodos.push(todoRes.rows[0]);
        }
      }
    }

    // Optional: Share note snippet into active conversation
    let chatMsg = null;
    if (share_to_chat && (channel || conversation_id)) {
      const previewText = category === 'TODO' 
        ? `📝 **To-Do List: ${title.trim()}** (${createdTodos.length} items)`
        : `📝 **Shared Note: ${title.trim()}**\n${content.slice(0, 160)}${content.length > 160 ? '...' : ''}`;

      const metadata = {
        type: category === 'TODO' ? 'todo_list' : 'note',
        noteId: note.id,
        title: note.title,
        category: note.category,
        itemsCount: createdTodos.length
      };

      if (conversation_id) {
        const msgRes = await client.query(`
          INSERT INTO public.direct_messages (
            conversation_id, sender_id, recipient_id, content, metadata
          ) VALUES ($1, $2, (
            SELECT CASE 
              WHEN participant_one_id = $2 THEN participant_two_id 
              ELSE participant_one_id 
            END FROM public.direct_conversations WHERE id = $1
          ), $3, $4)
          RETURNING *;
        `, [conversation_id, author_id, previewText, JSON.stringify(metadata)]);
        chatMsg = msgRes.rows[0];
      } else if (channel) {
        const authorRes = await client.query(`SELECT full_name, email, role FROM public.profiles WHERE id = $1;`, [author_id]);
        const author = authorRes.rows[0] || {};
        const msgRes = await client.query(`
          INSERT INTO public.messages (
            sender_id, sender_name, sender_email, sender_role, content, channel, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *;
        `, [
          author_id,
          author.full_name || 'Team Member',
          author.email || '',
          author.role || 'MEMBER',
          previewText,
          channel,
          JSON.stringify(metadata)
        ]);
        chatMsg = msgRes.rows[0];
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      note: {
        ...note,
        todo_items: createdTodos
      },
      message: chatMsg
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 6. Get Notes (Filtered by User, Task, Category, Visibility)
router.get('/notes', async (req, res, next) => {
  try {
    const { userId, taskId, category, visibility, search } = req.query;

    let queryStr = `
      SELECT n.*,
        pr.full_name as author_name,
        pr.avatar_url as author_avatar_url,
        t.title as task_title,
        (
          SELECT json_agg(ti.* ORDER BY ti.item_order ASC)
          FROM public.todo_items ti
          WHERE ti.note_id = n.id
        ) as todo_items
      FROM public.notes n
      LEFT JOIN public.profiles pr ON n.author_id = pr.id
      LEFT JOIN public.tasks t ON n.task_id = t.id
      WHERE n.is_archived = false
    `;
    const params = [];

    // Privacy rule: User only sees notes they authored OR notes that are marked SHARED
    if (userId) {
      params.push(userId);
      queryStr += ` AND (n.author_id = $${params.length} OR n.visibility = 'SHARED')`;
    }

    if (taskId) {
      params.push(taskId);
      queryStr += ` AND n.task_id = $${params.length}`;
    }

    if (category && category !== 'ALL') {
      params.push(category);
      queryStr += ` AND n.category = $${params.length}`;
    }

    if (visibility && visibility !== 'ALL') {
      params.push(visibility);
      queryStr += ` AND n.visibility = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      queryStr += ` AND (LOWER(n.title) LIKE $${params.length} OR LOWER(n.content) LIKE $${params.length})`;
    }

    queryStr += ` ORDER BY n.updated_at DESC;`;

    const notesRes = await query(queryStr, params);
    return res.status(200).json({ success: true, notes: notesRes.rows });
  } catch (err) {
    next(err);
  }
});

// 7. Toggle To-Do Item Completion
router.patch('/todos/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_completed } = req.body;

    const updated = await query(`
      UPDATE public.todo_items
      SET is_completed = $1, updated_at = now()
      WHERE id = $2
      RETURNING *;
    `, [Boolean(is_completed), id]);

    if (!updated.rows.length) {
      return res.status(404).json({ success: false, error: 'To-do item not found' });
    }

    return res.status(200).json({ success: true, item: updated.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TASK PROGRESS REPORTS API
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 8. Submit Progress Report
router.post('/reports', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      task_id,
      reporter_id,
      status,
      progress_percentage = 0,
      summary,
      work_completed = '',
      work_in_progress = '',
      blockers = '',
      assistance_required = '',
      next_steps = '',
      expected_completion_date = null,
      attachments = [],
      channel = null,
      conversation_id = null,
      update_task_status = true
    } = req.body;

    if (!task_id) return res.status(400).json({ success: false, error: 'Task ID is required.' });
    if (!reporter_id) return res.status(400).json({ success: false, error: 'Reporter ID is required.' });
    if (!summary || !summary.trim()) return res.status(400).json({ success: false, error: 'Progress summary is required.' });
    if (!status) return res.status(400).json({ success: false, error: 'Task status is required.' });

    await client.query('BEGIN');

    // 1. Verify task exists
    const taskRes = await client.query(`SELECT * FROM public.tasks WHERE id = $1 FOR UPDATE;`, [task_id]);
    if (!taskRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const currentTask = taskRes.rows[0];

    // 2. Insert Progress Report into history
    const clampedProgress = Math.max(0, Math.min(100, Number(progress_percentage) || 0));
    const reportRes = await client.query(`
      INSERT INTO public.task_progress_reports (
        task_id, reporter_id, status, progress_percentage, summary,
        work_completed, work_in_progress, blockers, assistance_required,
        next_steps, expected_completion_date, attachments, channel, conversation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `, [
      task_id,
      reporter_id,
      status,
      clampedProgress,
      summary.trim(),
      work_completed || '',
      work_in_progress || '',
      blockers || '',
      assistance_required || '',
      next_steps || '',
      expected_completion_date || null,
      JSON.stringify(attachments || []),
      channel || null,
      conversation_id || null
    ]);

    const report = reportRes.rows[0];

    // 3. Atomically update authoritative Task status & progress if permitted
    if (update_task_status) {
      await client.query(`
        UPDATE public.tasks 
        SET status = $1, progress_percentage = $2, updated_at = now()
        WHERE id = $3;
      `, [status, clampedProgress, task_id]);
    }

    // 4. Create chat card if posted from/to chat
    let chatMsg = null;
    if (channel || conversation_id) {
      const reportContent = `📋 **Task Progress Report: ${currentTask.title}**\n**Status:** ${status} (${clampedProgress}%)\n${summary.trim()}`;
      const metadata = {
        type: 'task_progress_report',
        reportId: report.id,
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        status,
        progress: clampedProgress,
        blockers: blockers || null
      };

      if (conversation_id) {
        const msgRes = await client.query(`
          INSERT INTO public.direct_messages (
            conversation_id, sender_id, recipient_id, content, metadata
          ) VALUES ($1, $2, (
            SELECT CASE 
              WHEN participant_one_id = $2 THEN participant_two_id 
              ELSE participant_one_id 
            END FROM public.direct_conversations WHERE id = $1
          ), $3, $4)
          RETURNING *;
        `, [conversation_id, reporter_id, reportContent, JSON.stringify(metadata)]);
        chatMsg = msgRes.rows[0];
      } else if (channel) {
        const repRes = await client.query(`SELECT full_name, email, role FROM public.profiles WHERE id = $1;`, [reporter_id]);
        const rep = repRes.rows[0] || {};
        const msgRes = await client.query(`
          INSERT INTO public.messages (
            sender_id, sender_name, sender_email, sender_role, content, channel, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *;
        `, [
          reporter_id,
          rep.full_name || 'Team Member',
          rep.email || '',
          rep.role || 'MEMBER',
          reportContent,
          channel,
          JSON.stringify(metadata)
        ]);
        chatMsg = msgRes.rows[0];
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      report,
      message: chatMsg
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 9. Get Reports for Task
router.get('/tasks/:taskId/reports', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const reportsRes = await query(`
      SELECT r.*,
        pr.full_name as reporter_name,
        pr.email as reporter_email,
        pr.avatar_url as reporter_avatar_url,
        pr.role as reporter_role
      FROM public.task_progress_reports r
      LEFT JOIN public.profiles pr ON r.reporter_id = pr.id
      WHERE r.task_id = $1
      ORDER BY r.created_at DESC;
    `, [taskId]);

    return res.status(200).json({ success: true, reports: reportsRes.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TASK TRANSFER REQUEST SYSTEM (CORE FEATURE)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 10. Start / Submit Task Transfer Request
router.post('/transfers', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      task_id,
      from_user_id,
      to_user_id,
      reason,
      work_completed = '',
      remaining_work = '',
      blockers = '',
      handover_notes = '',
      suggested_next_steps = '',
      channel = null,
      conversation_id = null
    } = req.body;

    if (!task_id) return res.status(400).json({ success: false, error: 'Task ID is required' });
    if (!from_user_id || !to_user_id) return res.status(400).json({ success: false, error: 'Sender and recipient IDs are required' });
    if (from_user_id === to_user_id) {
      return res.status(400).json({ success: false, error: 'Cannot transfer task to yourself' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'A meaningful transfer reason is required.' });
    }

    await client.query('BEGIN');

    // 1. Verify task exists & current assignee
    const taskRes = await client.query(`
      SELECT t.*, pr.full_name as assignee_name
      FROM public.tasks t
      LEFT JOIN public.profiles pr ON t.assigned_to = pr.id
      WHERE t.id = $1 FOR UPDATE;
    `, [task_id]);

    if (!taskRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = taskRes.rows[0];

    // Cannot transfer completed or cancelled tasks
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Cannot transfer a task that is already ${task.status.toLowerCase()}.` });
    }

    // Sender must be current assignee or admin/founder
    const userRoleRes = await client.query(`SELECT role, full_name, email FROM public.profiles WHERE id = $1;`, [from_user_id]);
    const sender = userRoleRes.rows[0] || {};
    const isAssignee = task.assigned_to === from_user_id;
    const isPrivileged = ['FOUNDER', 'ADMIN'].includes(sender.role);

    if (!isAssignee && !isPrivileged) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Only the current assignee or an administrator can request a task transfer.' });
    }

    // 2. Prevent duplicate pending transfers for this task
    const activeTransferRes = await client.query(`
      SELECT id FROM public.task_transfers
      WHERE task_id = $1 AND status = 'PENDING';
    `, [task_id]);

    if (activeTransferRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'A transfer request is already pending for this task.' });
    }

    // 3. Insert transfer record with status 'PENDING' (TASK OWNERSHIP REMAINS UNCHANGED)
    const transferRes = await client.query(`
      INSERT INTO public.task_transfers (
        task_id, from_user_id, to_user_id, reason, status,
        work_completed, remaining_work, blockers, handover_notes, suggested_next_steps,
        channel, conversation_id
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `, [
      task_id,
      from_user_id,
      to_user_id,
      reason.trim(),
      work_completed || '',
      remaining_work || '',
      blockers || '',
      handover_notes || '',
      suggested_next_steps || '',
      channel || null,
      conversation_id || null
    ]);

    const transfer = transferRes.rows[0];

    // 4. Record in audit history
    await client.query(`
      INSERT INTO public.task_transfer_history (
        task_id, transfer_id, from_user_id, to_user_id, action, reason, notes, performed_by
      ) VALUES ($1, $2, $3, $4, 'REQUESTED', $5, $6, $7);
    `, [task_id, transfer.id, from_user_id, to_user_id, reason.trim(), handover_notes || '', from_user_id]);

    // 5. Create notification for recipient
    await client.query(`
      INSERT INTO public.collaboration_notifications (
        recipient_id, sender_id, type, title, message, reference_id, metadata
      ) VALUES ($1, $2, 'TASK_TRANSFER_REQUEST', $3, $4, $5, $6);
    `, [
      to_user_id,
      from_user_id,
      'Task Transfer Request',
      `${sender.full_name || 'A team member'} requested you to take over "${task.title}".`,
      transfer.id,
      JSON.stringify({ taskId: task.id, taskTitle: task.title, transferId: transfer.id })
    ]);

    // 6. Post Transfer Request Card into chat
    let chatMsg = null;
    const cardContent = `🔄 **Task Transfer Request:** "${task.title}"\n**From:** ${sender.full_name || 'Member'}\n**Reason:** ${reason.trim()}\n*Awaiting recipient decision.*`;
    const metadata = {
      type: 'task_transfer_card',
      transferId: transfer.id,
      taskId: task.id,
      taskTitle: task.title,
      fromUserId: from_user_id,
      toUserId: to_user_id,
      status: 'PENDING',
      reason: reason.trim()
    };

    if (conversation_id) {
      const msgRes = await client.query(`
        INSERT INTO public.direct_messages (
          conversation_id, sender_id, recipient_id, content, metadata
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `, [conversation_id, from_user_id, to_user_id, cardContent, JSON.stringify(metadata)]);
      chatMsg = msgRes.rows[0];
    } else if (channel) {
      const msgRes = await client.query(`
        INSERT INTO public.messages (
          sender_id, sender_name, sender_email, sender_role, content, channel, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [
        from_user_id,
        sender.full_name || 'Team Member',
        sender.email || '',
        sender.role || 'MEMBER',
        cardContent,
        channel,
        JSON.stringify(metadata)
      ]);
      chatMsg = msgRes.rows[0];
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      transfer,
      message: chatMsg
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 11. Recipient Accepts Transfer (Atomic Ownership Handoff)
router.post('/transfers/:id/accept', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) return res.status(400).json({ success: false, error: 'User ID is required' });

    await client.query('BEGIN');

    // 1. Lock transfer row
    const transferRes = await client.query(`
      SELECT tt.*, t.title as task_title, t.status as task_status
      FROM public.task_transfers tt
      JOIN public.tasks t ON tt.task_id = t.id
      WHERE tt.id = $1 FOR UPDATE;
    `, [id]);

    if (!transferRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Transfer request not found' });
    }

    const transfer = transferRes.rows[0];

    if (transfer.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Transfer request is no longer pending (current state: ${transfer.status}).` });
    }

    // Only intended recipient (or admin override) can accept
    const userRoleRes = await client.query(`SELECT role, full_name FROM public.profiles WHERE id = $1;`, [user_id]);
    const user = userRoleRes.rows[0] || {};
    const isRecipient = transfer.to_user_id === user_id;
    const isPrivileged = ['FOUNDER', 'ADMIN'].includes(user.role);

    if (!isRecipient && !isPrivileged) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Only the designated recipient can accept this transfer.' });
    }

    // 2. Perform Atomic Reassignment
    await client.query(`
      UPDATE public.tasks 
      SET assigned_to = $1, updated_at = now()
      WHERE id = $2;
    `, [transfer.to_user_id, transfer.task_id]);

    // 3. Update Transfer Request status to ACCEPTED
    const updatedTransferRes = await client.query(`
      UPDATE public.task_transfers
      SET status = 'ACCEPTED', resolved_at = now()
      WHERE id = $1
      RETURNING *;
    `, [id]);

    // 4. Record in Audit History
    await client.query(`
      INSERT INTO public.task_transfer_history (
        task_id, transfer_id, from_user_id, to_user_id, action, reason, notes, performed_by
      ) VALUES ($1, $2, $3, $4, 'ACCEPTED', $5, 'Transfer accepted by recipient', $6);
    `, [transfer.task_id, id, transfer.from_user_id, transfer.to_user_id, transfer.reason, user_id]);

    // 5. Notify original requester
    await client.query(`
      INSERT INTO public.collaboration_notifications (
        recipient_id, sender_id, type, title, message, reference_id, metadata
      ) VALUES ($1, $2, 'TASK_TRANSFER_ACCEPTED', $3, $4, $5, $6);
    `, [
      transfer.from_user_id,
      user_id,
      'Transfer Accepted',
      `${user.full_name || 'Team Member'} accepted the transfer of "${transfer.task_title}".`,
      transfer.id,
      JSON.stringify({ taskId: transfer.task_id, transferId: transfer.id })
    ]);

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      transfer: updatedTransferRes.rows[0],
      message: 'Task transferred successfully!'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 12. Recipient Rejects Transfer
router.post('/transfers/:id/reject', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { user_id, rejection_reason = '' } = req.body;

    if (!user_id) return res.status(400).json({ success: false, error: 'User ID is required' });

    await client.query('BEGIN');

    const transferRes = await client.query(`
      SELECT tt.*, t.title as task_title
      FROM public.task_transfers tt
      JOIN public.tasks t ON tt.task_id = t.id
      WHERE tt.id = $1 FOR UPDATE;
    `, [id]);

    if (!transferRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Transfer request not found' });
    }

    const transfer = transferRes.rows[0];

    if (transfer.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Transfer request is no longer pending (current state: ${transfer.status}).` });
    }

    const userRoleRes = await client.query(`SELECT role, full_name FROM public.profiles WHERE id = $1;`, [user_id]);
    const user = userRoleRes.rows[0] || {};
    const isRecipient = transfer.to_user_id === user_id;
    const isPrivileged = ['FOUNDER', 'ADMIN'].includes(user.role);

    if (!isRecipient && !isPrivileged) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Only the designated recipient can reject this transfer.' });
    }

    // Update status to REJECTED (original assignee remains responsible)
    const updatedTransfer = await client.query(`
      UPDATE public.task_transfers
      SET status = 'REJECTED', rejection_reason = $1, resolved_at = now()
      WHERE id = $2
      RETURNING *;
    `, [rejection_reason ? rejection_reason.trim() : null, id]);

    // Record audit event
    await client.query(`
      INSERT INTO public.task_transfer_history (
        task_id, transfer_id, from_user_id, to_user_id, action, reason, notes, performed_by
      ) VALUES ($1, $2, $3, $4, 'REJECTED', $5, $6, $7);
    `, [transfer.task_id, id, transfer.from_user_id, transfer.to_user_id, transfer.reason, rejection_reason || '', user_id]);

    // Notify requester
    await client.query(`
      INSERT INTO public.collaboration_notifications (
        recipient_id, sender_id, type, title, message, reference_id, metadata
      ) VALUES ($1, $2, 'TASK_TRANSFER_REJECTED', $3, $4, $5, $6);
    `, [
      transfer.from_user_id,
      user_id,
      'Transfer Rejected',
      `${user.full_name || 'Team Member'} declined the transfer of "${transfer.task_title}".`,
      transfer.id,
      JSON.stringify({ taskId: transfer.task_id, transferId: transfer.id, rejectionReason: rejection_reason })
    ]);

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      transfer: updatedTransfer.rows[0],
      message: 'Transfer request rejected.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 13. Cancel Transfer Request (By Sender or Admin)
router.post('/transfers/:id/cancel', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    await client.query('BEGIN');

    const transferRes = await client.query(`
      SELECT tt.*, t.title as task_title
      FROM public.task_transfers tt
      JOIN public.tasks t ON tt.task_id = t.id
      WHERE tt.id = $1 FOR UPDATE;
    `, [id]);

    if (!transferRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Transfer request not found' });
    }

    const transfer = transferRes.rows[0];

    if (transfer.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Only pending transfer requests can be cancelled.' });
    }

    const userRoleRes = await client.query(`SELECT role, full_name FROM public.profiles WHERE id = $1;`, [user_id]);
    const user = userRoleRes.rows[0] || {};
    const isSender = transfer.from_user_id === user_id;
    const isPrivileged = ['FOUNDER', 'ADMIN'].includes(user.role);

    if (!isSender && !isPrivileged) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Only the original requester or an administrator can cancel this transfer.' });
    }

    const updated = await client.query(`
      UPDATE public.task_transfers
      SET status = 'CANCELLED', resolved_at = now()
      WHERE id = $1
      RETURNING *;
    `, [id]);

    // Record audit event
    await client.query(`
      INSERT INTO public.task_transfer_history (
        task_id, transfer_id, from_user_id, to_user_id, action, reason, notes, performed_by
      ) VALUES ($1, $2, $3, $4, 'CANCELLED', $5, 'Transfer cancelled by requester', $6);
    `, [transfer.task_id, id, transfer.from_user_id, transfer.to_user_id, transfer.reason, user_id]);

    await client.query('COMMIT');
    return res.status(200).json({ success: true, transfer: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// 14. Get Transfer History & Status for a Task
router.get('/tasks/:taskId/transfers', async (req, res, next) => {
  try {
    const { taskId } = req.params;

    // Active pending transfer if any
    const activeRes = await query(`
      SELECT tt.*,
        p_from.full_name as from_user_name,
        p_from.avatar_url as from_user_avatar,
        p_to.full_name as to_user_name,
        p_to.avatar_url as to_user_avatar
      FROM public.task_transfers tt
      LEFT JOIN public.profiles p_from ON tt.from_user_id = p_from.id
      LEFT JOIN public.profiles p_to ON tt.to_user_id = p_to.id
      WHERE tt.task_id = $1 AND tt.status = 'PENDING'
      ORDER BY tt.created_at DESC
      LIMIT 1;
    `, [taskId]);

    // Historical audit trail
    const historyRes = await query(`
      SELECT th.*,
        p_from.full_name as from_user_name,
        p_to.full_name as to_user_name,
        p_by.full_name as performed_by_name
      FROM public.task_transfer_history th
      LEFT JOIN public.profiles p_from ON th.from_user_id = p_from.id
      LEFT JOIN public.profiles p_to ON th.to_user_id = p_to.id
      LEFT JOIN public.profiles p_by ON th.performed_by = p_by.id
      WHERE th.task_id = $1
      ORDER BY th.created_at ASC;
    `, [taskId]);

    return res.status(200).json({
      success: true,
      pendingTransfer: activeRes.rows[0] || null,
      history: historyRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// 15. Get Pending Notifications for User
router.get('/notifications', async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });

    const notifRes = await query(`
      SELECT cn.*,
        pr.full_name as sender_name,
        pr.avatar_url as sender_avatar
      FROM public.collaboration_notifications cn
      LEFT JOIN public.profiles pr ON cn.sender_id = pr.id
      WHERE cn.recipient_id = $1
      ORDER BY cn.created_at DESC
      LIMIT 50;
    `, [userId]);

    return res.status(200).json({ success: true, notifications: notifRes.rows });
  } catch (err) {
    next(err);
  }
});

// 16. Mark Notification as Read
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    await query(`
      UPDATE public.collaboration_notifications
      SET is_read = true
      WHERE id = $1;
    `, [id]);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
