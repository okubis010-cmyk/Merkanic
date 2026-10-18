import type { RecordModel } from 'pocketbase';

/** Shared record shape for all portal collections (vehicles, orders, invoices, photos, users). */
export type Entry = RecordModel & {
  owner: string;
  plate?: string;
  make?: string;
  model?: string;
  apk_date?: string;
  vehicle?: string;
  description?: string;
  status?: string;
  arrival?: string;
  requested_at?: string;
  reason?: string;
  mechanic?: string;
  mileage?: number;
  car_present?: boolean;
  parts_arrived?: boolean;
  parts_location?: string;
  remarks?: string;
  checklist?: { id: string; label: string; done: boolean; form: string; note?: string }[];
  part?: string;
  quantity?: number;
  note?: string;
  photos?: string[];
  number?: string;
  amount?: number;
  document?: string;
  image?: string;
  caption?: string;
  work_order?: string;
  name?: string;
  email?: string;
  role?: string;
  expand?: { vehicle?: Entry; mechanic?: Entry; work_order?: Entry };
};

export const plateFormat = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const date = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Nog niet bekend';
