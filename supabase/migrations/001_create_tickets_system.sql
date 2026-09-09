-- =============================================================================
-- Migration: 001_create_tickets_system.sql
-- Purpose: Create tickets, comments, activities, attachments, and webhook tables
--          for KalviLearn -> TeamSync integration.
-- =============================================================================

-- 1. Sequence for human-readable Ticket Numbers (TS-1001, TS-1002...)
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1001;

-- 2. Main Tickets Table
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE DEFAULT ('TS-' || nextval('ticket_seq')::text),
    source TEXT NOT NULL DEFAULT 'KALVILEARN',
    external_reference_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BUG', 'FEATURE', 'FEEDBACK', 'ISSUE', 'IMPROVEMENT', 'OTHER')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'REJECTED')) DEFAULT 'OPEN',
    priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',
    portal TEXT,
    route TEXT,
    module TEXT,
    environment TEXT DEFAULT 'production',
    browser TEXT,
    device TEXT,
    app_version TEXT,
    reporter_external_id TEXT,
    reporter_name TEXT NOT NULL DEFAULT 'KalviLearn User',
    reporter_email TEXT NOT NULL DEFAULT '',
    reporter_role TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CONSTRAINT unique_source_external_ref UNIQUE (source, external_reference_id)
);

-- 3. Ticket Comments Table
CREATE TABLE IF NOT EXISTS public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT 'Team Member',
    author_role TEXT,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Ticket Activities Table (Audit History)
CREATE TABLE IF NOT EXISTS public.ticket_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    performed_by_name TEXT NOT NULL DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Ticket Attachments Table
CREATE TABLE IF NOT EXISTS public.ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Webhook Deliveries Table (Outbound webhook queue and audit)
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING')) DEFAULT 'PENDING',
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    response_code INT,
    response_body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_source_ext_ref ON public.tickets(source, external_reference_id);
CREATE INDEX IF NOT EXISTS idx_tickets_idempotency_key ON public.tickets(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON public.tickets(type);
CREATE INDEX IF NOT EXISTS idx_tickets_portal ON public.tickets(portal);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_desc ON public.tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket_id ON public.ticket_activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON public.webhook_deliveries(next_retry_at);

-- 8. Row-Level Security
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated TeamSync users to view and interact with tickets
DROP POLICY IF EXISTS "Authenticated users view tickets" ON public.tickets;
CREATE POLICY "Authenticated users view tickets" ON public.tickets
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users insert tickets" ON public.tickets;
CREATE POLICY "Authenticated users insert tickets" ON public.tickets
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users update tickets" ON public.tickets;
CREATE POLICY "Authenticated users update tickets" ON public.tickets
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users view comments" ON public.ticket_comments;
CREATE POLICY "Authenticated users view comments" ON public.ticket_comments
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users insert comments" ON public.ticket_comments;
CREATE POLICY "Authenticated users insert comments" ON public.ticket_comments
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users view activities" ON public.ticket_activities;
CREATE POLICY "Authenticated users view activities" ON public.ticket_activities
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users insert activities" ON public.ticket_activities;
CREATE POLICY "Authenticated users insert activities" ON public.ticket_activities
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users view attachments" ON public.ticket_attachments;
CREATE POLICY "Authenticated users view attachments" ON public.ticket_attachments
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users insert attachments" ON public.ticket_attachments;
CREATE POLICY "Authenticated users insert attachments" ON public.ticket_attachments
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users view webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Authenticated users view webhook deliveries" ON public.webhook_deliveries
    FOR SELECT TO authenticated USING (true);
