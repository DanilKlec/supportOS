import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
export function PendingApproval() {
 const navigate=useNavigate();const email=useAuthStore(s=>s.session?.user.email);const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function check() {setBusy(true);setMessage('');try {await supabaseService.refreshIdentity();const state=useAuthStore.getState();if(state.error)throw new Error(state.error);const access=state.session?.user.access;if(access?.status==='active'){const to=['/','/admin','/qc','/agent-monitor','/settings'].find(path=>canAccessPage(access,path));if(to)await navigate({to});else setMessage('Аккаунт подтверждён, но доступные разделы пока не назначены.');}else setMessage(access?.status==='disabled'?'Доступ не одобрен. Обратитесь к администратору.':'Заявка ещё ожидает проверки.');}catch(error){setMessage(error instanceof Error?error.message:'Не удалось проверить статус');}finally{setBusy(false);}}
 return <section className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-6 space-y-4"><h1 className="text-xl font-semibold">Регистрация на проверке</h1><p className="text-sm text-muted">Аккаунт {email} создан. Администратор проверит заявку и назначит роли. До этого рабочие разделы недоступны.</p><p className="text-sm text-muted">Повторно регистрироваться не нужно.</p>{message&&<output className="block text-sm">{message}</output>}<div className="flex flex-wrap gap-3"><button type="button" disabled={busy} className="ui-button ui-button--primary" onClick={()=>void check()}>{busy?'Проверяем…':'Проверить статус'}</button><button type="button" disabled={busy} className="ui-button" onClick={()=>void supabaseService.signOut().catch(()=>setMessage('Не удалось выйти. Попробуйте ещё раз.'))}>Выйти</button></div></section>;
}
