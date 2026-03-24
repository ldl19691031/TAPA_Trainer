import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase-server';

type ImportRow = {
  video_id: string;
  ts_sec: number;
  track_id: number;
  left_ratio: number;
  top_ratio: number;
  width_ratio: number;
  height_ratio: number;
  score: number | null;
  mask_polygon: unknown | null;
};

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

function isValidRow(row: unknown): row is ImportRow {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const value = row as Record<string, unknown>;
  return (
    typeof value.video_id === 'string' &&
    typeof value.ts_sec === 'number' &&
    typeof value.track_id === 'number' &&
    typeof value.left_ratio === 'number' &&
    typeof value.top_ratio === 'number' &&
    typeof value.width_ratio === 'number' &&
    typeof value.height_ratio === 'number' &&
    (typeof value.score === 'number' || value.score === null)
  );
}

export async function POST(request: NextRequest) {
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

    const payload = (await request.json()) as { rows?: unknown };
    const rows = payload.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 });
    }
    if (!rows.every(isValidRow)) {
      return NextResponse.json({ error: 'rows contain invalid schema' }, { status: 400 });
    }

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('video_person_frames')
        .upsert(chunk, { onConflict: 'video_id,ts_sec,track_id' });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, imported: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
