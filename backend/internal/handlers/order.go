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

	h.db.Create(&models.OrderLog{
		OrderID: order.ID,
		UserID:  order.CreatedByID,
		Action:  "created",
	})

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

	// Логируем изменения
	claims, _ := c.Get(middleware.UserKey)
	userID := claims.(*auth.Claims).UserID
	h.logChanges(existing.ID, userID, &existing, &req)

	h.db.Preload("Client").Preload("AssignedTo").Preload("AWB").First(&req, existing.ID)
	c.JSON(http.StatusOK, req)
}

func (h *OrderHandler) GetLogs(c *gin.Context) {
	var logs []models.OrderLog
	if err := h.db.Preload("User").
		Where("order_id = ?", c.Param("id")).
		Order("created_at DESC").
		Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, logs)
}

// ── Вспомогательные функции логирования ──────────────────────────────────────

func (h *OrderHandler) logChanges(orderID, userID uint, old, new *models.Order) {
	ff := func(f float64) string {
		if f == 0 {
			return ""
		}
		return fmt.Sprintf("%.2f", f)
	}
	fi := func(i int) string { return fmt.Sprintf("%d", i) }
	fb := func(b bool) string {
		if b {
			return "Да"
		}
		return "Нет"
	}
	fp := func(p *uint) uint {
		if p == nil {
			return 0
		}
		return *p
	}

	type fd struct{ name, o, n string }
	fields := []fd{
		{"Статус", string(old.Status), string(new.Status)},
		{"Job Status", old.JobStatus, new.JobStatus},
		{"Приоритет", old.Priority, new.Priority},
		{"Тип работы", old.JobType, new.JobType},
		{"Тип рейса", old.FlightType, new.FlightType},
		{"OUR REF", old.OurRef, new.OurRef},
		{"Поставщик", old.Supplier, new.Supplier},
		{"Откуда", old.OriginCity, new.OriginCity},
		{"Куда", old.DestCity, new.DestCity},
		{"NTR", old.NTR, new.NTR},
		{"Мест", fi(old.Pieces), fi(new.Pieces)},
		{"Вес кг", ff(old.WeightKG), ff(new.WeightKG)},
		{"CWT", ff(old.ChargeableWeight), ff(new.ChargeableWeight)},
		{"Размеры", old.Dimensions, new.Dimensions},
		{"H.OVER", fb(old.HandedOver), fb(new.HandedOver)},
		{"BOE#", old.BOENumber, new.BOENumber},
		{"Получатель", old.ReceiverName, new.ReceiverName},
		{"Тел.", old.ReceiverPhone, new.ReceiverPhone},
		{"Final AWB", old.FinalAWB, new.FinalAWB},
		{"XBD AWB", old.XBDAWB, new.XBDAWB},
		{"SVO AWB", old.SVOAWB, new.SVOAWB},
		{"Сумма", ff(old.TotalAmount), ff(new.TotalAmount)},
		{"Доп. сумма", ff(old.AddAmount), ff(new.AddAmount)},
		{"Валюта", string(old.Currency), string(new.Currency)},
		{"Статус инвойса", old.InvoiceStatus, new.InvoiceStatus},
		{"Оплата", old.PaymentTiming, new.PaymentTiming},
	}

	// FK-поля — резолвим имена
	if old.ClientID != new.ClientID {
		fields = append(fields, fd{"Клиент",
			h.resolveClientName(old.ClientID),
			h.resolveClientName(new.ClientID),
		})
	}
	if fp(old.AssignedToID) != fp(new.AssignedToID) {
		fields = append(fields, fd{"Ответственный",
			h.resolveUserName(old.AssignedToID),
			h.resolveUserName(new.AssignedToID),
		})
	}

	var logs []models.OrderLog
	for _, f := range fields {
		if f.o != f.n {
			logs = append(logs, models.OrderLog{
				OrderID:  orderID,
				UserID:   userID,
				Action:   "updated",
				Field:    f.name,
				OldValue: f.o,
				NewValue: f.n,
			})
		}
	}
	if len(logs) > 0 {
		h.db.Create(&logs)
	}
}

func (h *OrderHandler) resolveClientName(id uint) string {
	if id == 0 {
		return "—"
	}
	var c models.Client
	if h.db.Select("name").First(&c, id).Error != nil {
		return fmt.Sprintf("#%d", id)
	}
	return c.Name
}

func (h *OrderHandler) resolveUserName(id *uint) string {
	if id == nil || *id == 0 {
		return "—"
	}
	var u models.User
	if h.db.Select("name").First(&u, *id).Error != nil {
		return fmt.Sprintf("#%d", *id)
	}
	return u.Name
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

	oldStatus := order.Status
	h.db.Model(&order).Update("status", req.Status)
	h.db.Create(&models.StatusHistory{
		OrderID:   order.ID,
		Status:    req.Status,
		Note:      req.Note,
		ChangedBy: userID,
	})
	h.db.Create(&models.OrderLog{
		OrderID:  order.ID,
		UserID:   userID,
		Action:   "updated",
		Field:    "Статус",
		OldValue: string(oldStatus),
		NewValue: string(req.Status),
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
