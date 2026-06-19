package models

import "time"

type TransitEmailConfig struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	TransitCode string    `gorm:"not null;index" json:"transit_code"` // CAI, MLE, SVO ...
	Emails      string    `gorm:"not null" json:"emails"`             // comma-separated
	Description string    `json:"description"`
	Active      bool      `gorm:"default:true" json:"active"`
}
