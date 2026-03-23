import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSupabaseServerClient } from '../../../../../lib/supabase-server';

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      'Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or R2_ENDPOINT',
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const videoId = params.id;
    const { data: video, error: queryError } = await supabase
      .from('videos')
      .select('id,storage_key')
      .eq('id', videoId)
      .single();
    if (queryError || !video?.storage_key) {
      return NextResponse.json({ error: 'Video storage key not found' }, { status: 404 });
    }

    const bucket = process.env.R2_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: 'Missing R2_BUCKET' }, { status: 500 });
    }

    const r2 = getR2Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: video.storage_key,
      ResponseContentDisposition: 'inline',
    });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 * 10 });
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
