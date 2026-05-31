package handlers

import (
	"net/http"
	"time"

	"github.com/alib/crm/internal/auth"
	"github.com/alib/crm/internal/middleware"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type InvoiceHandler struct {
	db *gorm.DB
}

func NewInvoiceHandler(db *gorm.DB) *InvoiceHandler {
	return &InvoiceHandler{db: db}
}

func (h *InvoiceHandler) ListByOrder(c *gin.Context) {
	var invoices []models.Invoice
	if err := h.db.
		Preload("LineItems").
		Preload("BankAccounts").
		Preload("Order.Client").
		Where("order_id = ?", c.Param("order_id")).
		Order("created_at DESC").
		Find(&invoices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, invoices)
}

func (h *InvoiceHandler) Get(c *gin.Context) {
	var invoice models.Invoice
	if err := h.db.
		Preload("LineItems").
		Preload("BankAccounts").
		Preload("Order.Client").
		Preload("CreatedBy").
		First(&invoice, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}
	c.JSON(http.StatusOK, invoice)
}

type createInvoiceRequest struct {
	OrderID          uint                     `json:"order_id" binding:"required"`
	InvoiceDate      *time.Time               `json:"invoice_date"`
	DueDate          *time.Time               `json:"due_date"`
	Terms            string                   `json:"terms"`
	ChargeableWeight float64                  `json:"chargeable_weight"`
	TaxRate          float64                  `json:"tax_rate"`
	Currency         string                   `json:"currency"`
	AcceptsCash      bool                     `json:"accepts_cash"`
	Notes            string                   `json:"notes"`
	LineItems        []models.InvoiceLineItem `json:"line_items"`
	BankAccountIDs   []uint                   `json:"bank_account_ids"`
}

func (h *InvoiceHandler) Create(c *gin.Context) {
	var req createInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, _ := c.Get(middleware.UserKey)
	userID := claims.(*auth.Claims).UserID

	taxRate := req.TaxRate
	if taxRate == 0 {
		taxRate = 5
	}

	var subTotal float64
	for i := range req.LineItems {
		item := &req.LineItems[i]
		item.TaxableAmount = item.Quantity * item.Rate
		item.TaxRate = taxRate
		item.TaxAmount = item.TaxableAmount * taxRate / 100
		item.Amount = item.TaxableAmount + item.TaxAmount
		subTotal += item.TaxableAmount
	}
	taxAmount := subTotal * taxRate / 100

	now := time.Now()
	invoiceDate, dueDate := now, now
	if req.InvoiceDate != nil {
		invoiceDate = *req.InvoiceDate
	}
	if req.DueDate != nil {
		dueDate = *req.DueDate
	}
	terms := req.Terms
	if terms == "" {
		terms = "Due on Receipt"
	}
	currency := req.Currency
	if currency == "" {
		currency = "AED"
	}
	chargeableWeight := req.ChargeableWeight
	if chargeableWeight == 0 {
		chargeableWeight = 1
	}

	invoice := models.Invoice{
		InvoiceNumber:    models.GenerateInvoiceNumber(h.db),
		OrderID:          req.OrderID,
		InvoiceDate:      invoiceDate,
		DueDate:          dueDate,
		Terms:            terms,
		ChargeableWeight: chargeableWeight,
		TaxRate:          taxRate,
		SubTotal:         subTotal,
		TaxAmount:        taxAmount,
		TotalAmount:      subTotal + taxAmount,
		Currency:         currency,
		AcceptsCash:      req.AcceptsCash,
		Notes:            req.Notes,
		LineItems:        req.LineItems,
		CreatedByID:      userID,
	}

	if err := h.db.Create(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(req.BankAccountIDs) > 0 {
		var accounts []models.BankAccount
		h.db.Where("id IN ?", req.BankAccountIDs).Find(&accounts)
		h.db.Model(&invoice).Association("BankAccounts").Replace(accounts)
	}

	h.db.Preload("LineItems").Preload("BankAccounts").Preload("Order.Client").First(&invoice, invoice.ID)
	c.JSON(http.StatusCreated, invoice)
}

func (h *InvoiceHandler) Delete(c *gin.Context) {
	if err := h.db.Delete(&models.Invoice{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
