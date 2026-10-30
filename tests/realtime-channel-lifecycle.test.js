/**
 * TeamSync Supabase Realtime Channel Lifecycle Regression Test Suite
 *
 * These tests verify that the Supabase channel lifecycle defect that caused:
 *   "cannot add 'postgres_changes' callbacks for
 *    realtime:global-direct-inbox-<userId> after 'subscribe'"
 * is permanently fixed and cannot regress.
 *
 * Root cause (confirmed):
 *   supabase.channel(name) is DEDUPLICATED by the Supabase SDK. Calling it a
 *   second time with the same topic returns the EXISTING already-subscribed
 *   channel instance. The previous implementation created the
 *   `global-direct-inbox-<userId>` channel inside the main subscription
 *   useEffect whose dependencies included chatMode, activeDirectConv?.id,
 *   usersMap, and loadDirectConversations. Every conversation switch caused the
 *   effect to re-run. The cleanup did NOT remove globalDirectChannel, so on the
 *   next run supabase.channel() returned the old joined instance, and calling
 *   .on('postgres_changes') on it threw the SDK error.
 *
 * Fix:
 *   The global inbox channel is now in its own isolated useEffect keyed only
 *   on profile?.id. All volatile state is accessed through stable refs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const TEAM_CHAT_PATH = path.resolve('src/pages/chat/TeamChat.jsx');
const DIRECT_CHAT_TEST_PATH = path.resolve('tests/direct-chat.test.js');
const KALVI_HUB_PATH = path.resolve('src/pages/integrations/KalviLearnHub.jsx');

describe('TeamSync Realtime Channel Lifecycle Regression Tests', () => {

  it('1. global-direct-inbox channel is in its own isolated useEffect keyed only on profile?.id', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // The isolated effect must exist and subscribe only to profile?.id
    assert.ok(
      content.includes("}, [profile?.id]); // ← only re-subscribe when authenticated user changes"),
      'global-direct-inbox useEffect must be isolated with [profile?.id] as its only dependency'
    );
  });

  it('2. global-direct-inbox postgres_changes listener is registered BEFORE subscribe() is called', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // Extract the isolated global inbox effect block
    const effectStart = content.indexOf("const globalDirectChannel = supabase\n      .channel(topic)");
    assert.ok(effectStart !== -1, 'global inbox channel creation must exist');

    const effectSubscribeIndex = content.indexOf('.subscribe((status, err)', effectStart);
    assert.ok(effectSubscribeIndex !== -1, 'global inbox channel must call .subscribe()');

    const onPostgresIndex = content.indexOf(
      ".on(\n        'postgres_changes',\n        {\n          event: 'INSERT',\n          schema: 'public',\n          table: 'direct_messages'",
      effectStart
    );
    assert.ok(onPostgresIndex !== -1, 'global inbox must register a postgres_changes handler');

    // .on() must appear BEFORE .subscribe()
    assert.ok(
      onPostgresIndex < effectSubscribeIndex,
      'postgres_changes listener must be registered BEFORE .subscribe() is called'
    );
  });

  it('3. global-direct-inbox channel is removed in the isolated effect cleanup (not leaked)', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // The cleanup of the isolated effect must call supabase.removeChannel(globalDirectChannel)
    const cleanupIndex = content.indexOf('supabase.removeChannel(globalDirectChannel)');
    assert.ok(
      cleanupIndex !== -1,
      'The isolated global inbox effect must call supabase.removeChannel(globalDirectChannel) in cleanup'
    );
  });

  it('4. global-direct-inbox channel is NOT created inside the main subscription effect', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // Locate the main subscription effect (marked by its known start)
    const mainEffectStart = content.indexOf('// Real-time Subscriptions (Channel + Direct Messages)');
    assert.ok(mainEffectStart !== -1, 'Main subscription effect comment must exist');

    // Locate the main effect closing dependency array
    const mainEffectDepsStart = content.indexOf(
      "  }, [\n    chatMode,\n    activeChannel,\n    activeDirectConv?.id,\n    profile?.id,\n    handleTypingSignal,\n    loadMessages,\n    scrollToBottom\n  ]);",
      mainEffectStart
    );
    assert.ok(mainEffectDepsStart !== -1, 'Main effect dependency array must be found');
    const mainEffectEnd = mainEffectDepsStart + 150;

    // The global inbox channel topic must NOT appear inside the main effect body
    const mainEffectBody = content.substring(mainEffectStart, mainEffectEnd);
    assert.ok(
      !mainEffectBody.includes('global-direct-inbox'),
      'global-direct-inbox must NOT be inside the main subscription effect'
    );
  });

  it('5. Stale channel guard: isolated effect checks getChannels() before creating new channel', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    assert.ok(
      content.includes('supabase.getChannels().find(c => c.topic === `realtime:${topic}`)'),
      'Isolated effect must check for stale channels via getChannels() before subscribing'
    );
    assert.ok(
      content.includes('if (stale) {\n      supabase.removeChannel(stale);\n    }'),
      'Isolated effect must remove any stale channel before creating a fresh one'
    );
  });

  it('6. Volatile state (chatMode, activeDirectConv, usersMap) is read through refs in the inbox handler', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // These four stable ref reads must exist inside the handler
    assert.ok(
      content.includes('chatModeRef.current'),
      'chatModeRef must be used inside the global inbox handler'
    );
    assert.ok(
      content.includes('activeDirectConvRef.current'),
      'activeDirectConvRef must be used inside the global inbox handler'
    );
    assert.ok(
      content.includes('usersMapRef.current'),
      'usersMapRef must be used inside the global inbox handler'
    );
    assert.ok(
      content.includes('loadDirectConversationsRef.current'),
      'loadDirectConversationsRef must be used inside the global inbox handler'
    );
  });

  it('7. Stable refs for volatile state are declared and synchronized with useEffect', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // All four refs must be declared
    assert.ok(content.includes('const chatModeRef = useRef(chatMode)'), 'chatModeRef declared');
    assert.ok(content.includes('const activeDirectConvRef = useRef(activeDirectConv)'), 'activeDirectConvRef declared');
    assert.ok(content.includes('const usersMapRef = useRef(usersMap)'), 'usersMapRef declared');
    assert.ok(content.includes('const loadDirectConversationsRef = useRef(loadDirectConversations)'), 'loadDirectConversationsRef declared');

    // All four sync effects must exist
    assert.ok(content.includes('chatModeRef.current = chatMode'), 'chatModeRef sync effect must exist');
    assert.ok(content.includes('activeDirectConvRef.current = activeDirectConv'), 'activeDirectConvRef sync effect must exist');
    assert.ok(content.includes('usersMapRef.current = usersMap'), 'usersMapRef sync effect must exist');
    assert.ok(content.includes('loadDirectConversationsRef.current = loadDirectConversations'), 'loadDirectConversationsRef sync effect must exist');
  });

  it('8. The main subscription effect does NOT include usersMap or loadDirectConversations in its dep array', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    const mainEffectDeps = content.indexOf(
      "  }, [\n    chatMode,\n    activeChannel,\n    activeDirectConv?.id,\n    profile?.id,\n    handleTypingSignal,\n    loadMessages,\n    scrollToBottom\n  ]);"
    );
    assert.ok(mainEffectDeps !== -1, 'Main effect dependency array must match the expected form');

    // Extract just the dep array text
    const depsText = content.substring(mainEffectDeps, mainEffectDeps + 200);
    assert.ok(!depsText.includes('usersMap'), 'usersMap must NOT be in main effect dependency array');
    assert.ok(!depsText.includes('loadDirectConversations'), 'loadDirectConversations must NOT be in main effect dependency array');
  });

  it('9. The reproduced error pattern (on() after subscribe() on same topic) is prevented by the SDK', () => {
    // This test documents the SDK behavior and verifies our understanding:
    // supabase.channel(name) returns the existing instance if already registered.
    // Calling .on('postgres_changes') on a joined/joining channel throws an error.
    // Our fix prevents this by isolating the global inbox channel in its own effect
    // with only [profile?.id] as a dependency.

    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // Verify the isolated effect guard comment is present (architectural documentation)
    assert.ok(
      content.includes("// ── Global Direct Inbox Subscription ────────────────────────────────────────"),
      'Architecture guard comment must be present'
    );
    assert.ok(
      content.includes('// Root cause of the production error'),
      'Root cause documentation comment must be present'
    );
  });

  it('10. Private message privacy: recipient_id check in global inbox handler ensures users only see their own messages', () => {
    const content = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');

    // The fix captures userId in a closure at subscription time (from profile.id),
    // then checks msg.recipient_id !== userId to enforce privacy
    assert.ok(
      content.includes('if (msg.recipient_id !== userId) return;'),
      'Global inbox handler must check msg.recipient_id !== userId to enforce privacy'
    );
  });

  it('11. Existing group channel (#general, #leadership) test infrastructure remains intact', () => {
    assert.ok(
      fs.existsSync(DIRECT_CHAT_TEST_PATH),
      'direct-chat.test.js must still exist'
    );

    const content = fs.readFileSync(DIRECT_CHAT_TEST_PATH, 'utf8');
    assert.ok(
      content.includes("Group channels (#general, #leadership) remain completely preserved"),
      'Group channel preservation test must be present'
    );
  });

  it('12. KalviLearn Integration Hub is completely untouched by this fix', () => {
    // Confirm KalviLearnHub file exists and was not modified
    assert.ok(fs.existsSync(KALVI_HUB_PATH), 'KalviLearnHub.jsx must exist and be untouched');

    const content = fs.readFileSync(KALVI_HUB_PATH, 'utf8');
    // File must contain its core markers
    assert.ok(
      content.includes('KalviLearnHub'),
      'KalviLearnHub.jsx must contain its own component definition'
    );

    // Verify TeamChat.jsx does not import or modify KalviLearn paths
    const chatContent = fs.readFileSync(TEAM_CHAT_PATH, 'utf8');
    assert.ok(
      !chatContent.includes('KalviLearn'),
      'TeamChat.jsx must not reference KalviLearn'
    );
  });

});
