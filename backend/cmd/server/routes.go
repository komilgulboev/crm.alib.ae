package main

import (
	"github.com/alib/crm/config"
	"github.com/alib/crm/internal/handlers"
	"github.com/alib/crm/internal/middleware"
	"github.com/alib/crm/internal/models"
	"github.com/alib/crm/internal/storage"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func setupRoutes(r *gin.Engine, db *gorm.DB, cfg *config.Config, minio *storage.MinIOClient) {
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	clientHandler := handlers.NewClientHandler(db)
	orderHandler := handlers.NewOrderHandler(db)
	paymentHandler := handlers.NewPaymentHandler(db)
	userHandler := handlers.NewUserHandler(db)
	bankAccountHandler := handlers.NewBankAccountHandler(db)
	invoiceHandler := handlers.NewInvoiceHandler(db)
	fileHandler := handlers.NewFileHandler(db, minio, cfg.AnthropicKey)

	api := r.Group("/api/v1")

	// Публичные маршруты
	api.POST("/auth/login", authHandler.Login)

	// Защищённые маршруты
	protected := api.Group("/")
	protected.Use(middleware.Auth(cfg.JWTSecret))

	// Auth
	protected.GET("/auth/me", authHandler.Me)
	protected.POST("/auth/logout", authHandler.Logout)

	// Пользователи (только суперадмин)
	users := protected.Group("/users")
	users.Use(middleware.RequireRoles(models.RoleSuperAdmin))
	users.GET("", userHandler.List)
	users.POST("", userHandler.Create)
	users.PUT("/:id", userHandler.Update)
	users.DELETE("/:id", userHandler.Delete)

	// Клиенты
	clients := protected.Group("/clients")
	clients.GET("", clientHandler.List)
	clients.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager), clientHandler.Create)
	clients.GET("/:id", clientHandler.Get)
	clients.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager), clientHandler.Update)
	clients.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin), clientHandler.Delete)

	// Заказы
	orders := protected.Group("/orders")
	orders.GET("", orderHandler.List)
	orders.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager), orderHandler.Create)
	orders.GET("/:id", orderHandler.Get)
	orders.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager), orderHandler.Update)
	orders.PATCH("/:id/status", orderHandler.UpdateStatus)
	orders.POST("/:id/issue", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager, models.RoleWarehouse), orderHandler.IssueFromWarehouse)
	orders.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin), orderHandler.Delete)

	// Платежи
	payments := protected.Group("/payments")
	payments.GET("", paymentHandler.List)
	payments.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager, models.RoleAccountant), paymentHandler.Create)
	payments.GET("/order/:order_id", paymentHandler.ListByOrder)

	// Банковские счета
	bankAccounts := protected.Group("/bank-accounts")
	bankAccounts.GET("", bankAccountHandler.List)
	bankAccounts.POST("", middleware.RequireRoles(models.RoleSuperAdmin), bankAccountHandler.Create)
	bankAccounts.PUT("/:id", middleware.RequireRoles(models.RoleSuperAdmin), bankAccountHandler.Update)
	bankAccounts.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin), bankAccountHandler.Delete)

	// Инвойсы
	invoices := protected.Group("/invoices")
	invoices.GET("/order/:order_id", invoiceHandler.ListByOrder)
	invoices.GET("/:id", invoiceHandler.Get)
	invoices.POST("", middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager, models.RoleAccountant), invoiceHandler.Create)
	invoices.DELETE("/:id", middleware.RequireRoles(models.RoleSuperAdmin), invoiceHandler.Delete)

	// Загрузка файлов AWB
	files := protected.Group("/files")
	files.POST("/awb",
		middleware.RequireRoles(models.RoleSuperAdmin, models.RoleManager, models.RoleAccountant),
		fileHandler.UploadAWB,
	)

	// Дашборд / статистика
	protected.GET("/dashboard/stats", orderHandler.DashboardStats)
}
