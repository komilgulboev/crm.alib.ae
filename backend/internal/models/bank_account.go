package models

import (
	"time"

	"gorm.io/gorm"
)

type BankAccount struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	AccountName   string `gorm:"not null" json:"account_name"`
	BankName      string `gorm:"not null" json:"bank_name"`
	SwiftCode     string `json:"swift_code"`
	AccountNumber string `json:"account_number"`
	IBAN          string `json:"iban"`
	Currency      string `gorm:"not null" json:"currency"`
	Active        bool   `gorm:"default:true" json:"active"`
}
