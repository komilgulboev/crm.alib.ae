package models

import "time"

// Legacy constants kept for the startup migration in main.go.
// The category field now accepts any string (configurable via catalog type "doc_category").
const (
	DocCategoryInvoice     = "invoice"
	DocCategoryPackingList = "packing_list"
	DocCategoryBOE         = "boe"
)

type OrderDocument struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	OrderID  uint   `gorm:"not null;index" json:"order_id"`
	Category string `gorm:"not null" json:"category"` // configurable via catalog type "doc_category"
	FileKey  string `gorm:"not null" json:"file_key"`
	FileURL  string `gorm:"not null" json:"file_url"`
	FileName string `json:"file_name"`
}
