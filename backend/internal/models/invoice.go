package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

type InvoiceStatus string

const (
	InvoiceStatusDraft InvoiceStatus = "draft"
	InvoiceStatusSent  InvoiceStatus = "sent"
	InvoiceStatusPaid  InvoiceStatus = "paid"
)

type Invoice struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	InvoiceNumber    string        `gorm:"uniqueIndex;not null" json:"invoice_number"`
	OrderID          uint          `gorm:"not null" json:"order_id"`
	Order            Order         `gorm:"foreignKey:OrderID" json:"order,omitempty"`

	InvoiceDate      time.Time     `json:"invoice_date"`
	DueDate          time.Time     `json:"due_date"`
	Terms            string        `gorm:"default:'Due on Receipt'" json:"terms"`
	ChargeableWeight float64       `gorm:"default:1" json:"chargeable_weight"`

	SubTotal    float64 `json:"sub_total"`
	TaxRate     float64 `gorm:"default:5" json:"tax_rate"`
	TaxAmount   float64 `json:"tax_amount"`
	TotalAmount float64 `json:"total_amount"`
	Currency    string  `gorm:"default:'AED'" json:"currency"`

	AcceptsCash bool          `gorm:"default:false" json:"accepts_cash"`
	Status      InvoiceStatus `gorm:"default:'draft'" json:"status"`
	Notes       string        `json:"notes"`

	LineItems    []InvoiceLineItem `gorm:"foreignKey:InvoiceID;constraint:OnDelete:CASCADE" json:"line_items,omitempty"`
	BankAccounts []BankAccount     `gorm:"many2many:invoice_bank_accounts;" json:"bank_accounts,omitempty"`

	CreatedByID uint `json:"created_by_id"`
	CreatedBy   User `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`
}

type InvoiceLineItem struct {
	ID            uint    `gorm:"primarykey" json:"id"`
	InvoiceID     uint    `gorm:"not null" json:"invoice_id"`
	Description   string  `json:"description"`
	Quantity      float64 `gorm:"default:1" json:"quantity"`
	Rate          float64 `json:"rate"`
	TaxableAmount float64 `json:"taxable_amount"`
	TaxRate       float64 `gorm:"default:5" json:"tax_rate"`
	TaxAmount     float64 `json:"tax_amount"`
	Amount        float64 `json:"amount"`
}

func GenerateInvoiceNumber(db *gorm.DB) string {
	var count int64
	db.Model(&Invoice{}).Unscoped().Count(&count)
	return fmt.Sprintf("INV-%06d", count+1)
}
