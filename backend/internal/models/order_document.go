package models

import "time"

type DocCategory string

const (
	DocCategoryInvoice     DocCategory = "invoice"
	DocCategoryPackingList DocCategory = "packing_list"
	DocCategoryBOE         DocCategory = "boe"
)

type OrderDocument struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	OrderID  uint        `gorm:"not null;index" json:"order_id"`
	Category DocCategory `gorm:"not null" json:"category"` // invoice | packing_list | boe
	FileKey  string      `gorm:"not null" json:"file_key"`
	FileURL  string      `gorm:"not null" json:"file_url"`
	FileName string      `json:"file_name"`
}
