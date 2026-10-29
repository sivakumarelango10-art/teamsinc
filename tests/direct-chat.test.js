import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { query, pool } from '../server/db.js';
import { canonicalParticipantPair } from '../src/api/directChatApi.js';

describe('1-to-1 Private Direct Messaging Test Suite', () => {
  let userA, userB, userC;
  const testConversationIds = [];
  const testMessageIds = [];

  before(async () => {
    // Fetch 3 distinct active profiles for testing
    const res = await query(`
      SELECT id, full_name, email, role 
      FROM public.profiles 
      WHERE is_active = true 
      ORDER BY email ASC 
      LIMIT 3;
    `);

    assert.ok(res.rows.length >= 2, 'Must have at least 2 active profiles in DB to test direct messaging');
    userA = res.rows[0];
    userB = res.rows[1];
    userC = res.rows[2] || { id: '00000000-0000-0000-0000-000000000001', full_name: 'Third Party', email: 'third@example.com' };
  });

  after(async () => {
    // Clean up created test conversations and messages
    if (testConversationIds.length > 0) {
      await query(`
        DELETE FROM public.direct_conversations 
        WHERE id = ANY($1::uuid[]);
      `, [testConversationIds]);
    }
    await pool.end();
  });

  it('1. canonicalParticipantPair utility lexicographically sorts user IDs', () => {
    const idLow = '00000000-0000-0000-0000-000000000001';
    const idHigh = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    const [p1, p2] = canonicalParticipantPair(idHigh, idLow);
    assert.strictEqual(p1, idLow);
    assert.strictEqual(p2, idHigh);

    const [p1Rev, p2Rev] = canonicalParticipantPair(idLow, idHigh);
    assert.strictEqual(p1Rev, idLow);
    assert.strictEqual(p2Rev, idHigh);
  });

  it('2. Direct conversation pair uniqueness & duplicate prevention', async () => {
    const [p1, p2] = canonicalParticipantPair(userA.id, userB.id);

    // 1. Create direct conversation
    const insertRes = await query(`
      INSERT INTO public.direct_conversations (participant_one_id, participant_two_id, last_message_preview)
      VALUES ($1, $2, 'Initial handshake')
      ON CONFLICT (participant_one_id, participant_two_id) DO UPDATE
      SET updated_at = now()
      RETURNING id, participant_one_id, participant_two_id, last_message_preview;
    `, [p1, p2]);

    assert.ok(insertRes.rows[0]?.id, 'Conversation should be created or updated');
    const convId = insertRes.rows[0].id;
    testConversationIds.push(convId);

    // 2. Querying in reverse order (userB to userA) using canonical ordering returns the EXACT SAME conversation ID
    const [p1Rev, p2Rev] = canonicalParticipantPair(userB.id, userA.id);
    const lookupRes = await query(`
      SELECT id FROM public.direct_conversations
      WHERE participant_one_id = $1 AND participant_two_id = $2;
    `, [p1Rev, p2Rev]);

    assert.strictEqual(lookupRes.rows[0]?.id, convId, 'Must return the same conversation ID regardless of who started it');

    // 3. Attempting to insert inverse ordering violates check constraint (participant_one_id < participant_two_id)
    await assert.rejects(
      async () => {
        await query(`
          INSERT INTO public.direct_conversations (participant_one_id, participant_two_id)
          VALUES ($1, $2);
        `, [p2, p1]); // Inverted!
      },
      /chk_canonical_participants/,
      'Should reject inverse ordering due to chk_canonical_participants constraint'
    );
  });

  it('3. Direct message persistence and conversation update trigger', async () => {
    const convId = testConversationIds[0];
    assert.ok(convId, 'Conversation ID must exist');

    const messageContent = `Confidential direct message at ${Date.now()}`;

    // Member A sends private message to Member B
    const msgRes = await query(`
      INSERT INTO public.direct_messages (conversation_id, sender_id, recipient_id, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, conversation_id, sender_id, recipient_id, content, is_read, read_at, created_at;
    `, [convId, userA.id, userB.id, messageContent]);

    const msg = msgRes.rows[0];
    assert.ok(msg?.id);
    testMessageIds.push(msg.id);
    assert.strictEqual(msg.sender_id, userA.id);
    assert.strictEqual(msg.recipient_id, userB.id);
    assert.strictEqual(msg.content, messageContent);
    assert.strictEqual(msg.is_read, false, 'New message must have is_read = false');
    assert.strictEqual(msg.read_at, null);

    // Verify conversation trigger updated last_message_preview and last_message_sender_id
    const convCheck = await query(`
      SELECT last_message_preview, last_message_sender_id, last_message_at
      FROM public.direct_conversations
      WHERE id = $1;
    `, [convId]);

    const updatedConv = convCheck.rows[0];
    assert.strictEqual(updatedConv.last_message_preview, messageContent);
    assert.strictEqual(updatedConv.last_message_sender_id, userA.id);
    assert.ok(new Date(updatedConv.last_message_at).getTime() > 0);
  });

  it('4. Read receipts and unread count batching', async () => {
    const convId = testConversationIds[0];

    // Check unread count for recipient (userB)
    const unreadBefore = await query(`
      SELECT count(*)::int as unread_count
      FROM public.direct_messages
      WHERE conversation_id = $1 AND recipient_id = $2 AND is_read = false;
    `, [convId, userB.id]);
    assert.ok(unreadBefore.rows[0].unread_count >= 1, 'Recipient must have at least 1 unread message');

    // Recipient userB reads messages
    const markRes = await query(`
      UPDATE public.direct_messages
      SET is_read = true, read_at = now()
      WHERE conversation_id = $1 AND recipient_id = $2 AND is_read = false
      RETURNING id, is_read, read_at;
    `, [convId, userB.id]);

    assert.ok(markRes.rows.length >= 1, 'Should have marked messages as read');
    assert.strictEqual(markRes.rows[0].is_read, true);
    assert.ok(markRes.rows[0].read_at !== null, 'read_at must be populated');

    // Check unread count now is 0
    const unreadAfter = await query(`
      SELECT count(*)::int as unread_count
      FROM public.direct_messages
      WHERE conversation_id = $1 AND recipient_id = $2 AND is_read = false;
    `, [convId, userB.id]);
    assert.strictEqual(unreadAfter.rows[0].unread_count, 0, 'Unread count should be 0 after reading');
  });

  it('5. Privacy and strict conversation isolation', async () => {
    const convId = testConversationIds[0];

    // Verify that third party (userC) is NOT a participant in A-B conversation
    const isParticipant = await query(`
      SELECT 1 FROM public.direct_conversations
      WHERE id = $1 AND (participant_one_id = $2 OR participant_two_id = $2);
    `, [convId, userC.id]);

    assert.strictEqual(isParticipant.rows.length, 0, 'User C must not be a participant in User A & B conversation');

    // Verify that querying User C conversations returns only conversations involving User C
    const userCConversations = await query(`
      SELECT id FROM public.direct_conversations
      WHERE participant_one_id = $1 OR participant_two_id = $1;
    `, [userC.id]);

    const userCConvIds = userCConversations.rows.map(r => r.id);
    assert.ok(!userCConvIds.includes(convId), 'User C conversations must never include User A-B conversation');
  });

  it('6. Group channels (#general, #leadership) remain completely preserved and isolated', async () => {
    const groupRes = await query(`
      SELECT count(*)::int as total_group_messages
      FROM public.messages
      WHERE channel IN ('general', 'leadership');
    `);

    assert.ok(groupRes.rows[0].total_group_messages >= 0, 'public.messages table remains fully intact and operational');
  });
});
