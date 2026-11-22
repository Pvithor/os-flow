import { z } from 'zod';

export const createOrderSchema = z.object({
  unit: z.string().trim().min(2, 'Informe a unidade / planta / setor').max(140),
  sector: z.string().trim().max(140).optional().default(''),
  title: z.string().trim().max(140).optional().default(''),
  description: z.string().trim().min(3, 'Descreva o serviço ou ocorrência').max(2000),
  createdAt: z.string().optional(),
  urgent: z.boolean().default(false),
  startImmediately: z.boolean().default(false),
  operatorId: z.string().trim().optional(),
  createdBy: z.string().trim().max(80).optional()
});

export const claimOrderSchema = z.object({
  operatorId: z.string().trim().optional()
});

export const pauseOrderSchema = z.object({
  reason: z.string().trim().min(2, 'Informe o motivo da pausa').max(300)
});

export const notesSchema = z.object({
  notes: z.string().max(2000).default('')
});

export const completeOrderSchema = z.object({
  notes: z.string().max(2000).optional(),
  operatorId: z.string().trim().optional(),
  completedBy: z.string().trim().max(80).optional()
});

export const createOperatorSchema = z.object({
  name: z.string().trim().min(2, 'Nome do operador obrigatório').max(80),
  badge: z.string().trim().max(40).optional().default(''),
  station: z.string().trim().max(100).optional().default('Equipe Técnica'),
  shift: z.string().trim().max(60).optional().default('TURNO B • POSTO ATIVO'),
  shiftGoal: z.number().int().min(1).max(50).optional().default(6)
});

export const updateOperatorSchema = z.object({
  name: z.string().trim().min(2, 'Nome da pessoa obrigatório').max(80),
  badge: z.string().trim().max(40).optional(),
  station: z.string().trim().max(100).optional()
});

export const createUnitSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da escola / unidade').max(140)
});

export const updateUnitSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da escola / unidade').max(140)
});

export const noticeCreateSchema = z.object({
  label: z.string().trim().min(1).max(24).optional().default('NÃO INICIADO'),
  text: z.string().trim().min(1, 'Digite o texto do aviso').max(280),
  author: z.string().trim().max(80).optional().default('Despacho Central')
});

export const noticeUpdateSchema = z.object({
  label: z.string().trim().min(1).max(24).optional(),
  text: z.string().trim().min(1, 'Digite o texto do aviso').max(280)
});

export const setupAuthSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9._-]{3,40}$/,
      'Usuário deve ter entre 3 e 40 caracteres (letras, números, . _ -)'
    ),
  displayName: z
    .string()
    .trim()
    .min(2, 'Informe o nome de exibição')
    .max(80)
    .optional()
    .default('SAC • Controle Geral'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').max(128)
});

export const loginAuthSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário').max(80),
  password: z.string().min(1, 'Informe a senha').max(128)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
  newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres').max(128)
});
