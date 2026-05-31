import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { OrderStatus, Currency } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, { ru: string; en: string; color: string }> = {
  new:                { ru: 'Новый',             en: 'New',                color: 'bg-gray-100 text-gray-800' },
  accepted:           { ru: 'Принят',            en: 'Accepted',           color: 'bg-sky-100 text-sky-800' },
  warehouse:          { ru: 'На складе',         en: 'In Warehouse',       color: 'bg-yellow-100 text-yellow-800' },
  dispatched:         { ru: 'Отправлен',         en: 'Dispatched',         color: 'bg-indigo-100 text-indigo-800' },
  in_transit:         { ru: 'В пути',            en: 'In Transit',         color: 'bg-purple-100 text-purple-800' },
  customs:            { ru: 'На таможне',        en: 'Customs',            color: 'bg-orange-100 text-orange-800' },
  arrived:            { ru: 'Прибыл',            en: 'Arrived',            color: 'bg-lime-100 text-lime-800' },
  delivered:          { ru: 'Доставлен',         en: 'Delivered',          color: 'bg-green-100 text-green-800' },
  closed:             { ru: 'Закрыт',            en: 'Closed',             color: 'bg-gray-200 text-gray-600' },
  problem:            { ru: 'Проблема',          en: 'Problem',            color: 'bg-red-100 text-red-800' },
  completed:          { ru: 'Completed',         en: 'Completed',          color: 'bg-green-200 text-green-800' },
  handed_over:        { ru: 'Handed Over',       en: 'Handed Over',        color: 'bg-teal-100 text-teal-800' },
  departed:           { ru: 'Departed',          en: 'Departed',           color: 'bg-cyan-100 text-cyan-800' },
  collection_details: { ru: 'Collection Details', en: 'Collection Details', color: 'bg-yellow-100 text-yellow-700' },
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  AED: 'د.إ',
  TJS: 'SM',
  RUB: '₽',
}

export function formatCurrency(amount: number, currency: Currency): string {
  return `${CURRENCY_SYMBOLS[currency]}${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
