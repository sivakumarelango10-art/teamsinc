# TeamSync API: KalviLearn Integration Guide

## 1. Overview & Architectural Boundaries

TeamSync serves as the central engineering and workspace platform for developers to receive, manage, discuss, assign, track, and resolve reports originating from **KalviLearn**.

### Data Ownership & Separation of Concerns

```
KalviLearn (Client & Learner Domain)
  │
  ├── KalviLearn Users & Accounts
  ├── Student Progress & Submissions
  ├── Mentor Relationships
  └── Feedback / Bug Reporting Trigger
        │
        ▼ HTTPS (Secure Server-to-Server)
TeamSync API (/api/v1/integrations/kalvilearn/...)
        │
        ▼
TeamSync Workspace (Engineering Workflow Domain)
  │
  ├── Tickets & Numbering (TS-1001, TS-1002...)
  ├── Triage, Status & Priority Lifecycle
  ├── Team Member Assignment
  ├── Discussion & Engineering Notes
  ├── Audit Trail & Activity History
  └── Outbound Webhooks for Status Synchronization
```

> [!IMPORTANT]
> - **Server-to-Server Only**: The KalviLearn browser frontend never directly connects to the TeamSync database.
> - **Secret Isolation**: TeamSync API secrets (`TEAMSYNC_API_KEY`, `KALVILEARN_WEBHOOK_SECRET`) must remain strictly on the server and never be bundled into frontend assets.

---

## 2. Authentication & Headers

All integration requests must provide the server integration key using either of the following HTTP headers:

```http
x-api-key: ts_live_kalvilearn_sec_99a8b1c4e2d3f7
```
or
```http
Authorization: Bearer ts_live_kalvilearn_sec_99a8b1c4e2d3f7
```

### Supported Request Headers

| Header | Description | Required |
| :--- | :--- | :--- |
| `x-api-key` | Integration API secret | Yes (or `Authorization: Bearer`) |
| `Authorization` | Bearer token format | Yes (if `x-api-key` omitted) |
| `Idempotency-Key` | Unique request identifier (UUID or request ID) to prevent duplicates | Recommended |
| `Content-Type` | Must be `application/json` for POST / PATCH | Yes |

---

## 3. Endpoints Reference

### Base URL
- Production: `https://teamsync.domain.com/api/v1`
- Development: `http://localhost:5173/api/v1`
- Interactive OpenAPI Docs: `/api/docs`
- OpenAPI JSON Spec: `/api/v1/openapi.json`

---

### 3.1 Create Feedback / Report Ticket

Creates a new ticket or returns the existing ticket if an identical submission arrives (Idempotency).

- **Method**: `POST`
- **Path**: `/api/v1/integrations/kalvilearn/feedback`
- **Supported Report Types**: `BUG`, `FEATURE`, `FEEDBACK`, `ISSUE`, `IMPROVEMENT`, `OTHER`
- **Supported Priorities**: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (defaults: `BUG` ➔ `MEDIUM`, `FEATURE` ➔ `LOW`, `IMPROVEMENT` ➔ `LOW`, `ISSUE` ➔ `MEDIUM`)

#### Request Body Schema
```json
{
  "source": "KALVILEARN",
  "type": "BUG",
  "title": "Student View is not opening",
  "description": "Clicking Student View from the Mentor Portal does not open the student details page.",
  "portal": "MENTOR",
  "route": "/mentor/students",
  "module": "STUDENT_VIEW",
  "priority": "HIGH",
  "externalReferenceId": "kalvilearn-feedback-12345",
  "reporter": {
    "externalUserId": "usr_98172",
    "name": "Aaditya R M",
    "email": "aaditya.rm@kalvium.com",
    "role": "MENTOR"
  },
  "environment": "production",
  "browser": "Chrome 122",
  "device": "Desktop (macOS)",
  "appVersion": "1.0.0",
  "metadata": {
    "requestId": "req_81920"
  },
  "attachments": [
    {
      "fileName": "console_error.png",
      "fileUrl": "https://storage.kalvium.com/reports/console_error.png",
      "fileType": "image/png",
      "fileSize": 1048576
    }
  ],
  "labels": ["mentor", "frontend", "student-view"]
}
```

#### Success Response (201 Created)
```json
{
  "success": true,
  "ticket": {
    "id": "b78b871c-4ce1-4638-ba04-6277b5a83707",
    "ticketNumber": "TS-1001",
    "source": "KALVILEARN",
    "externalReferenceId": "kalvilearn-feedback-12345",
    "type": "BUG",
    "status": "OPEN",
    "priority": "HIGH",
    "createdAt": "2026-09-08T08:00:00.000Z"
  }
}
```

#### Idempotent Duplicate Response (200 OK)
When a request with the same `(source, externalReferenceId)` or `Idempotency-Key` is received:
```json
{
  "success": true,
  "idempotent": true,
  "message": "Ticket already exists for this external reference or idempotency key.",
  "ticket": {
    "id": "b78b871c-4ce1-4638-ba04-6277b5a83707",
    "ticketNumber": "TS-1001",
    "source": "KALVILEARN",
    "externalReferenceId": "kalvilearn-feedback-12345",
    "type": "BUG",
    "status": "OPEN",
    "priority": "HIGH",
    "createdAt": "2026-09-08T08:00:00.000Z"
  }
}
```

---

### 3.2 Query Single Ticket

Retrieves full ticket metadata, context, comments, activities, and attachments.

- **Method**: `GET`
- **Path**: `/api/v1/integrations/kalvilearn/tickets/:ticketNumber`
- **URL Param**: `ticketNumber` (e.g., `TS-1001` or UUID or `externalReferenceId`)

#### Response (200 OK)
```json
{
  "success": true,
  "ticket": {
    "id": "b78b871c-4ce1-4638-ba04-6277b5a83707",
    "ticketNumber": "TS-1001",
    "source": "KALVILEARN",
    "externalReferenceId": "kalvilearn-feedback-12345",
    "type": "BUG",
    "title": "Student View is not opening",
    "description": "Clicking Student View from the Mentor Portal does not open the student details page.",
    "status": "IN_PROGRESS",
    "priority": "HIGH",
    "portal": "MENTOR",
    "route": "/mentor/students",
    "module": "STUDENT_VIEW",
    "reporter": {
      "name": "Aaditya R M",
      "email": "aaditya.rm@kalvium.com",
      "role": "MENTOR"
    },
    "assignee": {
      "id": "8f3068e2-c439-44d5-836e-3ff87c182522",
      "fullName": "Sivakumar Elango",
      "email": "sivakumar@kalvium.com",
      "role": "FOUNDER"
    },
    "labels": ["mentor", "frontend"],
    "createdAt": "2026-09-08T08:00:00.000Z",
    "updatedAt": "2026-09-08T08:15:00.000Z",
    "comments": [
      {
        "id": "c1a2b3-...",
        "authorName": "Sivakumar Elango",
        "authorRole": "FOUNDER",
        "comment": "Identified route param issue in mentor routing provider.",
        "createdAt": "2026-09-08T08:10:00.000Z"
      }
    ],
    "activities": [
      {
        "id": "a1b2c3-...",
        "action": "TICKET_CREATED",
        "from": null,
        "to": "OPEN",
        "performedBy": "KalviLearn System",
        "createdAt": "2026-09-08T08:00:00.000Z"
      },
      {
        "id": "a2b3c4-...",
        "action": "STATUS_CHANGED",
        "from": "OPEN",
        "to": "IN_PROGRESS",
        "performedBy": "Sivakumar Elango",
        "createdAt": "2026-09-08T08:05:00.000Z"
      }
    ]
  }
}
```

---

### 3.3 List & Filter Tickets

Supports filtering, pagination, and multi-field database search.

- **Method**: `GET`
- **Path**: `/api/v1/integrations/kalvilearn/tickets`

#### Query Parameters
- `type`: Filter by type (`BUG`, `FEATURE`, `FEEDBACK`, `ISSUE`, `IMPROVEMENT`, `OTHER`)
- `status`: Filter by status (`OPEN`, `TRIAGED`, `IN_PROGRESS`, `BLOCKED`, `RESOLVED`, `CLOSED`, `REJECTED`)
- `priority`: Filter by priority (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
- `portal`: Filter by portal (`MENTOR`, `STUDENT`, `CAMPUS_MANAGER`)
- `search`: Full-text search on ticket number, title, description, reporter, labels
- `page`: Page number (default: 1)
- `limit`: Records per page (default: 20, max: 100)

#### Response (200 OK)
```json
{
  "success": true,
  "tickets": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

### 3.4 Update Status (Lifecycle State Machine)

Updates a ticket's status. Invalid transitions are strictly rejected with HTTP 422.

- **Method**: `PATCH`
- **Path**: `/api/v1/integrations/kalvilearn/tickets/:ticketNumber/status`

#### Allowed Lifecycle Transitions
```
OPEN
 ├── TRIAGED
 ├── IN_PROGRESS
 ├── BLOCKED
 └── REJECTED

TRIAGED
 ├── IN_PROGRESS
 ├── BLOCKED
 └── REJECTED

IN_PROGRESS
 ├── BLOCKED
 ├── RESOLVED
 └── REJECTED

BLOCKED
 ├── IN_PROGRESS
 └── TRIAGED

RESOLVED
 ├── CLOSED
 └── OPEN (Reopen)

CLOSED
 └── OPEN (Reopen)

REJECTED
 └── OPEN (Reopen)
```

#### Request Body
```json
{
  "status": "RESOLVED",
  "performedByName": "Aaditya R M"
}
```

---

### 3.5 Assign Ticket

Assigns a ticket to a real TeamSync profile.

- **Method**: `PATCH`
- **Path**: `/api/v1/integrations/kalvilearn/tickets/:ticketNumber/assign`

```json
{
  "assignedTo": "8f3068e2-c439-44d5-836e-3ff87c182522"
}
```

---

### 3.6 Add Discussion Comment

- **Method**: `POST`
- **Path**: `/api/v1/integrations/kalvilearn/tickets/:ticketNumber/comments`

```json
{
  "comment": "Bug reproduced on Chrome 122 Desktop. PR ready for review.",
  "authorName": "Aaditya R M"
}
```

---

## 4. Webhooks & Status Synchronization

TeamSync dispatches asynchronous webhooks to `KALVILEARN_WEBHOOK_URL` whenever a ticket is updated.

### Supported Events
- `TICKET_CREATED`
- `STATUS_CHANGED`
- `PRIORITY_CHANGED`
- `ASSIGNED`
- `RESOLVED`
- `CLOSED`
- `REOPENED`

### Webhook Security (HMAC-SHA256)
Every webhook request includes an authentic signature header:

```http
X-TeamSync-Signature: t=1773043200000,v1=9f83...61a4
X-TeamSync-Event: STATUS_CHANGED
X-TeamSync-Event-Id: evt_1773043200000_3ab89c1f
Content-Type: application/json
```

### Signature Verification in Node.js
```javascript
import crypto from 'node:crypto';

function verifyTeamSyncWebhook(rawBodyString, signatureHeader, secret) {
  const parts = signatureHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.substring(2);
  const signature = parts.find(p => p.startsWith('v1='))?.substring(3);

  if (!timestamp || !signature) return false;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${rawBodyString}`);
  const calculated = hmac.digest('hex');

  const expectedBuf = Buffer.from(signature, 'hex');
  const calculatedBuf = Buffer.from(calculated, 'hex');

  if (expectedBuf.length !== calculatedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, calculatedBuf);
}
```

### Retry Policy & Exponential Backoff
If the KalviLearn webhook receiver returns non-2xx or times out:
1. **Attempt 1**: Immediate
2. **Attempt 2**: 1 minute backoff
3. **Attempt 3**: 5 minutes backoff
4. **Attempt 4**: 30 minutes backoff
5. **Attempt 5**: 2 hours backoff
All delivery attempts are recorded in `public.webhook_deliveries`.

---

## 5. HTTP Status Codes & Error Handling

| Code | Status | Reason |
| :--- | :--- | :--- |
| `200` | OK | Successful query or idempotent duplicate retrieval |
| `201` | Created | New ticket created successfully |
| `400` | Bad Request | Validation error (missing fields, malformed email) |
| `401` | Unauthorized | Missing or invalid server API key |
| `404` | Not Found | Ticket number does not exist |
| `409` | Conflict | Concurrent duplicate submission conflict |
| `422` | Unprocessable Entity | Invalid lifecycle state machine transition |
| `429` | Too Many Requests | Rate limit exceeded (standard rate: 60 req/min) |
| `500` | Server Error | Internal database or server exception |
