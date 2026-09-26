// 공통 도우미: 카카오 토큰 갱신과 "나에게 보내기"
import { getStore } from '@netlify/blobs';

const form = { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' };
export const store = () => getStore('kakao');

export async function exchange(params) {
  const p = new URLSearchParams({ client_id: process.env.KAKAO_REST_KEY, ...params });
  if (process.env.KAKAO_CLIENT_SECRET) p.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  const r = await fetch('https://kauth.kakao.com/oauth/token', { method: 'POST', headers: form, body: p });
  return r.json();
}

// 윤아: 환경변수의 refresh_token 사용
export async function yunaAccess() {
  const t = await exchange({ grant_type: 'refresh_token', refresh_token: process.env.KAKAO_REFRESH_TOKEN });
  return t.access_token || null;
}

// 선생님: 사이트에서 연결한 refresh_token 사용 (Netlify Blobs에 저장)
export async function teacherAccess() {
  const s = await store().get('teacher', { type: 'json' });
  if (!s?.refresh_token) return null;
  const t = await exchange({ grant_type: 'refresh_token', refresh_token: s.refresh_token });
  if (t.refresh_token) await store().setJSON('teacher', { refresh_token: t.refresh_token, at: Date.now() });
  return t.access_token || null;
}

export async function sendMemo(access, text, url) {
  if (text.length > 200) text = text.slice(0, 197) + '...';
  const template = { object_type: 'text', text, link: { web_url: url, mobile_web_url: url }, button_title: '사이트 열기' };
  const r = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST', headers: { ...form, Authorization: `Bearer ${access}` },
    body: new URLSearchParams({ template_object: JSON.stringify(template) })
  });
  if (!r.ok) console.error('kakao send error', await r.text());
  return r.ok;
}
