package models

import "time"

type PaymentMethod string

const (
	PaymentCash     PaymentMethod = "cash"
	PaymentTransfer PaymentMethod = "bank_transfer"
	PaymentCard     PaymentMethod = "card"
	PaymentCrypto   PaymentMethod = "crypto"
)

type Payment struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	OrderID      uint          `gorm:"not null" json:"order_id"`
	Amount       float64       `gorm:"not null" json:"amount"`
	Currency     Currency      `gorm:"not null" json:"currency"`
	ExchangeRate float64       `gorm:"default:1" json:"exchange_rate"`
	AmountUSD    float64       `json:"amount_usd"` // нормализованная сумма в USD
	Method       PaymentMethod `gorm:"not null" json:"method"`
	Note         string        `json:"note"`
	ReceivedBy   uint          `json:"received_by"`
	User         User          `gorm:"foreignKey:ReceivedBy" json:"user,omitempty"`
}
