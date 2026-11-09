export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function validPassword(password: string) {
  return password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');

    if (!token || !validPassword(password)) {
      return NextResponse.json(
        { error: 'El enlace o la contraseña no cumplen los requisitos.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const hash = tokenDigest(token);
    const now = new Date().toISOString();

    const { data: tokenRow, error: tokenError } = await supabase
      .from('profile_first_access_tokens')
      .select('id,profile_id,expires_at,used_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!tokenRow || tokenRow.used_at || tokenRow.expires_at <= now) {
      return NextResponse.json({ error: 'Este enlace ya no es válido.' }, { status: 410 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,status,organization_id')
      .eq('id', tokenRow.profile_id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.status !== 'active' || !profile.email) {
      return NextResponse.json({ error: 'Perfil no disponible para primer acceso.' }, { status: 403 });
    }

    const normalizedEmail = profile.email.trim().toLowerCase();

    const { data: existingLink, error: linkLookupError } = await supabase
      .from('auth_profile_identity_links')
      .select('auth_user_id')
      .eq('profile_id', profile.id)
      .maybeSingle();
    if (linkLookupError) throw linkLookupError;

    let authUserId = existingLink?.auth_user_id || null;

    if (!authUserId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });

      if (createError || !created.user?.id) {
        return NextResponse.json(
          { error: 'No se pudo crear la identidad de acceso.' },
          { status: 409 }
        );
      }
      authUserId = created.user.id;

      const { error: bridgeError } = await supabase
        .from('auth_profile_identity_links')
        .insert({
          auth_user_id: authUserId,
          profile_id: profile.id,
          linked_email: normalizedEmail,
          link_reason: 'first_access_setup',
        });
      if (bridgeError) {
        await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
        throw bridgeError;
      }
    } else {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
      });
      if (updateAuthError) throw updateAuthError;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ password_hash: passwordHash, updated_at: now })
      .eq('id', profile.id)
      .eq('organization_id', profile.organization_id);
    if (profileUpdateError) throw profileUpdateError;

    const { error: consumeError } = await supabase
      .from('profile_first_access_tokens')
      .update({ used_at: now })
      .eq('id', tokenRow.id)
      .is('used_at', null);
    if (consumeError) throw consumeError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth:first-access]', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'No se pudo completar el primer acceso.' }, { status: 500 });
  }
}
