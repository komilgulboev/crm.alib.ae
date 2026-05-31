package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/alib/crm/config"
	"github.com/alib/crm/internal/models"
	"github.com/alib/crm/internal/storage"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=UTC",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Client{},
		&models.Order{},
		&models.CargoItem{},
		&models.StatusHistory{},
		&models.Payment{},
		&models.BankAccount{},
		&models.Invoice{},
		&models.InvoiceLineItem{},
		&models.AWBData{},
	); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}

	// Убираем NOT NULL с полей которые стали необязательными
	db.Exec(`ALTER TABLE orders ALTER COLUMN origin_country DROP NOT NULL`)
	db.Exec(`ALTER TABLE orders ALTER COLUMN dest_country DROP NOT NULL`)
	db.Exec(`ALTER TABLE orders ALTER COLUMN origin_country SET DEFAULT ''`)
	db.Exec(`ALTER TABLE orders ALTER COLUMN dest_country SET DEFAULT ''`)

	minioClient, err := storage.NewMinIOClient(cfg)
	if err != nil {
		log.Printf("WARNING: MinIO not available: %v", err)
		minioClient = nil
	}

	r := gin.Default()

	allowedOrigins := []string{"http://localhost:5173"}
	if origin := os.Getenv("CORS_ORIGIN"); origin != "" {
		allowedOrigins = append(allowedOrigins, origin)
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	setupRoutes(r, db, cfg, minioClient)

	// Раздача фронтенда из папки dist (рядом с бинарником)
	if _, err := os.Stat("./dist"); err == nil {
		r.Static("/assets", "./dist/assets")
		r.StaticFile("/favicon.svg", "./dist/favicon.svg")
		r.NoRoute(func(c *gin.Context) {
			// API-роуты — вернуть 404 как есть
			if len(c.Request.URL.Path) > 4 && c.Request.URL.Path[:4] == "/api" {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}
			c.File("./dist/index.html")
		})
	}

	log.Printf("Alib CRM backend running on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
