package models

type OrderSupplier struct {
	ID       uint   `gorm:"primarykey" json:"id"`
	OrderID  uint   `gorm:"not null;index" json:"order_id"`
	Supplier string `json:"supplier"`
	JobType  string `json:"job_type"`
}
