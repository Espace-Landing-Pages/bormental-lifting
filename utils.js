export function normalizeRussianPhone(value = '') {
  const digits = String(value).replace(/\D/g, '');

  if (!digits) return '7';
  if (digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.startsWith('7')) return digits;
  if (digits.length <= 10) return `7${digits}`;
  return digits;
}

export function formatRussianPhone(value = '') {
  const normalized = normalizeRussianPhone(value);
  if (!normalized.startsWith('7')) return normalized ? `+${normalized}` : '+7';

  const local = normalized.slice(1);
  let formatted = '+7';

  if (local.length > 0) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ')';
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  if (local.length > 10) formatted += ` ${local.slice(10)}`;

  return formatted;
}

export function isCompleteRussianPhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return /^\d{10}$/.test(digits) || /^[78]\d{10}$/.test(digits);
}
