// 선생님 카톡 연결: GET = 연결 여부, POST = 인가 코드로 토큰 발급 후 저장
import { store, exchange } from '../lib/kakao.mjs';

export default async (req) => {
  if (req.method === 'GET') {
    const s = await store().get('teacher', { type: 'json' });
    return Response.json({ linked: !!s });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let code, redirect_uri;
  try { ({ code, redirect_uri } = await req.json()); } catch { return Response.json({ ok: false }, { status: 400 }); }
  if (!code || redirect_uri !== new URL(req.url).origin) return Response.json({ ok: false, error: '잘못된 요청입니다.' }, { status: 400 });

  const t = await exchange({ grant_type: 'authorization_code', redirect_uri, code });
  if (!t.refresh_token) return Response.json({ ok: false, error: '카카오 연결에 실패했습니다. 다시 시도해 주세요.' }, { status: 400 });
  if (!(t.scope || '').includes('talk_message')) return Response.json({ ok: false, error: '"카카오톡 메시지 전송"에 동의해 주셔야 알림을 받을 수 있어요.' }, { status: 400 });

  await store().setJSON('teacher', { refresh_token: t.refresh_token, at: Date.now() });
  return Response.json({ ok: true });
};
