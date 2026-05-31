package main

import (
	"fmt"
	"log"

	"github.com/alib/crm/config"
	"github.com/alib/crm/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}

	// Удаляем старого admin если есть
	db.Unscoped().Where("email = ?", "admin@alib.ae").Delete(&models.User{})

	admin := models.User{
		Name:  "Admin",
		Email: "admin@alib.ae",
		Phone: "+971501234567",
		Role:  models.RoleSuperAdmin,
	}
	if err := admin.HashPassword("Admin123!"); err != nil {
		log.Fatalf("hash: %v", err)
	}
	if err := db.Create(&admin).Error; err != nil {
		log.Fatalf("create: %v", err)
	}
	log.Printf("Admin created: id=%d email=%s", admin.ID, admin.Email)
}
