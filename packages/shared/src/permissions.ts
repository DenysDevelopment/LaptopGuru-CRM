export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard:read',
  EMAILS_READ: 'emails:read',
  EMAILS_WRITE: 'emails:write',
  VIDEOS_READ: 'videos:read',
  VIDEOS_WRITE: 'videos:write',
  SEND_EXECUTE: 'send:execute',
  LINKS_READ: 'links:read',
  LINKS_WRITE: 'links:write',
  LINKS_DELETE: 'links:delete',
  QUICKLINKS_READ: 'quicklinks:read',
  QUICKLINKS_WRITE: 'quicklinks:write',
  ANALYTICS_READ: 'analytics:read',
  SENT_READ: 'sent:read',
  USERS_MANAGE: 'users:manage',

  // Messaging
  MESSAGING_INBOX_READ: 'messaging:inbox:read',
  MESSAGING_CONVERSATIONS_READ: 'messaging:conversations:read',
  MESSAGING_CONVERSATIONS_WRITE: 'messaging:conversations:write',
  MESSAGING_CONVERSATIONS_ASSIGN: 'messaging:conversations:assign',
  MESSAGING_CONVERSATIONS_CLOSE: 'messaging:conversations:close',
  MESSAGING_MESSAGES_SEND: 'messaging:messages:send',
  MESSAGING_NOTES_READ: 'messaging:notes:read',
  MESSAGING_NOTES_WRITE: 'messaging:notes:write',
  MESSAGING_CONTACTS_READ: 'messaging:contacts:read',
  MESSAGING_CONTACTS_WRITE: 'messaging:contacts:write',
  MESSAGING_CONTACTS_MERGE: 'messaging:contacts:merge',
  MESSAGING_TAGS_MANAGE: 'messaging:tags:manage',
  MESSAGING_TEMPLATES_READ: 'messaging:templates:read',
  MESSAGING_TEMPLATES_WRITE: 'messaging:templates:write',
  MESSAGING_CHANNELS_READ: 'messaging:channels:read',
  MESSAGING_CHANNELS_WRITE: 'messaging:channels:write',
  MESSAGING_TEAMS_MANAGE: 'messaging:teams:manage',
  MESSAGING_HOURS_MANAGE: 'messaging:hours:manage',
  MESSAGING_ANALYTICS_READ: 'messaging:analytics:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All possible permission values (for admin UI checkboxes) */
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Grouped permissions for the admin UI.
 * Each group has a label (RU) and the permissions it contains.
 */
export const PERMISSION_GROUPS: { label: string; permissions: { value: Permission; label: string }[] }[] = [
  {
    label: 'Dashboard',
    permissions: [
      { value: PERMISSIONS.DASHBOARD_READ, label: 'Просмотр статистики' },
    ],
  },
  {
    label: 'Заявки (Emails)',
    permissions: [
      { value: PERMISSIONS.EMAILS_READ, label: 'Просмотр заявок' },
      { value: PERMISSIONS.EMAILS_WRITE, label: 'Обработка заявок' },
    ],
  },
  {
    label: 'Видео',
    permissions: [
      { value: PERMISSIONS.VIDEOS_READ, label: 'Просмотр видео' },
      { value: PERMISSIONS.VIDEOS_WRITE, label: 'Управление видео' },
    ],
  },
  {
    label: 'Отправка',
    permissions: [
      { value: PERMISSIONS.SEND_EXECUTE, label: 'Отправка email' },
      { value: PERMISSIONS.SENT_READ, label: 'История отправок' },
    ],
  },
  {
    label: 'Ссылки',
    permissions: [
      { value: PERMISSIONS.LINKS_READ, label: 'Просмотр лендингов' },
      { value: PERMISSIONS.LINKS_WRITE, label: 'Создание лендингов' },
      { value: PERMISSIONS.LINKS_DELETE, label: 'Удаление лендингов (админ)' },
    ],
  },
  {
    label: 'Редиректы',
    permissions: [
      { value: PERMISSIONS.QUICKLINKS_READ, label: 'Просмотр редиректов' },
      { value: PERMISSIONS.QUICKLINKS_WRITE, label: 'Управление редиректами' },
    ],
  },
  {
    label: 'Аналитика',
    permissions: [
      { value: PERMISSIONS.ANALYTICS_READ, label: 'Просмотр аналитики' },
    ],
  },
  {
    label: 'Администрирование',
    permissions: [
      { value: PERMISSIONS.USERS_MANAGE, label: 'Управление пользователями' },
    ],
  },
  {
    label: 'Мессенджер — Inbox',
    permissions: [
      { value: PERMISSIONS.MESSAGING_INBOX_READ, label: 'Просмотр входящих' },
      { value: PERMISSIONS.MESSAGING_CONVERSATIONS_READ, label: 'Просмотр разговоров' },
      { value: PERMISSIONS.MESSAGING_CONVERSATIONS_WRITE, label: 'Управление разговорами' },
      { value: PERMISSIONS.MESSAGING_CONVERSATIONS_ASSIGN, label: 'Назначение разговоров' },
      { value: PERMISSIONS.MESSAGING_CONVERSATIONS_CLOSE, label: 'Закрытие разговоров' },
      { value: PERMISSIONS.MESSAGING_MESSAGES_SEND, label: 'Отправка сообщений' },
    ],
  },
  {
    label: 'Мессенджер — Заметки и контакты',
    permissions: [
      { value: PERMISSIONS.MESSAGING_NOTES_READ, label: 'Просмотр заметок' },
      { value: PERMISSIONS.MESSAGING_NOTES_WRITE, label: 'Создание заметок' },
      { value: PERMISSIONS.MESSAGING_CONTACTS_READ, label: 'Просмотр контактов' },
      { value: PERMISSIONS.MESSAGING_CONTACTS_WRITE, label: 'Управление контактами' },
      { value: PERMISSIONS.MESSAGING_CONTACTS_MERGE, label: 'Объединение контактов' },
      { value: PERMISSIONS.MESSAGING_TAGS_MANAGE, label: 'Управление тегами' },
    ],
  },
  {
    label: 'Мессенджер — Настройки',
    permissions: [
      { value: PERMISSIONS.MESSAGING_TEMPLATES_READ, label: 'Просмотр шаблонов' },
      { value: PERMISSIONS.MESSAGING_TEMPLATES_WRITE, label: 'Управление шаблонами' },
      { value: PERMISSIONS.MESSAGING_CHANNELS_READ, label: 'Просмотр каналов' },
      { value: PERMISSIONS.MESSAGING_CHANNELS_WRITE, label: 'Настройка каналов' },
      { value: PERMISSIONS.MESSAGING_TEAMS_MANAGE, label: 'Управление командами' },
      { value: PERMISSIONS.MESSAGING_HOURS_MANAGE, label: 'Управление графиком работы' },
      { value: PERMISSIONS.MESSAGING_ANALYTICS_READ, label: 'Аналитика мессенджера' },
    ],
  },
];

/**
 * Map frontend routes to required permissions.
 * Dashboard is always accessible (shows empty state without dashboard:read).
 */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  '/emails': PERMISSIONS.EMAILS_READ,
  '/videos': PERMISSIONS.VIDEOS_READ,
  '/send': PERMISSIONS.SEND_EXECUTE,
  '/sent': PERMISSIONS.SENT_READ,
  '/links': PERMISSIONS.LINKS_READ,
  '/quicklinks': PERMISSIONS.QUICKLINKS_READ,
  '/analytics': PERMISSIONS.ANALYTICS_READ,
  '/admin': PERMISSIONS.USERS_MANAGE,
  '/messaging': PERMISSIONS.MESSAGING_INBOX_READ,
  '/messaging/inbox': PERMISSIONS.MESSAGING_INBOX_READ,
  '/messaging/contacts': PERMISSIONS.MESSAGING_CONTACTS_READ,
  '/settings': PERMISSIONS.MESSAGING_CHANNELS_READ,
  '/messaging/analytics': PERMISSIONS.MESSAGING_ANALYTICS_READ,
};

/**
 * Check if a user has the required permission(s).
 * ADMIN role bypasses all checks.
 */
export function hasPermission(
  role: string | undefined | null,
  userPermissions: string[] | undefined | null,
  required: Permission | Permission[],
): boolean {
  if (role === 'ADMIN') return true;
  const perms = userPermissions ?? [];
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((p) => perms.includes(p));
}
