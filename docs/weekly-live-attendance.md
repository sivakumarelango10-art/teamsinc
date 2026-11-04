# TeamSync weekly live photo attendance

## What this adds

- The Founder starts a single attendance session for a weekly meeting occurrence after a recent Supabase AAL2 MFA challenge.
- The Founder flow prefers a platform WebAuthn authenticator (Face ID, Touch ID, Windows Hello, or the device's configured secure-unlock method). An enrolled TOTP authenticator is available as a fallback.
- Each eligible active Admin and Member receives an in-app attendance notification and sees a live attendance banner in Meeting Hub.
- A participant captures a still image after explicitly opening the camera, previews it, and submits it once within five minutes.
- The Founder sees a live roster and private photo evidence. Manual attendance correction is blocked while the window is open and re-enabled for the Founder after it closes.
- Participants who have not submitted by expiry are marked Absent and an audit-history entry records why.
- Personal attendance history and organization reports continue to count Absent records in the normal way.

## Required Supabase project configuration

The repository migration creates the private photo bucket and database policies, but it cannot change the hosted Supabase Auth service configuration.

Before enabling the Founder start button in production, enable WebAuthn MFA enrollment and verification in the Supabase project Auth configuration:

- `mfa_web_authn_enroll_enabled = true`
- `mfa_web_authn_verify_enabled = true`
- `webauthn_rp_display_name = TeamSync`
- `webauthn_rp_id = teamsync-fawn.vercel.app`
- `webauthn_rp_origins = https://teamsync-fawn.vercel.app`

For a local Vite origin, add the exact local origin you use (for example `http://localhost:5173`) to the allowed origins and use the matching local host as the RP ID while developing. Do not add broad wildcard origins.

WebAuthn MFA is experimental in the current Supabase JS SDK. The UI requires user verification during the passkey ceremony and prefers a platform authenticator. The actual prompt and available verification methods are determined by the browser and operating system. A device PIN or security-key flow may be offered instead of biometrics. If WebAuthn is unavailable or disabled, the Founder can use the TOTP fallback.

Supabase references:
- [Auth MFA configuration](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase CLI Auth configuration](https://supabase.com/docs/guides/local-development/cli/config)
- [Supabase JavaScript WebAuthn implementation](https://github.com/supabase/supabase-js/blob/v2.112.4/packages/core/auth-js/src/lib/webauthn.ts)

## Apply the database migration

Apply `supabase/migrations/006_live_weekly_photo_attendance.sql` to the Supabase project before deploying the frontend/backend changes. It adds the session table, attendance evidence columns, RLS policies, the private Storage bucket, and realtime publication.

The migration attempts to enable and schedule a pg_cron job every minute. That job closes expired sessions and marks remaining UNMARKED rows Absent. If pg_cron is unavailable or the project does not permit scheduling, the migration reports a notice; API requests also reconcile expired sessions when the Founder or a participant loads the attendance view.

## Server environment

The live attendance endpoints verify bearer tokens against Supabase Auth. Ensure the server deployment has:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The backend also accepts the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values as fallbacks. Never place a Supabase service-role key in frontend configuration.

## Photo handling and privacy

The attendance bucket is private, and upload policies restrict a user to their own currently open attendance session. Only the participant and Founder can read the stored image; the Founder UI uses short-lived signed URLs.

The captured still image is evidence for the Founder to review. TeamSync does not perform face matching or claim that a photo proves identity automatically. Choose and publish an appropriate retention period for attendance photos before production rollout. The migration does not automatically delete photo objects when an attendance row or meeting is deleted.

## Verification checklist

1. Apply the migration and confirm the private bucket exists.
2. Enable WebAuthn MFA and configure the RP ID/origin values above.
3. Set the server Supabase environment values.
4. Confirm the Founder can enroll and verify a platform authenticator (or TOTP fallback).
5. Start a weekly meeting attendance window and verify the five-minute timer and participant notification.
6. Submit one photo as a Member and one as an Admin; verify each becomes Present and only the Founder can view the photos.
7. Let a participant's window expire; verify the pg_cron job or API reconciliation marks them Absent with an audit entry.
8. Confirm manual attendance changes fail during the open window and Founder corrections succeed after closure.
9. Confirm each user only sees their own personal attendance history.
