// TeamSync — Supabase Edge Function: r2-presign
// S3-compatible Cloudflare R2 presigned URL generator & secure storage manager
// Deno runtime (Supabase Edge Functions)

// Ambient Deno declaration for IDE TypeScript language servers
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

// @ts-ignore npm specifier is resolved by Deno runtime
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.654.0';
// @ts-ignore npm specifier is resolved by Deno runtime
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.654.0';
// @ts-ignore npm specifier is resolved by Deno runtime
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Server-side environment secrets
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME') ?? 'teamsync';
const R2_PUBLIC_DOMAIN = Deno.env.get('R2_PUBLIC_DOMAIN') ?? ''; // Optional custom public domain if configured

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Disallowed executable extensions
const DISALLOWED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'msi', 'com', 'scr', 'hta', 'jar', 'apk'
]);

// Category size limits (in bytes)
const SIZE_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024,      // 10 MB
  audio: 25 * 1024 * 1024,      // 25 MB
  document: 25 * 1024 * 1024,   // 25 MB
  video: 250 * 1024 * 1024      // 250 MB
};

function getFileCategory(mimeType: string, fileName: string): string {
  const type = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();

  if (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(name)) return 'image';
  if (type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) return 'video';
  if (type.startsWith('audio/') || /\.(webm|mp3|wav|ogg|m4a|aac)$/i.test(name)) return 'audio';
  return 'document';
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 1. Authenticate user via JWT Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Retrieve user profile to check role
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('id, email, role, is_active')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const userRole = profile?.role || 'MEMBER';
    const userEmail = profile?.email || user.email || '';
    const userId = profile?.id || user.id;

    const body = await req.json();
    const action = body.action || 'create-upload-url';

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: CREATE PRESIGNED UPLOAD URL (Browser -> R2 PUT)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'create-upload-url') {
      const fileName = String(body.fileName || 'file');
      const fileType = String(body.fileType || 'application/octet-stream');
      const fileSize = Number(body.fileSize || 0);
      const destination = String(body.destination || 'chat'); // 'chat' | 'task' | 'avatar'
      const channel = String(body.channel || 'general'); // 'general' | 'leadership'
      const taskId = body.taskId ? String(body.taskId) : null;

      // Validate extension
      const rawExt = fileName.split('.').pop()?.toLowerCase() || 'bin';
      const cleanExt = rawExt.replace(/[^a-z0-9]/g, '');
      if (DISALLOWED_EXTENSIONS.has(cleanExt)) {
        return new Response(JSON.stringify({ error: `File extension .${cleanExt} is not permitted.` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate category size limit
      const category = getFileCategory(fileType, fileName);
      const maxAllowed = SIZE_LIMITS[category] || SIZE_LIMITS.document;
      if (fileSize > maxAllowed) {
        return new Response(JSON.stringify({ error: `File exceeds maximum allowed size for ${category} (${Math.round(maxAllowed / (1024 * 1024))} MB).` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Authorization checks: Leadership Chat
      if (destination === 'chat' && channel === 'leadership') {
        const isLeadership = userEmail.toLowerCase() === 'sivakumarelango10@gmail.com' ||
          ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'].includes(userRole);
        if (!isLeadership) {
          return new Response(JSON.stringify({ error: 'Access Denied: Leadership channel upload is restricted.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Generate predictable safe object key
      const fileId = crypto.randomUUID();
      let storageKey = '';
      if (destination === 'chat') {
        storageKey = `teamsync/chat/${channel}/${fileId}.${cleanExt}`;
      } else if (destination === 'task') {
        storageKey = `teamsync/tasks/${taskId || 'general'}/${fileId}.${cleanExt}`;
      } else if (destination === 'avatar') {
        storageKey = `teamsync/avatars/${userId}/${fileId}.${cleanExt}`;
      } else {
        storageKey = `teamsync/uploads/${userId}/${fileId}.${cleanExt}`;
      }

      // Generate presigned PUT URL (15 minute expiration)
      const putCommand = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: storageKey,
        ContentType: fileType,
        Metadata: {
          uploadedBy: userId,
          originalName: fileName,
          destination,
          channel
        }
      });

      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 900 });

      // Build public or direct URL if public domain configured
      const directUrl = R2_PUBLIC_DOMAIN 
        ? `${R2_PUBLIC_DOMAIN.replace(/\/$/, '')}/${storageKey}`
        : uploadUrl.split('?')[0];

      return new Response(JSON.stringify({
        success: true,
        uploadUrl,
        storageKey,
        directUrl,
        fileId,
        fileName,
        fileType,
        fileSize,
        category,
        expiresIn: 900
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: CREATE PRESIGNED DOWNLOAD URL (R2 GET)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'create-download-url') {
      const storageKey = String(body.storageKey || '');
      if (!storageKey || !storageKey.startsWith('teamsync/')) {
        return new Response(JSON.stringify({ error: 'Invalid storage key' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check authorization for leadership chat attachments
      if (storageKey.includes('/chat/leadership/')) {
        const isLeadership = userEmail.toLowerCase() === 'sivakumarelango10@gmail.com' ||
          ['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR'].includes(userRole);
        if (!isLeadership) {
          return new Response(JSON.stringify({ error: 'Access Denied: You do not have permission to view this attachment.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: storageKey
      });

      const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });

      return new Response(JSON.stringify({
        success: true,
        downloadUrl,
        expiresIn: 900
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: DELETE OBJECT FROM R2
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'delete-file') {
      const storageKey = String(body.storageKey || '');
      if (!storageKey || !storageKey.startsWith('teamsync/')) {
        return new Response(JSON.stringify({ error: 'Invalid storage key' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Delete permission: Founder or original uploader
      const isFounder = userRole === 'FOUNDER' || userEmail.toLowerCase() === 'sivakumarelango10@gmail.com';
      if (!isFounder && !storageKey.includes(`/${userId}/`)) {
        return new Response(JSON.stringify({ error: 'Access Denied: Only the file owner or Founder can delete this file.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const deleteCommand = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: storageKey
      });

      await s3Client.send(deleteCommand);

      return new Response(JSON.stringify({ success: true, deletedKey: storageKey }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[r2-presign] Error:', message);
    return new Response(JSON.stringify({ error: message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
