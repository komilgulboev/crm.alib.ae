package models

import (
	"time"

	"gorm.io/gorm"
)

type Client struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Name        string  `gorm:"not null" json:"name"`
	Phone       string  `gorm:"not null" json:"phone"`
	WhatsApp    string  `json:"whatsapp"`
	Email       string  `json:"email"`
	Address     string  `json:"address"`
	Country     string  `json:"country"`
	TRN         string  `json:"trn"`
	Notes       string  `json:"notes"`
	Balance     float64 `gorm:"default:0" json:"balance"`
	Currency    string  `gorm:"default:'USD'" json:"currency"`
	Active      bool    `gorm:"default:true" json:"active"`

	Orders []Order `gorm:"foreignKey:ClientID" json:"orders,omitempty"`
}
