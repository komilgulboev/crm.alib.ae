package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Role string

const (
	RoleSuperAdmin Role = "superadmin"
	RoleManager    Role = "manager"
	RoleWarehouse  Role = "warehouse"
	RoleAccountant Role = "accountant"
	RoleDriver     Role = "driver"
	RoleClient     Role = "client"
)

type User struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Name           string `gorm:"not null" json:"name"`
	Email          string `gorm:"uniqueIndex;not null" json:"email"`
	Phone          string `json:"phone"`
	Password       string `gorm:"not null" json:"-"`
	Role           Role   `gorm:"not null;default:'manager'" json:"role"`
	Active         bool   `gorm:"default:true" json:"active"`
	TelegramChatID string `json:"telegram_chat_id"`
}

func (u *User) HashPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.Password = string(hash)
	return nil
}

func (u *User) CheckPassword(password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password)) == nil
}
