package models

import "time"

type OrderNote struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	OrderID uint   `gorm:"not null;index" json:"order_id"`
	UserID  uint   `json:"user_id"`
	User    User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Text    string `gorm:"not null" json:"text"`
}
