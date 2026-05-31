package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/auth"
	"github.com/alib/crm/internal/middleware"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PaymentHandler struct {
	db *gorm.DB
}

func NewPaymentHandler(db *gorm.DB) *PaymentHandler {
	return &PaymentHandler{db: db}
}

func (h *PaymentHandler) List(c *gin.Context) {
	var payments []models.Payment
	if err := h.db.Preload("User").Order("created_at DESC").Find(&payments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, payments)
}

func (h *PaymentHandler) ListByOrder(c *gin.Context) {
	var payments []models.Payment
	if err := h.db.Where("order_id = ?", c.Param("order_id")).
		Preload("User").Order("created_at DESC").Find(&payments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, payments)
}

func (h *PaymentHandler) Create(c *gin.Context) {
	var payment models.Payment
	if err := c.ShouldBindJSON(&payment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, _ := c.Get(middleware.UserKey)
	payment.ReceivedBy = claims.(*auth.Claims).UserID

	// Нормализуем в USD
	if payment.ExchangeRate > 0 {
		payment.AmountUSD = payment.Amount / payment.ExchangeRate
	} else {
		payment.AmountUSD = payment.Amount
	}

	if err := h.db.Create(&payment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Обновляем paid_amount в заказе
	h.db.Exec(`
		UPDATE orders SET paid_amount = (
			SELECT COALESCE(SUM(amount_usd), 0) FROM payments WHERE order_id = ?
		),
		payment_status = CASE
			WHEN (SELECT COALESCE(SUM(amount_usd), 0) FROM payments WHERE order_id = ?) >= total_amount THEN 'paid'
			WHEN (SELECT COALESCE(SUM(amount_usd), 0) FROM payments WHERE order_id = ?) > 0 THEN 'partial'
			ELSE 'unpaid'
		END
		WHERE id = ?`,
		payment.OrderID, payment.OrderID, payment.OrderID, payment.OrderID,
	)

	c.JSON(http.StatusCreated, payment)
}
