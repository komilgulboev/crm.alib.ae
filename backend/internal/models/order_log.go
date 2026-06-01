package models

import "time"

type OrderLog struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	OrderID  uint   `gorm:"not null;index" json:"order_id"`
	UserID   uint   `json:"user_id"`
	User     User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Action   string `json:"action"`    // created | updated
	Field    string `json:"field"`     // "Статус", "Поставщик", ...
	OldValue string `json:"old_value"`
	NewValue string `json:"new_value"`
}
