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
  attachmentUrl?: string;
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
