package models

import (
	"time"

	"gorm.io/gorm"
)

type OrderStatus string

const (
	StatusNew        OrderStatus = "new"
	StatusAccepted   OrderStatus = "accepted"
	StatusWarehouse  OrderStatus = "warehouse"
	StatusDispatched OrderStatus = "dispatched"
	StatusInTransit  OrderStatus = "in_transit"
	StatusCustoms    OrderStatus = "customs"
	StatusArrived    OrderStatus = "arrived"
	StatusDelivered  OrderStatus = "delivered"
	StatusClosed     OrderStatus = "closed"
	StatusProblem    OrderStatus = "problem"
	// Карго-статусы из рабочей таблицы
	StatusCompleted         OrderStatus = "completed"
	StatusHandedOver        OrderStatus = "handed_over"
	StatusDeparted          OrderStatus = "departed"
	StatusCollectionDetails OrderStatus = "collection_details"
)

// JobStatus константы
const (
	JobStatusOpen   = "OPEN"
	JobStatusClosed = "CLOSED"
)

type Currency string

const (
	CurrencyUSD Currency = "USD"
	CurrencyAED Currency = "AED"
	CurrencyTJS Currency = "TJS"
	CurrencyRUB Currency = "RUB"
)

type Order struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// ── Основные реквизиты (из таблицы: REF#, OUR REF) ──────────────────────
	TrackingNumber string      `gorm:"uniqueIndex;not null" json:"tracking_number"` // REF#
	OurRef         string      `json:"our_ref"`                                     // OUR REF
	Status         OrderStatus `gorm:"not null;default:'new'" json:"status"`
	JobStatus      string      `gorm:"default:'OPEN'" json:"job_status"` // OPEN | CLOSED
	PaymentTiming  string      `gorm:"default:'on_dispatch'" json:"payment_timing"`

	// ── Тип и маршрут (JOB TYPE, ORG, DES) ───────────────────────────────────
	JobType       string `json:"job_type"`       // T-IN | L-EXP | T-OUT | T-EXP | GEN
	OriginCountry string `json:"origin_country"` // страна (необязательно)
	OriginCity    string `json:"origin_city"`    // ORG (аэропорт: DXB, MAN, TOO...)
	DestCountry   string `json:"dest_country"`
	DestCity      string `json:"dest_city"` // DES (аэропорт: CAI, DYU, SVO...)

	// ── Стороны (SUPPLIER, CUSTOMER, ASSIGNED) ────────────────────────────────
	Supplier  string `json:"supplier"` // SUPPLIER (название, не привязан к БД)
	ClientID  uint   `gorm:"not null" json:"client_id"`
	Client    Client `gorm:"foreignKey:ClientID" json:"client,omitempty"`

	AssignedToID *uint `json:"assigned_to_id"`
	AssignedTo   *User `gorm:"foreignKey:AssignedToID" json:"assigned_to,omitempty"`
	CreatedByID  uint  `json:"created_by_id"`
	CreatedBy    User  `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`

	// ── Получатель ────────────────────────────────────────────────────────────
	ReceiverName  string `json:"receiver_name"`
	ReceiverPhone string `json:"receiver_phone"`

	// ── Детали груза (NTR, #PC, KG, CWT, DIMS) ───────────────────────────────
	NTR              string  `gorm:"default:'GEN'" json:"ntr"`   // GEN | DG | PER | VAL | EAP
	Pieces           int     `gorm:"default:1" json:"pieces"`    // #PC
	WeightKG         float64 `json:"weight_kg"`                  // KG
	ChargeableWeight float64 `json:"chargeable_weight"`          // CWT
	Dimensions       string  `json:"dimensions"`                 // DIMS (45x32x61)
	HandedOver       bool    `gorm:"default:false" json:"handed_over"` // H.OVER

	// ── Стороны (SHIPPER 2, CONSIGNEE 2) ─────────────────────────────────────
	Shipper2   string `json:"shipper_2"`   // полные данные отправителя
	Consignee2 string `json:"consignee_2"` // полные данные получателя

	// ── AWB и документы ──────────────────────────────────────────────────────
	FinalAWB  string `json:"final_awb"`  // FINAL AWB
	XBDAWB    string `json:"xbd_awb"`    // XBD MILE AWB
	SVOAWB    string `json:"svo_awb"`    // MLE-SVO AWB
	BOENumber string `json:"boe_number"` // BOE#

	// ── Финансы ───────────────────────────────────────────────────────────────
	TotalAmount   float64  `gorm:"default:0" json:"total_amount"` // AMOUNT
	AddAmount     float64  `gorm:"default:0" json:"add_amount"`   // ADD AMOUNT
	Currency      Currency `gorm:"default:'USD'" json:"currency"`
	ExchangeRate  float64  `gorm:"default:3.67" json:"exchange_rate"` // Rate
	InvAmountUSD  float64  `gorm:"default:0" json:"inv_amount_usd"`   // INV AMOUNT (USD)
	InvAmountAED  float64  `gorm:"default:0" json:"inv_amount_aed"`   // INV AMOUNT (AED)
	InvoiceStatus string   `json:"invoice_status"`                    // Inv Sent | Pending | ...

	PaidAmount    float64 `gorm:"default:0" json:"paid_amount"`
	PaymentStatus string  `gorm:"default:'unpaid'" json:"payment_status"`

	// ── Уведомления ───────────────────────────────────────────────────────────
	CXNotified bool   `gorm:"default:false" json:"cx_notified"` // CX NOTIFIED
	Notes      string `json:"notes"`                            // Note
	Instr      string `json:"instr"`                            // INSTR

	// ── Связанные данные ──────────────────────────────────────────────────────
	Items    []CargoItem     `gorm:"foreignKey:OrderID" json:"items,omitempty"`
	Payments []Payment       `gorm:"foreignKey:OrderID" json:"payments,omitempty"`
	History  []StatusHistory `gorm:"foreignKey:OrderID" json:"history,omitempty"`
	AWB      *AWBData        `gorm:"foreignKey:OrderID" json:"awb,omitempty"`
}

type CargoItem struct {
	ID      uint `gorm:"primarykey" json:"id"`
	OrderID uint `gorm:"not null" json:"order_id"`

	Description   string   `json:"description"`
	Quantity      int      `gorm:"default:1" json:"quantity"`
	WeightKg      float64  `json:"weight_kg"`
	VolumeM3      float64  `json:"volume_m3"`
	DeclaredValue float64  `json:"declared_value"`
	Currency      Currency `gorm:"default:'USD'" json:"currency"`
}

type StatusHistory struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	OrderID   uint        `gorm:"not null" json:"order_id"`
	Status    OrderStatus `gorm:"not null" json:"status"`
	Note      string      `json:"note"`
	ChangedBy uint        `json:"changed_by"`
	User      User        `gorm:"foreignKey:ChangedBy" json:"user,omitempty"`
}
