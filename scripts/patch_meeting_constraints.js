import { query } from '../server/db.js';

async function patchConstraints() {
  console.log('Patching meetings and meeting_series check constraints...');

  await query(`
    ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;
    ALTER TABLE public.meetings ADD CONSTRAINT meetings_meeting_type_check 
      CHECK (meeting_type IN (
        'GENERAL', 'STANDUP', 'SYNC', 'REVIEW', 'STRATEGY', '1ON1', 'ALL_HANDS',
        'FOUNDER_ALL_HANDS', 'SPRINT_PLANNING', 'CODE_REVIEW', 'ONE_ON_ONE',
        'LEADERSHIP_ALIGNMENT', 'DEPARTMENT_SYNC'
      ));

    ALTER TABLE public.meeting_series DROP CONSTRAINT IF EXISTS meeting_series_meeting_type_check;
    ALTER TABLE public.meeting_series ADD CONSTRAINT meeting_series_meeting_type_check 
      CHECK (meeting_type IN (
        'GENERAL', 'STANDUP', 'SYNC', 'REVIEW', 'STRATEGY', '1ON1', 'ALL_HANDS',
        'FOUNDER_ALL_HANDS', 'SPRINT_PLANNING', 'CODE_REVIEW', 'ONE_ON_ONE',
        'LEADERSHIP_ALIGNMENT', 'DEPARTMENT_SYNC'
      ));

    ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_visibility_check;
    ALTER TABLE public.meetings ADD CONSTRAINT meetings_visibility_check 
      CHECK (visibility IN (
        'ALL', 'LEADERSHIP', 'LEADERSHIP_ONLY', 'DEPARTMENT', 'DEPARTMENT_ONLY',
        'INVITED', 'INVITED_ONLY'
      ));

    ALTER TABLE public.meeting_series DROP CONSTRAINT IF EXISTS meeting_series_visibility_check;
    ALTER TABLE public.meeting_series ADD CONSTRAINT meeting_series_visibility_check 
      CHECK (visibility IN (
        'ALL', 'LEADERSHIP', 'LEADERSHIP_ONLY', 'DEPARTMENT', 'DEPARTMENT_ONLY',
        'INVITED', 'INVITED_ONLY'
      ));
  `);

  console.log('Successfully updated check constraints on public.meetings and public.meeting_series!');
  process.exit(0);
}

patchConstraints().catch(err => {
  console.error('Error patching constraints:', err);
  process.exit(1);
});
