package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

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
		&models.CatalogEntry{},
		&models.OrderLog{},
		&models.OrderNote{},
		&models.OrderDocument{},
	); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}

	// Миграция старых BOE файлов (boe_file_1/2/3) в таблицу order_documents
	var ordersWithOldFiles []models.Order
	db.Where("boe_file_1_url != '' OR boe_file_2_url != '' OR boe_file_3_url != ''").Find(&ordersWithOldFiles)
	for _, o := range ordersWithOldFiles {
		var count int64
		db.Model(&models.OrderDocument{}).Where("order_id = ?", o.ID).Count(&count)
		if count == 0 {
			var docs []models.OrderDocument
			if o.BOEFile1URL != "" {
				docs = append(docs, models.OrderDocument{OrderID: o.ID, Category: models.DocCategoryInvoice, FileKey: o.BOEFile1Key, FileURL: o.BOEFile1URL, FileName: "Инвойс"})
			}
			if o.BOEFile2URL != "" {
				docs = append(docs, models.OrderDocument{OrderID: o.ID, Category: models.DocCategoryPackingList, FileKey: o.BOEFile2Key, FileURL: o.BOEFile2URL, FileName: "Packing List"})
			}
			if o.BOEFile3URL != "" {
				docs = append(docs, models.OrderDocument{OrderID: o.ID, Category: models.DocCategoryBOE, FileKey: o.BOEFile3Key, FileURL: o.BOEFile3URL, FileName: "BOE файл"})
			}
			if len(docs) > 0 {
				db.Create(&docs)
			}
		}
	}

	// Seed job_type catalog if empty
	var jobTypeCount int64
	db.Model(&models.CatalogEntry{}).Where("type = ?", "job_type").Count(&jobTypeCount)
	if jobTypeCount == 0 {
		seeds := []models.CatalogEntry{
			{Type: "job_type", Value: "T-IN",  Label: "T-IN — Transport Import",  SortOrder: 1, Active: true},
			{Type: "job_type", Value: "L-EXP", Label: "L-EXP — Local Export",     SortOrder: 2, Active: true},
			{Type: "job_type", Value: "T-OUT", Label: "T-OUT — Transport Out",     SortOrder: 3, Active: true},
			{Type: "job_type", Value: "T-EXP", Label: "T-EXP — Transport Export",  SortOrder: 4, Active: true},
			{Type: "job_type", Value: "GEN",   Label: "GEN — General",             SortOrder: 5, Active: true},
		}
		db.Create(&seeds)
	}

	// Seed order_status catalog if empty
	var statusCount int64
	db.Model(&models.CatalogEntry{}).Where("type = ?", "order_status").Count(&statusCount)
	if statusCount == 0 {
		seeds := []models.CatalogEntry{
			{Type: "order_status", Value: "new",                Label: "Новый",             SortOrder: 1,  Active: true},
			{Type: "order_status", Value: "accepted",           Label: "Принят",            SortOrder: 2,  Active: true},
			{Type: "order_status", Value: "collection_details", Label: "Collection Details", SortOrder: 3,  Active: true},
			{Type: "order_status", Value: "warehouse",          Label: "На складе",         SortOrder: 4,  Active: true},
			{Type: "order_status", Value: "dispatched",         Label: "Отправлен",         SortOrder: 5,  Active: true},
			{Type: "order_status", Value: "in_transit",         Label: "В пути",            SortOrder: 6,  Active: true},
			{Type: "order_status", Value: "customs",            Label: "На таможне",        SortOrder: 7,  Active: true},
			{Type: "order_status", Value: "departed",           Label: "Departed",          SortOrder: 8,  Active: true},
			{Type: "order_status", Value: "arrived",            Label: "Arrived",           SortOrder: 9,  Active: true},
			{Type: "order_status", Value: "handed_over",        Label: "Handed Over",       SortOrder: 10, Active: true},
			{Type: "order_status", Value: "delivered",          Label: "Доставлен",         SortOrder: 11, Active: true},
			{Type: "order_status", Value: "completed",          Label: "Completed",         SortOrder: 12, Active: true},
			{Type: "order_status", Value: "closed",             Label: "Closed",            SortOrder: 13, Active: true},
			{Type: "order_status", Value: "problem",            Label: "Проблема",          SortOrder: 14, Active: true},
		}
		db.Create(&seeds)
	}

	// Seed ntr catalog if empty
	var ntrCount int64
	db.Model(&models.CatalogEntry{}).Where("type = ?", "ntr").Count(&ntrCount)
	if ntrCount == 0 {
		seeds := []models.CatalogEntry{
			{Type: "ntr", Value: "GEN", Label: "GEN — General",              SortOrder: 1, Active: true},
			{Type: "ntr", Value: "DG",  Label: "DG — Dangerous Goods",       SortOrder: 2, Active: true},
			{Type: "ntr", Value: "PER", Label: "PER — Perishables",           SortOrder: 3, Active: true},
			{Type: "ntr", Value: "VAL", Label: "VAL — Valuables",             SortOrder: 4, Active: true},
			{Type: "ntr", Value: "EAP", Label: "EAP — Express Air Parcel",    SortOrder: 5, Active: true},
		}
		db.Create(&seeds)
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

	// Раздача фронтенда
	if useEmbedded {
		// Продакшн: фронтенд встроен в бинарник
		sub, _ := fs.Sub(staticFiles, "dist")
		fileServer := http.FileServer(http.FS(sub))
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}
			// Проверяем, существует ли файл в embedded FS
			cleanPath := strings.TrimPrefix(path, "/")
			if cleanPath == "" {
				cleanPath = "index.html"
			}
			f, err := sub.Open(cleanPath)
			if err != nil {
				// SPA: все неизвестные пути → index.html
				data, _ := staticFiles.ReadFile("dist/index.html")
				c.Data(http.StatusOK, "text/html; charset=utf-8", data)
				return
			}
			f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	} else if _, err := os.Stat("./dist"); err == nil {
		// Разработка: раздача из папки dist рядом с бинарником
		r.Static("/assets", "./dist/assets")
		r.StaticFile("/favicon.svg", "./dist/favicon.svg")
		r.NoRoute(func(c *gin.Context) {
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
