package handlers

import (
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/alib/crm/internal/auth"
	"github.com/alib/crm/internal/middleware"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type OrderHandler struct {
	db *gorm.DB
}

func NewOrderHandler(db *gorm.DB) *OrderHandler {
	return &OrderHandler{db: db}
}

func (h *OrderHandler) List(c *gin.Context) {
	var orders []models.Order
	q := h.db.Preload("Client").Preload("AssignedTo")

	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if jobStatus := c.Query("job_status"); jobStatus != "" {
		q = q.Where("job_status = ?", jobStatus)
	}
	if jobType := c.Query("job_type"); jobType != "" {
		q = q.Where("job_type = ?", jobType)
	}
	if clientID := c.Query("client_id"); clientID != "" {
		q = q.Where("client_id = ?", clientID)
	}
	if supplier := c.Query("supplier"); supplier != "" {
		q = q.Where("supplier ILIKE ?", "%"+supplier+"%")
	}
	if from := c.Query("date_from"); from != "" {
		q = q.Where("created_at >= ?", from)
	}
	if to := c.Query("date_to"); to != "" {
		q = q.Where("created_at <= ?", to)
	}

	if err := q.Order("created_at DESC").Find(&orders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, orders)
}

func (h *OrderHandler) Get(c *gin.Context) {
	var order models.Order
	err := h.db.
		Preload("Client").
		Preload("Items").
		Preload("Payments.User").
		Preload("History.User").
		Preload("AssignedTo").
		Preload("CreatedBy").
		Preload("AWB").
		First(&order, c.Param("id")).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (h *OrderHandler) Create(c *gin.Context) {
	var order models.Order
	if err := c.ShouldBindJSON(&order); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, _ := c.Get(middleware.UserKey)
	order.CreatedByID = claims.(*auth.Claims).UserID
	order.TrackingNumber = generateTrackingNumber()

	// Статус по умолчанию только если не указан
	if order.Status == "" {
		order.Status = models.StatusNew
	}
	if order.JobStatus == "" {
		order.JobStatus = "OPEN"
	}
	if order.ExchangeRate == 0 {
		order.ExchangeRate = 3.67
	}

	// AWB сохраняется отдельно после создания заказа
	awb := order.AWB
	order.AWB = nil

	if err := h.db.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if awb != nil {
		awb.OrderID = &order.ID
		h.db.Create(awb)
	}

	h.db.Preload("Client").Preload("AssignedTo").Preload("AWB").First(&order, order.ID)
	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) Update(c *gin.Context) {
	var existing models.Order
	if err := h.db.First(&existing, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	var req models.Order
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Не перезаписываем системные поля
	req.ID = existing.ID
	req.TrackingNumber = existing.TrackingNumber
	req.CreatedByID = existing.CreatedByID
	req.CreatedAt = existing.CreatedAt
	req.PaidAmount = existing.PaidAmount
	req.PaymentStatus = existing.PaymentStatus

	// AWB обновляем отдельно
	awb := req.AWB
	req.AWB = nil

	if err := h.db.Save(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if awb != nil {
		awb.OrderID = &existing.ID
		var existingAWB models.AWBData
		if h.db.Where("order_id = ?", existing.ID).First(&existingAWB).Error == nil {
			awb.ID = existingAWB.ID
			h.db.Save(awb)
		} else {
			h.db.Create(awb)
		}
	}

	h.db.Preload("Client").Preload("AssignedTo").Preload("AWB").First(&req, existing.ID)
	c.JSON(http.StatusOK, req)
}

type updateStatusRequest struct {
	Status models.OrderStatus `json:"status" binding:"required"`
	Note   string             `json:"note"`
}

func (h *OrderHandler) UpdateStatus(c *gin.Context) {
	var req updateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.First(&order, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	claims, _ := c.Get(middleware.UserKey)
	userID := claims.(*auth.Claims).UserID

	h.db.Model(&order).Update("status", req.Status)
	h.db.Create(&models.StatusHistory{
		OrderID:   order.ID,
		Status:    req.Status,
		Note:      req.Note,
		ChangedBy: userID,
	})

	c.JSON(http.StatusOK, gin.H{"status": req.Status})
}

func (h *OrderHandler) Delete(c *gin.Context) {
	if err := h.db.Delete(&models.Order{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *OrderHandler) DashboardStats(c *gin.Context) {
	var totalOrders, newOrders, inTransitOrders, deliveredOrders int64
	var totalRevenue float64

	h.db.Model(&models.Order{}).Count(&totalOrders)
	h.db.Model(&models.Order{}).Where("status = ?", models.StatusNew).Count(&newOrders)
	h.db.Model(&models.Order{}).Where("status IN ?", []models.OrderStatus{
		models.StatusDispatched, models.StatusInTransit, models.StatusCustoms,
		models.StatusDeparted,
	}).Count(&inTransitOrders)
	h.db.Model(&models.Order{}).Where("status IN ?", []models.OrderStatus{
		models.StatusDelivered, models.StatusCompleted,
	}).Count(&deliveredOrders)
	h.db.Model(&models.Payment{}).Select("COALESCE(SUM(amount_usd), 0)").Scan(&totalRevenue)

	c.JSON(http.StatusOK, gin.H{
		"total_orders":      totalOrders,
		"new_orders":        newOrders,
		"in_transit":        inTransitOrders,
		"delivered":         deliveredOrders,
		"total_revenue_usd": totalRevenue,
	})
}

func (h *OrderHandler) IssueFromWarehouse(c *gin.Context) {
	var order models.Order
	if err := h.db.First(&order, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.Status != models.StatusWarehouse {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is not in warehouse status"})
		return
	}

	claims, _ := c.Get(middleware.UserKey)
	userID := claims.(*auth.Claims).UserID

	var req struct {
		Note string `json:"note"`
	}
	c.ShouldBindJSON(&req)

	h.db.Model(&order).Update("status", models.StatusDispatched)
	h.db.Create(&models.StatusHistory{
		OrderID:   order.ID,
		Status:    models.StatusDispatched,
		Note:      req.Note,
		ChangedBy: userID,
	})

	c.JSON(http.StatusOK, gin.H{"status": models.StatusDispatched, "message": "issued from warehouse"})
}

func generateTrackingNumber() string {
	src := rand.NewSource(time.Now().UnixNano())
	r := rand.New(src)
	return fmt.Sprintf("ALB-%d-%04d", time.Now().Year(), r.Intn(9000)+1000)
}
