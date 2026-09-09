// Verification of POST https://teamsync-fawn.vercel.app/api/v1/tickets
const BASE_URL = 'https://teamsync-fawn.vercel.app';
const VALID_KEY = 'ts_live_kalvilearn_sec_99a8b1c4e2d3f7';
const INVALID_KEY = 'invalid_key_forged_12345';

async function verifyLiveApi() {
  console.log('========================================================================');
  console.log('🔍 VERIFYING LIVE API ENDPOINT ON DEPLOYED TEAMSYNC');
  console.log('========================================================================');
  console.log('Target:', `${BASE_URL}/api/v1/tickets`);

  const uniqueId = Date.now();
  const testRef = `VERIFY-${uniqueId}`;

  // 1. Missing API Key -> 401
  const resMissing = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test' })
  });
  console.log(`1. Missing API Key: HTTP ${resMissing.status} (Expected 401)`, resMissing.status === 401 ? '✅ PASS' : '❌ FAIL');

  // 2. Invalid API Key -> 401
  const resInvalid = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INVALID_KEY}`
    },
    body: JSON.stringify({ title: 'Test' })
  });
  console.log(`2. Invalid API Key: HTTP ${resInvalid.status} (Expected 401)`, resInvalid.status === 401 ? '✅ PASS' : '❌ FAIL');

  // 3. Invalid Payload (missing description & invalid priority) -> 400
  const resBadPayload = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`
    },
    body: JSON.stringify({
      source: 'KALVILEARN',
      title: 'Missing description',
      priority: 'NON_EXISTENT_PRIORITY'
    })
  });
  console.log(`3. Invalid Payload: HTTP ${resBadPayload.status} (Expected 400)`, resBadPayload.status === 400 ? '✅ PASS' : '❌ FAIL');

  // 4. Valid API Key -> 201 Ticket Created
  const validPayload = {
    source: 'KALVILEARN',
    sourceReferenceId: testRef,
    type: 'BUG',
    title: 'Live Endpoint Verification',
    description: 'Testing live contract compliance and response structure.',
    priority: 'HIGH',
    portal: 'student',
    user: {
      id: 'usr_ver_1',
      name: 'Verification Bot',
      email: 'bot@kalvilearn.edu',
      role: 'STUDENT'
    }
  };

  const resValid = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`,
      'Idempotency-Key': `IDEM-${uniqueId}`
    },
    body: JSON.stringify(validPayload)
  });
  const dataValid = await resValid.json();
  console.log(`4. Valid API Key: HTTP ${resValid.status} (Expected 201)`, resValid.status === 201 ? '✅ PASS' : '❌ FAIL');
  console.log('   Ticket Created:', { id: dataValid.id, ticketNumber: dataValid.ticketNumber });

  // 5. Duplicate Idempotency-Key -> 200 with same ticket
  const resDuplicateIdem = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`,
      'Idempotency-Key': `IDEM-${uniqueId}`
    },
    body: JSON.stringify({
      ...validPayload,
      sourceReferenceId: `DIFFERENT-REF-${Date.now()}`
    })
  });
  const dataDuplicateIdem = await resDuplicateIdem.json();
  const isSameIdem = dataDuplicateIdem.ticketNumber === dataValid.ticketNumber;
  console.log(`5. Duplicate Idempotency-Key: HTTP ${resDuplicateIdem.status} (Expected 200), same ticket: ${isSameIdem}`, (resDuplicateIdem.status === 200 && isSameIdem) ? '✅ PASS' : '❌ FAIL');

  // 6. Duplicate sourceReferenceId -> 200 with same ticket
  const resDuplicateRef = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_KEY}`,
      'Idempotency-Key': `NEW-IDEM-${Date.now()}`
    },
    body: JSON.stringify(validPayload)
  });
  const dataDuplicateRef = await resDuplicateRef.json();
  const isSameRef = dataDuplicateRef.ticketNumber === dataValid.ticketNumber;
  console.log(`6. Duplicate sourceReferenceId: HTTP ${resDuplicateRef.status} (Expected 200), same ticket: ${isSameRef}`, (resDuplicateRef.status === 200 && isSameRef) ? '✅ PASS' : '❌ FAIL');

  console.log('========================================================================\n');
}

verifyLiveApi().catch(console.error);
