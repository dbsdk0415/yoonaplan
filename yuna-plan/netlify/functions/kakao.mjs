// 알림 보내기
//  type "new"    선생님이 요청 등록   → 윤아에게
//  type "cond"   선생님이 조건 추가   → 윤아에게
//  type "answer" 윤아가 답변/상태 변경 → 선생님에게
//  type "q"      선생님이 질문 등록   → 윤아에게
//  type "qa"     윤아가 질문에 답변   → 선생님에게
// 방금(2분 이내) 실제로 일어난 변경인지 Firestore에서 확인한 뒤에만 보냅니다.
import { yunaAccess, teacherAccess, sendMemo } from '../lib/kakao.mjs';

const RECENT = 2 * 60 * 1000;
const LABEL = { new: '접수됨', doing: '진행 중', done: '완료' };
const PRI = { high: '급해요', normal: '보통', low: '여유 있어요' };
const ts = f => (f?.timestampValue ? new Date(f.timestampValue).getTime() : 0);
const str = f => f?.stringValue || '';
const list = f => (f?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let id, type;
  try { ({ id, type } = await req.json()); } catch { return new Response('Bad request', { status: 400 }); }
  if (!/^[A-Za-z0-9]{10,40}$/.test(id || '') || !['new', 'cond', 'answer', 'q', 'qa'].includes(type)) return new Response('Bad request', { status: 400 });

  const pid = process.env.FIREBASE_PROJECT_ID;
  const colName = type === 'q' || type === 'qa' ? 'questions' : 'requests';
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${colName}/${id}`);
  if (!r.ok) return new Response('Not found', { status: 404 });
  const doc = await r.json(), F = doc.fields || {};
  const now = Date.now(), title = str(F.title), url = new URL(req.url).origin + (colName === 'questions' ? '/#ask' : '/#qa');

  let text, access;
  if (type === 'new') {
    if (now - new Date(doc.createTime).getTime() > RECENT) return new Response('Too old', { status: 409 });
    const extra = [PRI[str(F.priority)] && `중요도: ${PRI[str(F.priority)]}`, str(F.due) && `기한: ${str(F.due)}`].filter(Boolean).join(' / ');
    const cs = list(F.conditions);
    text = `📐 선생님의 새 요청\n\n${title}` + (extra ? `\n${extra}` : '') + (cs.length ? `\n조건: ${cs.join(', ')}` : '') + (str(F.body) ? `\n\n${str(F.body)}` : '');
    access = await yunaAccess();
  } else if (type === 'cond') {
    if (now - ts(F.condAt) > RECENT) return new Response('Too old', { status: 409 });
    const cs = list(F.conditions);
    text = `➕ 선생님이 조건을 추가했어요\n\n요청: ${title}\n추가된 조건: ${cs[cs.length - 1] || ''}`;
    access = await yunaAccess();
  } else if (type === 'q') {
    if (now - new Date(doc.createTime).getTime() > RECENT) return new Response('Too old', { status: 409 });
    text = `❓ 선생님의 질문\n\n${str(F.text)}`;
    access = await yunaAccess();
  } else if (type === 'qa') {
    if (now - ts(F.updatedAt) > RECENT) return new Response('Too old', { status: 409 });
    text = `💬 윤아가 질문에 답했어요\n\nQ. ${str(F.text)}\nA. ${str(F.answer)}`;
    access = await teacherAccess();
    if (!access) return new Response('Teacher not linked', { status: 204 });
  } else {
    if (now - ts(F.updatedAt) > RECENT) return new Response('Too old', { status: 409 });
    const st = str(F.status), ans = str(F.answer);
    text = (st === 'done' ? '✅ 요청이 완료되었어요' : '💬 윤아가 답변을 남겼어요') + `\n\n요청: ${title}\n상태: ${LABEL[st] || st}` + (ans ? `\n\n${ans}` : '');
    access = await teacherAccess();
    if (!access) return new Response('Teacher not linked', { status: 204 });
  }
  if (!access) return new Response('Token error', { status: 502 });
  return (await sendMemo(access, text, url)) ? new Response('ok') : new Response('Send error', { status: 502 });
};
