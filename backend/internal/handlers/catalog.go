package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CatalogHandler struct {
	db *gorm.DB
}

func NewCatalogHandler(db *gorm.DB) *CatalogHandler {
	return &CatalogHandler{db: db}
}

func (h *CatalogHandler) List(c *gin.Context) {
	var entries []models.CatalogEntry
	q := h.db.Order("sort_order ASC, created_at ASC")
	if t := c.Query("type"); t != "" {
		q = q.Where("type = ?", t)
	}
	if c.Query("active") == "true" {
		q = q.Where("active = true")
	}
	if err := q.Find(&entries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entries)
}

func (h *CatalogHandler) Create(c *gin.Context) {
	var entry models.CatalogEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if entry.Type == "" || entry.Value == "" || entry.Label == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type, value and label are required"})
		return
	}
	if err := h.db.Create(&entry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, entry)
}

func (h *CatalogHandler) Update(c *gin.Context) {
	var entry models.CatalogEntry
	if err := h.db.First(&entry, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Save(&entry)
	c.JSON(http.StatusOK, entry)
}

func (h *CatalogHandler) Delete(c *gin.Context) {
	if err := h.db.Delete(&models.CatalogEntry{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
