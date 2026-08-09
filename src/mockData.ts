import { User, Expense } from "./types";

export const MOCK_USERS: User[] = [
  {
    id: "1",
    name: "Thiago Vieira",
    email: "thiago@example.com",
    color: "#3b82f6", // Blue
    initials: "TV",
  },
  {
    id: "2",
    name: "Ana Costa",
    email: "ana@example.com",
    color: "#10b981", // Emerald
    initials: "AC",
  },
  {
    id: "3",
    name: "Lucas Silva",
    email: "lucas@example.com",
    color: "#f59e0b", // Amber
    initials: "LS",
  },
];

export const MOCK_EXPENSES: Expense[] = [
  {
    id: "101",
    userId: "1",
    category: "Alimentação",
    name: "Almoço Equipe",
    value: 125.50,
    note: "Restaurante Central",
    createdAt: new Date().toISOString(),
  },
  {
    id: "102",
    userId: "2",
    category: "Transporte",
    name: "Uber Escritório",
    value: 45.20,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "103",
    userId: "3",
    category: "Escritório",
    name: "Papelaria",
    value: 89.90,
    note: "Canetas e blocos",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "104",
    userId: "1",
    category: "Alimentação",
    name: "Café",
    value: 12.00,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "105",
    userId: "2",
    category: "Assinaturas",
    name: "Assinatura Adobe",
    value: 230.00,
    note: "Mensalidade",
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
];
