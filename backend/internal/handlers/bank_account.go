package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type BankAccountHandler struct {
	db *gorm.DB
}

func NewBankAccountHandler(db *gorm.DB) *BankAccountHandler {
	return &BankAccountHandler{db: db}
}

func (h *BankAccountHandler) List(c *gin.Context) {
	var accounts []models.BankAccount
	q := h.db.Order("created_at ASC")
	if c.Query("active") == "true" {
		q = q.Where("active = true")
	}
	if err := q.Find(&accounts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, accounts)
}

func (h *BankAccountHandler) Create(c *gin.Context) {
	var acc models.BankAccount
	if err := c.ShouldBindJSON(&acc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.Create(&acc).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, acc)
}

func (h *BankAccountHandler) Update(c *gin.Context) {
	var acc models.BankAccount
	if err := h.db.First(&acc, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := c.ShouldBindJSON(&acc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Save(&acc)
	c.JSON(http.StatusOK, acc)
}

func (h *BankAccountHandler) Delete(c *gin.Context) {
	if err := h.db.Delete(&models.BankAccount{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
