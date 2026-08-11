export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
  initials: string;
  photoUrl?: string;
  allowedCategories?: string[] | null; // null = acesso total
}

export interface Expense {
  id: string;
  userId: string;
  category: string;
  name: string;
  value: number;
  note?: string;
  attachmentUrls: string[];
  billId?: string | null; // vinculado a uma Bill se foi criado ao marcar conta como paga
  createdAt: string;
  expenseDate: string; // data real do gasto (YYYY-MM-DD)
  pending?: boolean; // aguardando sincronização offline (apenas client-side)
}

export interface UserStats {
  userId: string;
  userName: string;
  total: number;
  color: string;
}

export interface Checklist {
  id: string;
  name: string;
  color: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  description: string | null;
  done: boolean;
  doneAt: string | null;
  position: number;
  createdAt: string;
}

export interface Bill {
  id: string;
  name: string;
  value: number;
  dueDay: number; // 1-31
  category: string;
  isRecurring: boolean;
  installments: number | null; // null = recorrente sem fim; N = parcelado em N vezes
  paidCount: number; // quantas vezes já foi paga no total (usado com installments pra mostrar X/Y)
  lastPaidYearMonth: string | null; // 'YYYY-MM' — usado pra saber se está paga no mês corrente
  lastPaidExpenseId: string | null;
  createdBy: string | null;
  createdAt: string;
}
