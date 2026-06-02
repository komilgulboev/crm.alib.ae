export type Role = 'superadmin' | 'manager' | 'warehouse' | 'accountant' | 'driver' | 'client'

export type Currency = 'USD' | 'AED' | 'TJS' | 'RUB'

export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'warehouse'
  | 'dispatched'
  | 'in_transit'
  | 'customs'
  | 'arrived'
  | 'delivered'
  | 'closed'
  | 'problem'
  | 'completed'
  | 'handed_over'
  | 'departed'
  | 'collection_details'
  | 'deleted'

export type JobType = string

export interface OrderNote {
  id: number
  created_at: string
  order_id: number
  user_id: number
  user: User
  text: string
}

export interface OrderLog {
  id: number
  created_at: string
  order_id: number
  user_id: number
  user: User
  action: 'created' | 'updated'
  field: string
  old_value: string
  new_value: string
}

export interface CatalogEntry {
  id: number
  type: string
  value: string
  label: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}
export type NTR = string

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'crypto'

export interface User {
  id: number
  name: string
  email: string
  phone: string
  role: Role
  active: boolean
  telegram_chat_id: string
  created_at: string
}

export interface Client {
  id: number
  name: string
  phone: string
  whatsapp: string
  email: string
  address: string
  country: string
  trn: string
  notes: string
  balance: number
  currency: Currency
  active: boolean
  created_at: string
}

export interface BankAccount {
  id: number
  account_name: string
  bank_name: string
  swift_code: string
  account_number: string
  iban: string
  currency: string
  active: boolean
  created_at: string
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid'

export interface InvoiceLineItem {
  id?: number
  invoice_id?: number
  description: string
  quantity: number
  rate: number
  taxable_amount: number
  tax_rate: number
  tax_amount: number
  amount: number
}

export interface Invoice {
  id: number
  invoice_number: string
  order_id: number
  order: Order
  invoice_date: string
  due_date: string
  terms: string
  chargeable_weight: number
  sub_total: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  currency: string
  accepts_cash: boolean
  status: InvoiceStatus
  notes: string
  line_items: InvoiceLineItem[]
  bank_accounts: BankAccount[]
  created_by_id: number
  created_at: string
}

export interface CargoItem {
  id: number
  order_id: number
  description: string
  quantity: number
  weight_kg: number
  volume_m3: number
  declared_value: number
  currency: Currency
}

export interface StatusHistory {
  id: number
  order_id: number
  status: OrderStatus
  note: string
  changed_by: number
  user: User
  created_at: string
}

export interface Payment {
  id: number
  order_id: number
  amount: number
  currency: Currency
  exchange_rate: number
  amount_usd: number
  method: PaymentMethod
  note: string
  received_by: number
  user: User
  created_at: string
}

export interface Order {
  id: number
  tracking_number: string   // REF#
  our_ref: string           // OUR REF
  status: OrderStatus
  job_status: string        // OPEN | CLOSED
  payment_timing: 'on_dispatch' | 'on_receipt'

  // Тип и маршрут
  job_type: JobType         // T-IN | L-EXP | T-OUT | T-EXP
  flight_type: 'charter' | 'regular' | ''
  origin_country: string
  origin_city: string       // ORG
  dest_country: string
  dest_city: string         // DES

  // Стороны
  supplier: string          // SUPPLIER
  client_id: number
  client: Client            // CUSTOMER
  receiver_name: string
  receiver_phone: string

  assigned_to_id: number | null
  assigned_to: User | null
  created_by_id: number
  created_by: User

  // Груз
  ntr: NTR                  // GEN | DG | ...
  pieces: number            // #PC
  weight_kg: number         // KG
  chargeable_weight: number // CWT
  dimensions: string        // DIMS
  handed_over: boolean      // H.OVER

  // Стороны детально
  shipper_2: string
  consignee_2: string

  // AWB и документы
  final_awb: string
  xbd_awb: string
  svo_awb: string
  boe_number: string        // BOE#
  boe_file_1_key?: string
  boe_file_1_url?: string
  boe_file_2_key?: string
  boe_file_2_url?: string
  boe_file_3_key?: string
  boe_file_3_url?: string

  // Финансы
  total_amount: number      // AMOUNT
  add_amount: number        // ADD AMOUNT
  currency: Currency
  exchange_rate: number     // Rate (default 3.67)
  inv_amount_usd: number    // INV AMOUNT (USD)
  inv_amount_aed: number    // INV AMOUNT (AED)
  invoice_status: string    // Inv Sent | Pending | ...

  paid_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'

  // Приоритет
  priority: string          // AOG | TOPAOG | ROUTINE | CRITICAL

  // Прочее
  cx_notified: boolean      // CX NOTIFIED
  notes: string             // Note
  instr: string             // INSTR

  items: CargoItem[]
  payments: Payment[]
  history: StatusHistory[]
  awb?: AWBData
  documents?: OrderDocument[]
  created_at: string
  updated_at: string
}

export type DocCategory = 'invoice' | 'packing_list' | 'boe'

export interface OrderDocument {
  id: number
  order_id: number
  category: DocCategory
  file_key: string
  file_url: string
  file_name: string
  created_at: string
}

export interface AWBData {
  id?: number
  order_id?: number
  file_key?: string
  file_url?: string
  awb_number: string
  shipper_name: string
  shipper_address: string
  shipper_account_no: string
  consignee_name: string
  consignee_address: string
  consignee_account_no: string
  issuing_agent_name: string
  issuing_agent_city: string
  agent_iata_code: string
  agent_account_no: string
  airport_of_departure: string
  airport_of_destination: string
  first_carrier: string
  routing_destination_1: string
  routing_carrier_1: string
  requested_flight_date: string
  accounting_info: string
  reference_number: string
  optional_shipping_info: string
  currency: string
  mode_of_payment: string
  weight_val_charge: string
  other_charge_code: string
  declared_value_carriage: string
  declared_value_customs: string
  insurance_amount: string
  handling_info: string
  sci_code: string
  number_of_pieces: number
  gross_weight: number
  weight_unit: string
  rate_class: string
  commodity_item_no: string
  chargeable_weight: number
  rate: number
  total: number
  goods_description: string
  volume_cbm: number
  prepaid_weight_charge: number
  collect_weight_charge: number
  valuation_charge: number
  tax: number
  other_charges_agent: number
  other_charges_carrier: number
  total_prepaid: number
  total_collect: number
  execution_date: string
  execution_time: string
  execution_place: string
  signer_name: string
}

export interface DashboardStats {
  total_orders: number
  new_orders: number
  in_transit: number
  delivered: number
  total_revenue_usd: number
}
