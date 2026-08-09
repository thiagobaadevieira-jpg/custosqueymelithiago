import { supabase } from './supabase';
import type { User, Expense } from '../types';

export type Category = { id?: string; name: string; color: string; initials: string };

// ─── Expenses ───────────────────────────────────────────────────────────────

function rowToExpense(row: Record<string, unknown>): Expense {
  // expense_date vem como "YYYY-MM-DD", fallback para data do created_at
  const expenseDate = (row.expense_date as string)
    || (row.created_at as string)?.slice(0, 10)
    || new Date().toISOString().slice(0, 10);
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: row.category as string,
    name: row.name as string,
    value: Number(row.value),
    note: row.note ? (row.note as string) : undefined,
    attachmentUrl: row.attachment_url ? (row.attachment_url as string) : undefined,
    createdAt: row.created_at as string,
    expenseDate,
  };
}

export async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToExpense);
}

export async function createExpense(
  data: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  const { data: row, error } = await supabase
    .from('expenses')
    .insert({
      user_id: data.userId,
      category: data.category,
      name: data.name,
      value: data.value,
      note: data.note ?? null,
      attachment_url: data.attachmentUrl ?? null,
      expense_date: data.expenseDate ?? new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) throw error;
  return rowToExpense(row);
}

export async function updateExpense(
  id: string,
  data: Partial<Omit<Expense, 'id' | 'userId' | 'createdAt'>>
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({
      category: data.category,
      name: data.name,
      value: data.value,
      note: data.note ?? null,
      attachment_url: data.attachmentUrl ?? null,
      expense_date: data.expenseDate,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

export async function updateExpensesCategoryName(
  oldName: string,
  newName: string
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ category: newName })
    .eq('category', oldName);
  if (error) throw error;
}

// ─── Categories ─────────────────────────────────────────────────────────────

function rowToCategory(row: Record<string, unknown>): Category {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    initials: row.initials as string,
  };
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToCategory);
}

export async function createCategory(
  cat: Omit<Category, 'id'>,
  userId: string
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: cat.name, color: cat.color, initials: cat.initials, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return rowToCategory(data);
}

export async function updateCategory(
  id: string,
  updates: Partial<Omit<Category, 'id'>>
): Promise<void> {
  const { error } = await supabase.from('categories').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ─── User profiles ───────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('user_profiles').select('*');
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    name: row.name as string,
    email: '',
    color: row.color as string,
    initials: row.initials as string,
    photoUrl: row.photo_url ? (row.photo_url as string) : undefined,
  }));
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    email: '',
    color: data.color as string,
    initials: data.initials as string,
    photoUrl: data.photo_url ? (data.photo_url as string) : undefined,
    allowedCategories: (data.allowed_categories as string[] | null) ?? null,
  };
}

export async function upsertUserProfile(
  userId: string,
  profile: { name?: string; color?: string; initials?: string; photoUrl?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
  };
  if (profile.name !== undefined) payload.name = profile.name;
  if (profile.color !== undefined) payload.color = profile.color;
  if (profile.initials !== undefined) payload.initials = profile.initials;
  if (profile.photoUrl !== undefined) payload.photo_url = profile.photoUrl;

  const { error } = await supabase.from('user_profiles').upsert(payload);
  if (error) throw error;
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

// ─── App Settings (team-wide singleton) ─────────────────────────────────────

const APP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export type AppSettings = {
  notificationTitle: string;
  notificationMessage: string;
};

export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('notification_title, notification_message')
    .eq('id', APP_SETTINGS_ID)
    .single();
  if (error || !data) {
    return {
      notificationTitle: 'Controle de Gastos',
      notificationMessage: 'Você lembrou de anotar os seus gastos hoje?',
    };
  }
  return {
    notificationTitle: data.notification_title as string,
    notificationMessage: data.notification_message as string,
  };
}

export async function updateAppSettings(
  updates: Partial<AppSettings>,
  userId: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  if (updates.notificationTitle !== undefined) payload.notification_title = updates.notificationTitle;
  if (updates.notificationMessage !== undefined) payload.notification_message = updates.notificationMessage;

  const { error } = await supabase
    .from('app_settings')
    .update(payload)
    .eq('id', APP_SETTINGS_ID);
  if (error) throw error;
}

// ─── Push Subscriptions ──────────────────────────────────────────────────────

export const VAPID_PUBLIC_KEY = 'BFl-zEkt9AJn2_hmizIx2Z1h2iaNkKi1FuyO2KgZkH30UsX8rBK3bGn99912DdiqYLxN1bKkrL5ZiudDNVBPBG4';

export async function upsertPushSubscription(
  userId: string,
  subscription: PushSubscription,
  opts: { time: string; title: string; message: string; enabled: boolean }
): Promise<void> {
  const json = subscription.toJSON();
  const utcOffsetMinutes = -(new Date().getTimezoneOffset()); // e.g. -180 para BRT
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    notification_time: opts.time,
    notification_title: opts.title,
    notification_message: opts.message,
    utc_offset_minutes: utcOffsetMinutes,
    enabled: opts.enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });
  if (error) throw error;
}

export async function disablePushSubscription(userId: string): Promise<void> {
  await supabase.from('push_subscriptions').update({ enabled: false }).eq('user_id', userId);
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function uploadReceipt(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('receipts').getPublicUrl(path);
  return data.publicUrl;
}
