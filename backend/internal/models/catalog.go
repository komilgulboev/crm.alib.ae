package models

import (
	"time"

	"gorm.io/gorm"
)

type CatalogEntry struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Type      string `gorm:"not null;index" json:"type"`       // job_type, ntr, ...
	Value     string `gorm:"not null" json:"value"`            // T-IN, GEN, ...
	Label     string `gorm:"not null" json:"label"`            // T-IN — Transport Import
	SortOrder int    `gorm:"default:0" json:"sort_order"`
	Active    bool   `gorm:"default:true" json:"active"`
}
