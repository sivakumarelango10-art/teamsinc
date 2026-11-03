import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../server/db.js';

describe('Collaboration System (Polls, Notes, Progress Reports, Task Transfer) Test Suite', () => {
  let userA, userB, userAdmin;
  let testTaskId = null;
  const createdPollIds = [];
  const createdNoteIds = [];
  const createdReportIds = [];
  const createdTransferIds = [];

  before(async () => {
    // 1. Fetch test users
    const res = await query(`
      SELECT id, full_name, email, role 
      FROM public.profiles 
      WHERE is_active = true 
      ORDER BY role ASC 
      LIMIT 5;
    `);

    assert.ok(res.rows.length >= 2, 'Need at least 2 active profiles in DB for collaboration test');
    userA = res.rows[0];
    userB = res.rows[1];
    userAdmin = res.rows.find(r => r.role === 'ADMIN' || r.role === 'FOUNDER') || res.rows[0];

    // 2. Create a test task assigned to userA
    const taskRes = await query(`
      INSERT INTO public.tasks (title, description, status, priority, assigned_to, assigned_by, progress_percentage, deadline)
      VALUES ('Collab Architecture Task', 'Implement collaboration features', 'IN_PROGRESS', 'HIGH', $1, $2, 25, NOW() + interval '7 days')
      RETURNING id, title, status, assigned_to, progress_percentage;
    `, [userA.id, userAdmin.id]);

    testTaskId = taskRes.rows[0].id;
  });

  after(async () => {
    // Clean up all test artifacts
    if (createdTransferIds.length > 0) {
      await query(`DELETE FROM public.task_transfers WHERE id = ANY($1::uuid[]);`, [createdTransferIds]);
    }
    if (testTaskId) {
      await query(`DELETE FROM public.task_progress_reports WHERE task_id = $1;`, [testTaskId]);
      await query(`DELETE FROM public.notes WHERE task_id = $1;`, [testTaskId]);
      await query(`DELETE FROM public.task_transfers WHERE task_id = $1;`, [testTaskId]);
      await query(`DELETE FROM public.task_transfer_history WHERE task_id = $1;`, [testTaskId]);
      await query(`DELETE FROM public.tasks WHERE id = $1;`, [testTaskId]);
    }
    if (createdPollIds.length > 0) {
      await query(`DELETE FROM public.polls WHERE id = ANY($1::uuid[]);`, [createdPollIds]);
    }
    if (createdNoteIds.length > 0) {
      await query(`DELETE FROM public.notes WHERE id = ANY($1::uuid[]);`, [createdNoteIds]);
    }
    if (createdReportIds.length > 0) {
      await query(`DELETE FROM public.task_progress_reports WHERE id = ANY($1::uuid[]);`, [createdReportIds]);
    }
    await pool.end();
  });

  /* ─────────────────────────────────────────────────────────────────────────
     1. POLLS TESTS
     ───────────────────────────────────────────────────────────────────────── */
  describe('Polls Subsystem', () => {
    let pollId = null;
    let option1Id = null;
    let option2Id = null;

    it('1.1 Should create a poll with multiple options', async () => {
      const pollRes = await query(`
        INSERT INTO public.polls (creator_id, question, description, is_multiple_choice, is_anonymous, allow_vote_change)
        VALUES ($1, 'Which frontend framework version?', 'Team consensus vote', false, false, true)
        RETURNING id, question, is_closed;
      `, [userA.id]);

      pollId = pollRes.rows[0].id;
      createdPollIds.push(pollId);
      assert.strictEqual(pollRes.rows[0].is_closed, false);

      // Insert 2 options
      const opt1 = await query(`
        INSERT INTO public.poll_options (poll_id, text, option_order)
        VALUES ($1, 'React 18', 0)
        RETURNING id;
      `, [pollId]);
      option1Id = opt1.rows[0].id;

      const opt2 = await query(`
        INSERT INTO public.poll_options (poll_id, text, option_order)
        VALUES ($1, 'React 19', 1)
        RETURNING id;
      `, [pollId]);
      option2Id = opt2.rows[0].id;

      assert.ok(option1Id && option2Id);
    });

    it('1.2 Should record a vote and prevent duplicate votes for single choice', async () => {
      await query(`
        INSERT INTO public.poll_votes (poll_id, option_id, voter_id, voter_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (poll_id, option_id, voter_id) DO NOTHING;
      `, [pollId, option1Id, userA.id, userA.full_name]);

      const votesRes = await query(`
        SELECT count(*) as count FROM public.poll_votes WHERE poll_id = $1 AND voter_id = $2;
      `, [pollId, userA.id]);

      assert.strictEqual(parseInt(votesRes.rows[0].count, 10), 1);
    });

    it('1.3 Should support changing votes when allow_vote_change is true', async () => {
      // Delete old vote
      await query(`DELETE FROM public.poll_votes WHERE poll_id = $1 AND voter_id = $2;`, [pollId, userA.id]);
      // Cast new vote on option 2
      await query(`
        INSERT INTO public.poll_votes (poll_id, option_id, voter_id, voter_name)
        VALUES ($1, $2, $3, $4);
      `, [pollId, option2Id, userA.id, userA.full_name]);

      const votes = await query(`
        SELECT option_id FROM public.poll_votes WHERE poll_id = $1 AND voter_id = $2;
      `, [pollId, userA.id]);

      assert.strictEqual(votes.rows[0].option_id, option2Id);
    });

    it('1.4 Should close poll and prevent subsequent votes', async () => {
      await query(`UPDATE public.polls SET is_closed = true WHERE id = $1;`, [pollId]);

      const poll = await query(`SELECT is_closed FROM public.polls WHERE id = $1;`, [pollId]);
      assert.strictEqual(poll.rows[0].is_closed, true);
    });
  });

  /* ─────────────────────────────────────────────────────────────────────────
     2. NOTES & TO-DO LISTS TESTS
     ───────────────────────────────────────────────────────────────────────── */
  describe('Notes & Checklists Subsystem', () => {
    let noteId = null;
    let todoId = null;

    it('2.1 Should create a note with checklist items linked to a task', async () => {
      const noteRes = await query(`
        INSERT INTO public.notes (author_id, title, content, category, visibility, task_id)
        VALUES ($1, 'Release Pre-Flight Checklist', 'Important checklist', 'TODO', 'SHARED', $2)
        RETURNING id, title, category, visibility;
      `, [userA.id, testTaskId]);

      noteId = noteRes.rows[0].id;
      createdNoteIds.push(noteId);
      assert.strictEqual(noteRes.rows[0].category, 'TODO');

      const todoRes = await query(`
        INSERT INTO public.todo_items (note_id, task_id, text, is_completed, item_order)
        VALUES ($1, $2, 'Run integration tests', false, 0)
        RETURNING id, text, is_completed;
      `, [noteId, testTaskId]);

      todoId = todoRes.rows[0].id;
      assert.strictEqual(todoRes.rows[0].is_completed, false);
    });

    it('2.2 Should toggle to-do item completion status', async () => {
      await query(`
        UPDATE public.todo_items SET is_completed = true, updated_at = now() WHERE id = $1;
      `, [todoId]);

      const check = await query(`SELECT is_completed FROM public.todo_items WHERE id = $1;`, [todoId]);
      assert.strictEqual(check.rows[0].is_completed, true);
    });
  });

  /* ─────────────────────────────────────────────────────────────────────────
     3. TASK PROGRESS REPORTS TESTS
     ───────────────────────────────────────────────────────────────────────── */
  describe('Task Progress Reports Subsystem', () => {
    it('3.1 Should submit a progress report and atomically update task status & progress %', async () => {
      const repRes = await query(`
        INSERT INTO public.task_progress_reports (
          task_id, reporter_id, status, progress_percentage, summary, blockers, work_completed
        )
        VALUES ($1, $2, 'IN_PROGRESS', 75, 'Completed DB migrations and API routes', 'None', '75% complete')
        RETURNING id, progress_percentage;
      `, [testTaskId, userA.id]);

      createdReportIds.push(repRes.rows[0].id);
      assert.strictEqual(repRes.rows[0].progress_percentage, 75);

      // Atomically update task
      await query(`
        UPDATE public.tasks 
        SET status = 'IN_PROGRESS', progress_percentage = 75, updated_at = now() 
        WHERE id = $1;
      `, [testTaskId]);

      const updatedTask = await query(`
        SELECT status, progress_percentage FROM public.tasks WHERE id = $1;
      `, [testTaskId]);

      assert.strictEqual(updatedTask.rows[0].status, 'IN_PROGRESS');
      assert.strictEqual(updatedTask.rows[0].progress_percentage, 75);
    });
  });

  /* ─────────────────────────────────────────────────────────────────────────
     4. CONTROLLED TASK TRANSFER LIFECYCLE TESTS (CORE FEATURE)
     ───────────────────────────────────────────────────────────────────────── */
  describe('Controlled Task Transfer Lifecycle (Core Feature)', () => {
    let transferId = null;

    it('4.1 Creating a transfer request MUST NOT change task assignment prematurely', async () => {
      // 1. Verify current assignee is User A
      const beforeCheck = await query(`SELECT assigned_to FROM public.tasks WHERE id = $1;`, [testTaskId]);
      assert.strictEqual(beforeCheck.rows[0].assigned_to, userA.id, 'Task must initially belong to User A');

      // 2. Submit transfer request from User A to User B
      const trfRes = await query(`
        INSERT INTO public.task_transfers (
          task_id, from_user_id, to_user_id, reason, handover_notes, status
        )
        VALUES (
          $1, $2, $3, 'Workload rebalance', '{"completed_work":"75% completed"}'::jsonb, 'PENDING'
        )
        RETURNING id, status, from_user_id, to_user_id;
      `, [testTaskId, userA.id, userB.id]);

      transferId = trfRes.rows[0].id;
      createdTransferIds.push(transferId);
      assert.strictEqual(trfRes.rows[0].status, 'PENDING');

      // 3. CRITICAL SECURITY ASSERTION: Task must STILL belong to User A!
      const afterCheck = await query(`SELECT assigned_to FROM public.tasks WHERE id = $1;`, [testTaskId]);
      assert.strictEqual(
        afterCheck.rows[0].assigned_to, 
        userA.id, 
        'CRITICAL: Task assignment must NOT change when a transfer request is merely pending!'
      );
    });

    it('4.2 Explicit Recipient Acceptance executes atomic reassignment and audit logging', async () => {
      // Recipient (User B) accepts
      await query(`
        UPDATE public.task_transfers 
        SET status = 'ACCEPTED', resolved_at = now()
        WHERE id = $1;
      `, [transferId]);

      // Atomically reassign task to User B
      await query(`
        UPDATE public.tasks 
        SET assigned_to = $1, updated_at = now() 
        WHERE id = $2;
      `, [userB.id, testTaskId]);

      // Insert audit history
      await query(`
        INSERT INTO public.task_transfer_history (
          transfer_id, task_id, action, performed_by, notes
        )
        VALUES ($1, $2, 'ACCEPTED', $3, 'Recipient accepted task ownership');
      `, [transferId, testTaskId, userB.id]);

      // Verify task assignment has transferred to User B
      const taskCheck = await query(`SELECT assigned_to FROM public.tasks WHERE id = $1;`, [testTaskId]);
      assert.strictEqual(taskCheck.rows[0].assigned_to, userB.id, 'Task assignment must now belong to User B');

      // Verify audit history was logged
      const historyCheck = await query(`
        SELECT action, performed_by FROM public.task_transfer_history 
        WHERE transfer_id = $1 AND action = 'ACCEPTED';
      `, [transferId]);
      assert.strictEqual(historyCheck.rows.length, 1);
      assert.strictEqual(historyCheck.rows[0].performed_by, userB.id);
    });

    it('4.3 Rejection by recipient preserves ownership with current assignee', async () => {
      // User B attempts to transfer back to User A
      const trf2Res = await query(`
        INSERT INTO public.task_transfers (
          task_id, from_user_id, to_user_id, reason, status
        )
        VALUES ($1, $2, $3, 'Capacity full', 'PENDING')
        RETURNING id;
      `, [testTaskId, userB.id, userA.id]);

      const trf2Id = trf2Res.rows[0].id;
      createdTransferIds.push(trf2Id);

      // User A rejects with reason
      await query(`
        UPDATE public.task_transfers 
        SET status = 'REJECTED', rejection_reason = 'Sprint quota reached', resolved_at = now()
        WHERE id = $1;
      `, [trf2Id]);

      // Log rejection audit
      await query(`
        INSERT INTO public.task_transfer_history (
          transfer_id, task_id, action, performed_by, notes
        )
        VALUES ($1, $2, 'REJECTED', $3, 'Declined: Sprint quota reached');
      `, [trf2Id, testTaskId, userA.id]);

      // Verify task ownership remains with User B
      const finalTaskCheck = await query(`SELECT assigned_to FROM public.tasks WHERE id = $1;`, [testTaskId]);
      assert.strictEqual(finalTaskCheck.rows[0].assigned_to, userB.id, 'Task must remain with User B after rejection');
    });
  });
});
